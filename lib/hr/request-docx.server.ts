import fs from "node:fs/promises"
import path from "node:path"
import Docxtemplater from "docxtemplater"
import PizZip from "pizzip"
import type { HrRequest } from "@/lib/hr/types"
import { hrRequestKindLabel } from "@/lib/hr/hr-requests"
import { adminDb } from "@/lib/firebase/admin"
import { formatRomanianDateDots, formatRomanianDateDotsISO } from "@/lib/utils/date-utils"

const HR_COMPANY = {
  name: process.env.NEXT_PUBLIC_HR_COMPANY_NAME || "NRG Access Systems SRL",
  cui: process.env.NEXT_PUBLIC_HR_COMPANY_CUI || "RO34272913",
  registrationNumber: process.env.NEXT_PUBLIC_HR_COMPANY_REG_NO || "J23/991/2015",
}

const TEMPLATE_FILE_BY_KIND: Partial<Record<HrRequest["kind"], string>> = {
  CO: "Cerere concediu de odihna.docx",
  CFP: "Cerere concediu fara plata.docx",
  DEL: "delegatie.docx",
}

type EmployeeSnapshot = {
  nume?: string
  prenume?: string
  title?: string
  poziteCOR?: string
  ciSerie?: string
  ciNumar?: string
  programLucruStart?: string
  programLucruEnd?: string
}

type UserSnapshot = {
  displayName?: string
  email?: string
}

function safeText(value: unknown, fallback = "—"): string {
  const text = String(value ?? "").trim()
  return text || fallback
}

function splitEmployeeName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "", lastName: "" }
  if (parts.length === 1) return { firstName: parts[0], lastName: "" }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

