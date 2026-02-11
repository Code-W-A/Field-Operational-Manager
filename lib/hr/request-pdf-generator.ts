import jsPDF from "jspdf"
import type { HrRequest } from "@/lib/hr/types"
import { hrRequestKindLabel, hrRequestStatusLabel } from "@/lib/hr/hr-requests"
import { doc as firestoreDoc, getDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/firebase"
import { formatRomanianDateDots, formatRomanianDateDotsISO } from "@/lib/utils/date-utils"

const HR_COMPANY = {
  name: process.env.NEXT_PUBLIC_HR_COMPANY_NAME || "NRG Access Systems SRL",
  cui: process.env.NEXT_PUBLIC_HR_COMPANY_CUI || "RO34272913",
  registrationNumber: process.env.NEXT_PUBLIC_HR_COMPANY_REG_NO || "J23/991/2015",
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

function formatNowRo() {
  try {
    return new Date().toLocaleString("ro-RO")
  } catch {
    return new Date().toISOString()
  }
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
  if (params.startDateISO && params.endDateISO && params.startDateISO === params.endDateISO && startMinutes != null && endMinutes != null && endMinutes > startMinutes) {
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

function writeParagraph(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 5): number {
  const content = String(text || "").trim()
  if (!content) return y
  const lines = doc.splitTextToSize(content, maxWidth) as string[]
  doc.text(lines, x, y)
  return y + lines.length * lineHeight
}

function drawSignatureArea(doc: jsPDF, params: {
  margin: number
  pageWidth: number
  y: number
  leftLabel: string
  leftName: string
  rightLabel: string
  rightName: string
}) {
  const gap = 14
  const colWidth = (params.pageWidth - params.margin * 2 - gap) / 2
  const leftLineX1 = params.margin
  const leftLineX2 = params.margin + colWidth
  const rightLineX1 = params.pageWidth - params.margin - colWidth
  const rightLineX2 = params.pageWidth - params.margin

  doc.setLineWidth(0.3)
  doc.line(leftLineX1, params.y, leftLineX2, params.y)
  doc.line(rightLineX1, params.y, rightLineX2, params.y)

  doc.setFontSize(10)
  doc.text(params.leftLabel, leftLineX1, params.y + 5)
  doc.text(params.leftName, leftLineX1, params.y + 10)
  doc.text(params.rightLabel, rightLineX1, params.y + 5)
  doc.text(params.rightName, rightLineX1, params.y + 10)
}

function drawHeader(doc: jsPDF, params: {
  margin: number
  pageWidth: number
  companyName: string
  companyCui: string
  companyRegistrationNumber: string
  statusLabel: string
  requestDate: string
}) {
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(params.companyName, params.pageWidth / 2, 16, { align: "center" })

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`CUI: ${params.companyCui} • Nr. Reg. Com.: ${params.companyRegistrationNumber}`, params.pageWidth / 2, 22, { align: "center" })
  doc.text(`Status: ${params.statusLabel}`, params.pageWidth - params.margin, 14, { align: "right" })
  doc.text(`Data cererii: ${params.requestDate}`, params.pageWidth - params.margin, 19, { align: "right" })
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
    "solicitant": params.requesterLabel,
    "superior-direct": params.managerLabel,
    "număr-de-înregistrare": params.registrationNumber,
    "motiv-delegare": params.reason,
    "nume-client": params.clientName,
    "serie-si-numar-CI": params.employeeCi,
    "nume-complet-angajat": params.employeeFullName,
  }
}

export function generateHrRequestPDF(request: HrRequest) {
  // Legacy sync signature kept by returning void; internal implementation is async-safe.
  void generateHrRequestPDFAsync(request)
}

export async function generateHrRequestPDFAsync(
  request: HrRequest,
  opts?: { departmentName?: string }
): Promise<void> {
  const payload: any = request.payload as any
  const [employee, requesterUser, managerUser, departmentName] = await Promise.all([
    fetchEmployeeById(request.employeeId),
    fetchUserByUid(request.requesterUid),
    fetchUserByUid(request.managerUid),
    fetchDepartmentName(request.sectorId, opts?.departmentName),
  ])

  const fallbackFullName = safeText(request.employeeName || request.employeeId, request.employeeId)
  const employeeFullName = safeText(
    [employee?.prenume, employee?.nume].filter(Boolean).join(" ") || fallbackFullName,
    fallbackFullName
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

  const doc = new jsPDF()
  const margin = 20
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const contentWidth = pageWidth - margin * 2

  drawHeader(doc, {
    margin,
    pageWidth,
    companyName: placeholders["nume-companie"],
    companyCui: placeholders["cui-companie"],
    companyRegistrationNumber: placeholders["număr-de-înregistrare-companie"],
    statusLabel: hrRequestStatusLabel(request.status),
    requestDate: placeholders["data-cererii"],
  })

  let y = 40
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  const title = request.kind === "DEL"
    ? "DELEGAȚIE"
    : `CERERE ${hrRequestKindLabel(request.kind).toUpperCase()}`
  doc.text(title, pageWidth / 2, y, { align: "center" })
  y += 4
  doc.setLineWidth(0.4)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)

  if (request.kind === "CO") {
    y = writeParagraph(
      doc,
      `Subsemnatul(a), ${placeholders["prenume-angajat"]} ${placeholders["nume-angajat"]}, având funcția de ${placeholders["funcție-angajat"]} în cadrul ${placeholders["nume-companie"]}, vă rog să-mi aprobați ${placeholders["tip-eveniment"]}.`,
      margin,
      y,
      contentWidth
    )
    y += 2
    y = writeParagraph(
      doc,
      `Perioada solicitată: ${placeholders["data-de-început-a-evenimentului"]} - ${placeholders["data-de-sfârșit-a-evenimentului"]}. Interval orar: ${placeholders["ora-de-început-a-evenimentului"]} - ${placeholders["ora-de-sfârșit-a-evenimentului"]}.`,
      margin,
      y,
      contentWidth
    )
    y += 2
    y = writeParagraph(
      doc,
      `Durata evenimentului: ${placeholders["durata-evenimentului"]}. Departament: ${safeText(departmentName)}.`,
      margin,
      y,
      contentWidth
    )
    if (placeholders["motiv-delegare"] !== "—") {
      y += 2
      y = writeParagraph(doc, `Motiv: ${placeholders["motiv-delegare"]}.`, margin, y, contentWidth)
    }
  } else if (request.kind === "CFP") {
    y = writeParagraph(
      doc,
      `Subsemnatul(a), ${placeholders["prenume-angajat"]} ${placeholders["nume-angajat"]}, având funcția de ${placeholders["funcție-angajat"]}, solicit aprobarea pentru ${placeholders["tip-eveniment"]}.`,
      margin,
      y,
      contentWidth
    )
    y += 2
    y = writeParagraph(
      doc,
      `Perioada solicitată: ${placeholders["data-de-început-a-cererii"]} - ${placeholders["data-de-sfârșit-a-cererii"]}. Departament: ${safeText(departmentName)}.`,
      margin,
      y,
      contentWidth
    )
    if (placeholders["motiv-delegare"] !== "—") {
      y += 2
      y = writeParagraph(doc, `Motiv: ${placeholders["motiv-delegare"]}.`, margin, y, contentWidth)
    }
  } else if (request.kind === "DEL") {
    y = writeParagraph(doc, `Număr de înregistrare: ${placeholders["număr-de-înregistrare"]}`, margin, y, contentWidth)
    y += 2
    y = writeParagraph(
      doc,
      `Subsemnatul(a), ${placeholders["prenume-angajat"]} ${placeholders["nume-angajat"]}, funcția ${placeholders["funcție-angajat"]}, sunt delegat(ă) de către ${placeholders["nume-companie"]} pentru clientul ${placeholders["nume-client"]}.`,
      margin,
      y,
      contentWidth
    )
    y += 2
    y = writeParagraph(
      doc,
      `Data de început a delegației: ${placeholders["data-de-început-a-evenimentului"]}. Serie și număr CI: ${placeholders["serie-si-numar-CI"]}.`,
      margin,
      y,
      contentWidth
    )
    y += 2
    y = writeParagraph(doc, `Motiv delegare: ${placeholders["motiv-delegare"]}.`, margin, y, contentWidth)
  } else {
    y = writeParagraph(
      doc,
      `Angajat: ${employeeFullName}. Tip cerere: ${hrRequestKindLabel(request.kind)}.`,
      margin,
      y,
      contentWidth
    )
    y += 2
    y = writeParagraph(
      doc,
      `Perioadă/zi: ${startDateLabel}${endDateLabel !== "—" ? ` - ${endDateLabel}` : ""}. Departament: ${safeText(departmentName)}.`,
      margin,
      y,
      contentWidth
    )
    if (payload?.reason) {
      y += 2
      y = writeParagraph(doc, `Motiv: ${String(payload.reason)}.`, margin, y, contentWidth)
    }
  }

  if (request.status === "rejected" && request.rejectionReason) {
    y += 6
    doc.setFont("helvetica", "bold")
    y = writeParagraph(doc, `Motiv respingere: ${request.rejectionReason}`, margin, y, contentWidth)
    doc.setFont("helvetica", "normal")
  }

  y += 14
  drawSignatureArea(doc, {
    margin,
    pageWidth,
    y,
    leftLabel: "Solicitant",
    leftName: placeholders["solicitant"],
    rightLabel: "Superior direct",
    rightName: placeholders["superior-direct"],
  })

  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  doc.text(`Generat automat la ${formatNowRo()}`, margin, pageHeight - 12)
  doc.setTextColor(0, 0, 0)

  const safeName = employeeFullName.replace(/\s+/g, "_")
  const fileName = `Cerere_${request.kind}_${safeName}_${Date.now()}.pdf`
  doc.save(fileName)
}
