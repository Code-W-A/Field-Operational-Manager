import type { HrRequest, HrRequestKind, HrRequestStatus } from "@/lib/hr/types"
import { formatOvertimeDuration } from "@/lib/hr/overtime-duration"
import { formatRomanianDateISO } from "@/lib/utils/date-utils"

export const HR_REQUEST_KINDS: HrRequestKind[] = [
  "CO",
  "CFP",
  "CM",
  "IN",
  "DEL",
  "CORRECT_HOURS",
  "ADD_OVERTIME",
]

export const HR_APPROVAL_FILTER_ALL = "ALL"

export function filterHrApprovalRequests(
  requests: HrRequest[],
  filters: {
    kind?: typeof HR_APPROVAL_FILTER_ALL | HrRequestKind
    employeeId?: typeof HR_APPROVAL_FILTER_ALL | string
    status?: typeof HR_APPROVAL_FILTER_ALL | HrRequestStatus
  } = {},
): HrRequest[] {
  if (!Array.isArray(requests)) return []
  const kind = filters.kind || HR_APPROVAL_FILTER_ALL
  const employeeId = filters.employeeId || HR_APPROVAL_FILTER_ALL
  const status = filters.status || HR_APPROVAL_FILTER_ALL

  return requests.filter((request) => {
    if (kind !== HR_APPROVAL_FILTER_ALL && request.kind !== kind) return false
    if (employeeId !== HR_APPROVAL_FILTER_ALL && request.employeeId !== employeeId) return false
    if (status !== HR_APPROVAL_FILTER_ALL && request.status !== status) return false
    return true
  })
}

export function hrRequestKindLabel(kind: HrRequestKind) {
  switch (kind) {
    case "CO":
      return "Concediu de odihnă"
    case "CFP":
      return "Concediu fără plată"
    case "CM":
      return "Concediu medical"
    case "IN":
      return "Învoire"
    case "DEL":
      return "Delegație"
    case "CORRECT_HOURS":
      return "Corectare ore de lucru"
    case "ADD_OVERTIME":
      return "Adăugare ore suplimentare"
    default:
      return String(kind)
  }
}

export function hrRequestStatusLabel(status: HrRequest["status"]) {
  if (status === "approved") return "Aprobat"
  if (status === "rejected") return "Respins"
  return "În așteptare"
}

export function hrRequestDateLabel(req: HrRequest) {
  const p: any = req.payload as any
  if (p?.startDate && p?.endDate) {
    return `${formatRomanianDateISO(p.startDate)} → ${formatRomanianDateISO(p.endDate)}`
  }
  if (p?.date && p?.startTime && p?.endTime) {
    return `${formatRomanianDateISO(p.date)} • ${p.startTime}–${p.endTime}`
  }
  if (req.kind === "ADD_OVERTIME" && p?.date) {
    const dateLabel = formatRomanianDateISO(p.date) || String(p.date)
    const duration = formatOvertimeDuration(p.overtimeHours)
    return duration !== "—" ? `${dateLabel} • ${duration}` : dateLabel
  }
  if (p?.date) return formatRomanianDateISO(p.date) || String(p.date)
  return "—"
}

/** Număr cerere pentru UI / documente: 0001–9999, apoi 10000+ (fără duplicate la ciclu). */
export function formatHrRequestSerial(documentSerial: number | undefined): string {
  if (documentSerial == null || !Number.isFinite(documentSerial)) return "—"
  const k = Math.trunc(documentSerial)
  if (k < 1) return "—"
  if (k <= 9999) return String(k).padStart(4, "0")
  return String(k)
}

