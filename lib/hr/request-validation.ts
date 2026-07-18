import type { HrRequestKind, HrRequestPayload } from "./types"

function isIsoDate(value: unknown): value is string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""))
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function timeMinutes(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim())
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return hour * 60 + minute
}

export function validateMedicalDocumentFile(file: Pick<File, "name" | "size" | "type"> | null | undefined): string | null {
  if (!file) return "Pentru concediu medical trebuie să încarci documentul de la medic."
  if (!Number.isFinite(file.size) || file.size <= 0) return "Documentul medical nu poate fi gol."
  const name = String(file.name ?? "").trim().toLowerCase()
  const type = String(file.type ?? "").trim().toLowerCase()
  const isPdf = type === "application/pdf" || name.endsWith(".pdf")
  if (!isPdf && !type.startsWith("image/")) {
    return "Documentul medical trebuie să fie o imagine sau un fișier PDF."
  }
  return null
}

export function validateHrRequestPayload(kind: HrRequestKind, payload: HrRequestPayload): string | null {
  if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    const range = payload as Extract<HrRequestPayload, { startDate: string }>
    if (!isIsoDate(range.startDate) || !isIsoDate(range.endDate)) return "Completează date calendaristice valide."
    if (range.startDate > range.endDate) return "Data de început nu poate fi după data de sfârșit."
    if (kind === "DEL" && !String(range.clientName ?? "").trim()) return "Completează numele clientului pentru delegație."
    if (kind === "CM" && !String(range.medicalDocumentUrl ?? "").trim()) return "Pentru concediu medical trebuie să încarci documentul de la medic."
    return null
  }

  if (kind === "IN") {
    const request = payload as Extract<HrRequestPayload, { kind: "IN" }>
    const start = timeMinutes(request.startTime)
    const end = timeMinutes(request.endTime)
    if (!isIsoDate(request.date)) return "Completează o dată calendaristică validă."
    if (start === null || end === null || start >= end) return "Intervalul învoirii trebuie să aibă un sfârșit după început."
    return null
  }

  if (kind === "CORRECT_HOURS" || kind === "ADD_OVERTIME") {
    if (!isIsoDate((payload as { date?: unknown }).date)) return "Completează o dată calendaristică validă."
  }
  return null
}

export function validateHrRequestCreateInput(params: {
  employeeId: string
  requesterUid: string
  sectorId: string
  managerUid: string
  kind: HrRequestKind
  payload: HrRequestPayload
}): string | null {
  if (!params.employeeId.trim()) return "Salariatul este obligatoriu."
  if (!params.requesterUid.trim()) return "Utilizatorul solicitant este obligatoriu."
  if (!params.sectorId.trim()) return "Selectează departamentul."
  if (!params.managerUid.trim()) return "Nu este setat șeful ierarhic pentru departamentul selectat."
  return validateHrRequestPayload(params.kind, params.payload)
}
