import { ticketContactOptions, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

const normalized = (value: unknown) => typeof value === "string"
  ? value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
  : ""

/** Collapse identical visible choices without changing stored IDs or contact resolution. */
export function ticketContactSelectOptions(client: SyncRecord, location: SyncRecord, selectedId?: string): SyncRecord[] {
  const options = new Map<string, SyncRecord>()
  for (const contact of ticketContactOptions(client, location)) {
    if (!contact.id) continue
    const name = normalized(contact.nume)
    const phone = normalized(contact.telefon).replace(/[\s().-]/g, "")
    const email = normalized(contact.email)
    const key = JSON.stringify(name || phone || email ? [name, phone, email] : [contact.id])
    // Prefer the location's contact, unless an existing ticket selected another copy.
    if (!options.has(key) || contact.id === selectedId) options.set(key, contact)
  }
  return [...options.values()]
}
