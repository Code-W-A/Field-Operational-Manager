import type { HrRequest, HrRequestKind } from "@/lib/hr/types"

export function hrRequestKindLabel(kind: HrRequestKind) {
  switch (kind) {
    case "CO":
      return "Concediu de odihnă"
    case "CFP":
      return "Concediu fără plată"
    case "CM":
      return "Concediu medical"
    case "SL":
      return "Sărbătoare legală"
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
  return "Pending"
}

export function hrRequestDateLabel(req: HrRequest) {
  const p: any = req.payload as any
  if (p?.startDate && p?.endDate) return `${p.startDate} → ${p.endDate}`
  if (p?.date && p?.startTime && p?.endTime) return `${p.date} • ${p.startTime}–${p.endTime}`
  if (p?.date) return String(p.date)
  return "—"
}

