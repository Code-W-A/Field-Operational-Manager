import { resolveTicketLocation, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

export type ReportRecipients = { emails: string[]; source: "current" | "historical" | "none"; warning?: string }
const validEmail = (value: unknown): value is string => typeof value === "string" && value.trim().length <= 254 && /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(value.trim())
export const uniqueReportEmails = (values: unknown[]): string[] => [...new Set(values.filter(validEmail).map(value => value.trim().toLowerCase()))]

export function validateResendEmails(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.length > 20 || !value.every(validEmail)) {
    throw new Error("Introduceți între 1 și 20 de adrese de email valide.")
  }
  return uniqueReportEmails(value)
}

export function canResendReport(work: SyncRecord): boolean {
  return work.raportGenerat === true && !(work.tipLucrare === "Instalare" && work.installation?.schemaVersion === 1)
}

/** Live records take precedence. Never use a name to replace a dangling stable ID. */
export function resolveResendRecipients(work: SyncRecord, clients: SyncRecord[]): ReportRecipients {
  const clientId = String(work.clientId || work.clientInfo?.id || "").trim()
  const locationId = String(work.locationId || work.clientInfo?.locationId || work.clientInfo?.locatieId || "").trim()
  const matches = clients.filter(client => clientId ? client.id === clientId : client.nume === work.client)
  if (matches.length === 1) {
    try {
      const location = resolveTicketLocation(matches[0], work)
      return { source: "current", emails: uniqueReportEmails([
        ...(Array.isArray(location.persoaneContact) ? location.persoaneContact.map((person: SyncRecord) => person.email) : []),
        location.email, matches[0].email,
      ]) }
    } catch { /* Unresolved legacy associations may use labelled historical addresses below. */ }
  }
  if (clientId || locationId) {
    return { source: "none", emails: [], warning: "Clientul sau locația asociată nu poate fi identificată sigur. Introduceți destinatarii manual." }
  }
  const snapshot = work.raportSnapshot || {}
  const frozen = snapshot.clientSnapshot || snapshot
  const historical = uniqueReportEmails([
    frozen.persoanaContactEmail, frozen.clientInfo?.email, frozen.clientInfo?.locationEmail, frozen.clientInfo?.contactEmail,
  ])
  const emails = historical.length ? historical : uniqueReportEmails([
    work.persoanaContactEmail, work.clientInfo?.email, work.clientInfo?.locationEmail, work.clientInfo?.contactEmail,
  ])
  return emails.length
    ? { source: "historical", emails, warning: "Adrese istorice — verificați înainte de trimitere." }
    : { source: "none", emails: [], warning: "Nu există adrese identificate sigur. Introduceți destinatarii manual." }
}
