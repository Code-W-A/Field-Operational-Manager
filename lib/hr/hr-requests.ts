import type { HrRequest, HrRequestKind } from "@/lib/hr/types"
import { formatRomanianDateISO } from "@/lib/utils/date-utils"

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