function parseTimeToMinutes(v: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(v || "").trim())
  if (!match) return null
  const hh = Number(match[1])
  const mm = Number(match[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function countWeekDays(startDateISO: string, endDateISO: string): number {
  if (!startDateISO || !endDateISO) return 0
  const start = new Date(startDateISO)
  const end = new Date(endDateISO)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0
  const current = new Date(start)
  let count = 0
  while (current <= end) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count += 1
    current.setDate(current.getDate() + 1)
  }
  return count
}

function buildDurationText(params: {
  startDateISO: string
  endDateISO: string
  startTime: string
  endTime: string
}): string {
  const workDays = countWeekDays(params.startDateISO, params.endDateISO)
  const startMinutes = parseTimeToMinutes(params.startTime)
  const endMinutes = parseTimeToMinutes(params.endTime)
  if (
    params.startDateISO &&
    params.endDateISO &&
    params.startDateISO === params.endDateISO &&
    startMinutes != null &&
    endMinutes != null &&
    endMinutes > startMinutes
  ) {
    const diffMinutes = endMinutes - startMinutes
    const h = Math.floor(diffMinutes / 60)
    const m = diffMinutes % 60
    if (h > 0 && m > 0) return `${h}h ${m}m`
    if (h > 0) return `${h}h`
    return `${m}m`
  }
  if (workDays > 0) return `${workDays} zi${workDays === 1 ? "" : "le"} lucrătoare`
  return "—"
}

function requestNumberFromId(requestId: string): string {
  const clean = String(requestId || "").trim()
  if (!clean) return `HR-${Date.now()}`
  return `HR-${clean.slice(0, 8).toUpperCase()}`
}

function formatNrCerere(documentSerial: number | undefined): string {
  if (documentSerial == null || !Number.isFinite(documentSerial)) return "—"
  return String(Math.trunc(documentSerial)).padStart(4, "0")
}

function sanitizeFileNameChunk(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function removeDocxFooters(zip: PizZip) {
  // Empty all footer XML parts so generated DOCX does not render template footers.
  const emptyFooterXml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p/></w:ftr>'

  const files = Object.keys((zip as any).files || {})
  for (const name of files) {
    if (/^word\/footer\d+\.xml$/i.test(name)) {
      zip.file(name, emptyFooterXml)
    }
  }

  const docXml = zip.file("word/document.xml")?.asText()
  if (docXml) {
    zip.file("word/document.xml", docXml.replace(/<w:footerReference\b[^>]*\/>/g, ""))
  }
}

async function fetchEmployeeById(employeeId: string): Promise<EmployeeSnapshot | null> {
  if (!employeeId) return null
  try {
    const snap = await adminDb.collection("hrEmployees").doc(employeeId).get()
    if (!snap.exists) return null
    const data = snap.data() as any
    return {
      nume: typeof data?.nume === "string" ? data.nume : undefined,
      prenume: typeof data?.prenume === "string" ? data.prenume : undefined,
      title: typeof data?.title === "string" ? data.title : undefined,
      poziteCOR: typeof data?.poziteCOR === "string" ? data.poziteCOR : undefined,
      ciSerie: typeof data?.ciSerie === "string" ? data.ciSerie : undefined,
      ciNumar: typeof data?.ciNumar === "string" ? data.ciNumar : undefined,
      programLucruStart: typeof data?.programLucruStart === "string" ? data.programLucruStart : undefined,
      programLucruEnd: typeof data?.programLucruEnd === "string" ? data.programLucruEnd : undefined,
    }
  } catch {
    return null
  }
}

async function fetchUserByUid(uid: string): Promise<UserSnapshot | null> {
  if (!uid) return null
  try {
    const snap = await adminDb.collection("users").doc(uid).get()
    if (!snap.exists) return null
    const data = snap.data() as any
    return {
      displayName: typeof data?.displayName === "string" ? data.displayName : undefined,
      email: typeof data?.email === "string" ? data.email : undefined,
    }
  } catch {
    return null
  }
}

export function canGenerateHrRequestDocx(kind: HrRequest["kind"]): boolean {
  return Boolean(TEMPLATE_FILE_BY_KIND[kind])
}

export async function generateHrRequestDocxBuffer(
  request: HrRequest,
): Promise<{ buffer: Buffer; filename: string }> {
  const templateFile = TEMPLATE_FILE_BY_KIND[request.kind]
  if (!templateFile) {
    throw new Error(`Nu există template DOCX pentru tipul ${request.kind}`)
  }

  const payload: any = request.payload as any
  const [employee, requesterUser, managerUser] = await Promise.all([
    fetchEmployeeById(request.employeeId),
    fetchUserByUid(request.requesterUid),
    fetchUserByUid(request.managerUid),
  ])

  const fallbackFullName = safeText(request.employeeName || request.employeeId, request.employeeId)
  const employeeFullName = safeText(
    [employee?.prenume, employee?.nume].filter(Boolean).join(" ") || fallbackFullName,
    fallbackFullName,
  )
  const split = splitEmployeeName(employeeFullName)
  const employeeFirstName = safeText(employee?.prenume || split.firstName, "—")
  const employeeLastName = safeText(employee?.nume || split.lastName, "—")
  const employeeFunction = safeText(employee?.title || employee?.poziteCOR, "—")
  const employeeCi = safeText([employee?.ciSerie, employee?.ciNumar].filter(Boolean).join(" "), "—")
  const startDateISO = String(payload?.startDate || payload?.date || "")
  const endDateISO = String(payload?.endDate || payload?.date || "")
  const startDateLabel = safeText(formatRomanianDateDotsISO(startDateISO), "—")
  const endDateLabel = safeText(formatRomanianDateDotsISO(endDateISO), "—")
  const requestDateLabel = formatRomanianDateDots(new Date(request.createdAt || Date.now()))
  const eventStartTime = safeText(payload?.eventStartTime || employee?.programLucruStart || "08:00")
  const eventEndTime = safeText(payload?.eventEndTime || employee?.programLucruEnd || "16:30")
  const durationText = buildDurationText({
    startDateISO,
    endDateISO,
    startTime: eventStartTime,
    endTime: eventEndTime,
  })
  const requesterLabel = safeText(requesterUser?.displayName || requesterUser?.email || request.employeeName || request.requesterUid)
  const managerLabel = safeText(managerUser?.displayName || managerUser?.email || request.managerUid)
  const clientName = safeText(payload?.clientName, "—")
  const reason = safeText(payload?.reason, "—")
  const registrationNumber = requestNumberFromId(request.id)

  const placeholders: Record<string, string> = {
    "nume-companie": HR_COMPANY.name,
    "cui-companie": HR_COMPANY.cui,
    "număr-de-înregistrare-companie": HR_COMPANY.registrationNumber,
    "nr-cerere": formatNrCerere(request.documentSerial),
    "tip-eveniment": hrRequestKindLabel(request.kind),
    "nume-angajat": employeeLastName,
    "prenume-angajat": employeeFirstName,
    "funcție-angajat": employeeFunction,
    "data-de-început-a-evenimentului": startDateLabel,
    "data-de-sfârșit-a-evenimentului": endDateLabel,
    "ora-de-început-a-evenimentului": eventStartTime,
    "ora-de-sfârșit-a-evenimentului": eventEndTime,
    "durata-evenimentului": durationText,
    "data-de-început-a-cererii": startDateLabel,
    "data-de-sfârșit-a-cererii": endDateLabel,
    "data-cererii": requestDateLabel,
    solicitant: requesterLabel,
    "superior-direct": managerLabel,
    "număr-de-înregistrare": registrationNumber,
    "motiv-delegare": reason,
    "nume-client": clientName,
    "serie-si-numar-CI": employeeCi,
    "nume-complet-angajat": employeeFullName,
  }

  const templatePath = path.join(process.cwd(), "public", "docx", templateFile)
  const templateBuffer = await fs.readFile(templatePath)
  const zip = new PizZip(templateBuffer)
  removeDocxFooters(zip)
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "{{", end: "}}" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "—",
  })

  doc.render(placeholders as any)
  const outputBuffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  }) as Buffer

  const safeName = sanitizeFileNameChunk(employeeFullName || request.employeeId || "angajat")
  const filename = `Cerere_${request.kind}_${safeName}_${Date.now()}.docx`
  return { buffer: outputBuffer, filename }
}

