"use client"

import Docxtemplater from "docxtemplater"
import PizZip from "pizzip"
import { doc as firestoreDoc, getDoc } from "firebase/firestore"
import type { HrRequest } from "@/lib/hr/types"
import { hrRequestKindLabel } from "@/lib/hr/hr-requests"
import { db } from "@/lib/firebase/firebase"
import { formatRomanianDateDots, formatRomanianDateDotsISO } from "@/lib/utils/date-utils"
import { generateHrRequestPDF } from "@/lib/hr/request-pdf-generator"
import { toast } from "@/hooks/use-toast"

const HR_COMPANY = {
  name: process.env.NEXT_PUBLIC_HR_COMPANY_NAME || "NRG Access Systems SRL",
  cui: process.env.NEXT_PUBLIC_HR_COMPANY_CUI || "RO34272913",
  registrationNumber: process.env.NEXT_PUBLIC_HR_COMPANY_REG_NO || "J23/991/2015",
}

const TEMPLATE_BY_KIND: Partial<Record<HrRequest["kind"], string>> = {
  CO: "/docx/Cerere concediu de odihna.docx",
  CFP: "/docx/Cerere concediu fara plata.docx",
  DEL: "/docx/delegatie.docx",
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

function sanitizeFileNameChunk(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function fetchDepartmentName(departmentId: string, fallback?: string): Promise<string> {
  if (fallback?.trim()) return fallback.trim()
  if (!departmentId) return "—"
  try {
    const snap = await getDoc(firestoreDoc(db, "hrDepartments", departmentId))
    if (!snap.exists()) return departmentId
    return safeText((snap.data() as any)?.name, departmentId)
  } catch {
    return departmentId
  }
}

async function fetchEmployeeById(employeeId: string): Promise<EmployeeSnapshot | null> {
  if (!employeeId) return null
  try {
    const snap = await getDoc(firestoreDoc(db, "hrEmployees", employeeId))
    if (!snap.exists()) return null
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
    const snap = await getDoc(firestoreDoc(db, "users", uid))
    if (!snap.exists()) return null
    const data = snap.data() as any
    return {
      displayName: typeof data?.displayName === "string" ? data.displayName : undefined,
      email: typeof data?.email === "string" ? data.email : undefined,
    }
  } catch {
    return null
  }
}

async function loadTemplate(templatePath: string): Promise<ArrayBuffer> {
  const response = await fetch(templatePath)
  if (!response.ok) {
    throw new Error(`Nu am putut încărca template-ul (${response.status})`)
  }
  return response.arrayBuffer()
}

function buildPlaceholderMap(params: {
  request: HrRequest
  employeeFullName: string
  employeeFirstName: string
  employeeLastName: string
  employeeFunction: string
  employeeCi: string
  requestDateLabel: string
  startDateLabel: string
  endDateLabel: string
  eventStartTime: string
  eventEndTime: string
  durationText: string
  requesterLabel: string
  managerLabel: string
  clientName: string
  registrationNumber: string
  reason: string
}): Record<string, string> {
  return {
    "nume-companie": HR_COMPANY.name,
    "cui-companie": HR_COMPANY.cui,
    "număr-de-înregistrare-companie": HR_COMPANY.registrationNumber,
    "tip-eveniment": hrRequestKindLabel(params.request.kind),
    "nume-angajat": params.employeeLastName,
    "prenume-angajat": params.employeeFirstName,
    "funcție-angajat": params.employeeFunction,
    "data-de-început-a-evenimentului": params.startDateLabel,
    "data-de-sfârșit-a-evenimentului": params.endDateLabel,
    "ora-de-început-a-evenimentului": params.eventStartTime,
    "ora-de-sfârșit-a-evenimentului": params.eventEndTime,
    "durata-evenimentului": params.durationText,
    "data-de-început-a-cererii": params.startDateLabel,
    "data-de-sfârșit-a-cererii": params.endDateLabel,
    "data-cererii": params.requestDateLabel,
    solicitant: params.requesterLabel,
    "superior-direct": params.managerLabel,
    "număr-de-înregistrare": params.registrationNumber,
    "motiv-delegare": params.reason,
    "nume-client": params.clientName,
    "serie-si-numar-CI": params.employeeCi,
    "nume-complet-angajat": params.employeeFullName,
  }
}

export function generateHrRequestDOCX(request: HrRequest) {
  void generateHrRequestDOCXAsync(request)
}

export async function generateHrRequestDOCXAsync(
  request: HrRequest,
  opts?: { departmentName?: string },
): Promise<void> {
  const templatePath = TEMPLATE_BY_KIND[request.kind]
  if (!templatePath) {
    // Fallback pentru tipuri fără template DOCX explicit.
    toast({
      title: "Template DOCX indisponibil",
      description: `Pentru tipul „${hrRequestKindLabel(request.kind)}” se folosește fallback PDF.`,
    })
    generateHrRequestPDF(request)
    return
  }

  const payload: any = request.payload as any
  const [employee, requesterUser, managerUser] = await Promise.all([
    fetchEmployeeById(request.employeeId),
    fetchUserByUid(request.requesterUid),
    fetchUserByUid(request.managerUid),
  ])
  await fetchDepartmentName(request.sectorId, opts?.departmentName)

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

  const placeholders = buildPlaceholderMap({
    request,
    employeeFullName,
    employeeFirstName,
    employeeLastName,
    employeeFunction,
    employeeCi,
    requestDateLabel,
    startDateLabel,
    endDateLabel,
    eventStartTime,
    eventEndTime,
    durationText,
    requesterLabel,
    managerLabel,
    clientName,
    registrationNumber,
    reason,
  })

  try {
    const content = await loadTemplate(templatePath)
    const zip = new PizZip(content)
    const doc = new Docxtemplater(zip, {
      delimiters: { start: "{{", end: "}}" },
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => "—",
    })

    doc.render(placeholders as any)
    const blob = doc.getZip().generate({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }) as Blob

    const safeName = sanitizeFileNameChunk(employeeFullName || request.employeeId || "angajat")
    const fileName = `Cerere_${request.kind}_${safeName}_${Date.now()}.docx`
    triggerBlobDownload(blob, fileName)
  } catch (error) {
    console.error("Eroare la generarea DOCX; fallback PDF:", error)
    toast({
      title: "Eroare la DOCX",
      description: "Nu am putut genera DOCX-ul din template. Se descarcă varianta PDF fallback.",
      variant: "destructive",
    })
    generateHrRequestPDF(request)
  }
}

