import type { InstallationFields, InstallationSignatures, InstallationEquipment } from "@/types/installation"

export class InstallationError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
export function check(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new InstallationError(message, status)
}
export function identifier(value: unknown): string {
  check(typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value), "Identificator invalid.")
  return value
}
export function text(value: unknown, max = 6000): string {
  check(value === undefined || typeof value === "string", "Valoare text invalidă.")
  const result = String(value ?? "").trim()
  check(result.length <= max, `Textul depășește limita de ${max} caractere.`)
  return result
}
export function fields(input: any, closing = false): InstallationFields {
  check(input && typeof input === "object", "Datele fișei lipsesc.")
  const installationStatus = input.installationStatus
  check(["in_progress", "blocked", "completed"].includes(installationStatus), "Status de instalare invalid.")
  const result: InstallationFields = {
    finding: text(input.finding), operations: text(input.operations), installationStatus,
    blockReason: text(input.blockReason), internalNote: text(input.internalNote),
  }
  if (closing) {
    check(result.finding && result.operations, "Constatarea și operațiunile sunt obligatorii.")
    check(installationStatus !== "blocked" || result.blockReason, "Descrieți motivul blocajului.")
  }
  if (installationStatus !== "blocked") result.blockReason = ""
  return result
}
export function signatures(input: any, principalName: string): InstallationSignatures {
  check(input && typeof input === "object", "Semnăturile lipsesc.")
  const beneficiaryName = text(input.beneficiaryName, 200)
  check(beneficiaryName, "Numele beneficiarului este obligatoriu.")
  const validate = (value: unknown) => {
    check(typeof value === "string" && value.length <= 120000 && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value), "Ambele semnături PNG sunt obligatorii.")
    const bytes = Buffer.from(value.split(",")[1], "base64")
    check(bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])), "Semnătură PNG invalidă.")
    return value
  }
  return { technicianName: principalName, beneficiaryName, technicianSignature: validate(input.technicianSignature), beneficiarySignature: validate(input.beneficiarySignature) }
}
export function verifyQr(raw: unknown, equipment: InstallationEquipment, client: string, location: string) {
  check(typeof raw === "string" && raw.length > 0 && raw.length < 4096, "Scanarea QR este obligatorie.")
  let parsed: any
  try { parsed = JSON.parse(raw) } catch { parsed = { code: raw.trim() } }
  check(parsed && typeof parsed === "object" && parsed.code === equipment.code && equipment.code, "QR-ul nu corespunde echipamentului selectat.")
  if (parsed.id) check(parsed.id === equipment.id, "ID-ul echipamentului din QR nu corespunde.")
  if (parsed.type) check(parsed.type === "equipment", "QR-ul nu este pentru un echipament.")
  if (parsed.client) check(parsed.client === client, "Clientul din QR nu corespunde.")
  if (parsed.location) check(parsed.location === location, "Locația din QR nu corespunde.")
}
export function workDate(now: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const part = (name: string) => p.find(v => v.type === name)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}
