import { resolveTicketContact, resolveTicketLocation, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"
const normalizeEmail = (value: unknown) => String(value ?? "").normalize("NFKC").trim()
const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const uniqueEmails = (values: unknown[]) => Array.from(new Set(values
  .map(normalizeEmail)
  .filter(isValidEmail)
  .map(value => value.toLowerCase())))

/** Only current client records may contribute automatic ticket recipients. */
export function currentTicketRecipients(work: SyncRecord, client: SyncRecord, mode: "work-order" | "postponed" | "report") {
  const linkedId = String(work.clientId || work.clientInfo?.id || "").trim()
  if (!client?.id || (linkedId ? linkedId !== client.id : work.client !== client.nume)) {
    throw new Error("Clientul tichetului nu poate fi identificat sigur.")
  }
  const location = resolveTicketLocation(client, work)
  // A selected contact which no longer exists must never select another person by name.
  const selected = work.contactId || work.persoanaContact ? resolveTicketContact(client, work).contact : null
  const locationEmails = uniqueEmails([
    ...(Array.isArray(location.persoaneContact) ? location.persoaneContact.map((person: SyncRecord) => person.email) : []),
    location.email,
  ])
  const mainEmail = uniqueEmails([client.email])
  const emails = mode === "work-order"
    ? (locationEmails.length ? locationEmails : mainEmail)
    : mode === "postponed"
      ? uniqueEmails([...mainEmail, selected?.email])
      : uniqueEmails([...locationEmails, ...mainEmail])
  return {
    emails,
    clientName: String(client.nume || ""),
    contactName: String(selected?.nume || ""),
    locationName: String(location.nume || ""),
    locationAddress: String(location.adresa || ""),
  }
}
