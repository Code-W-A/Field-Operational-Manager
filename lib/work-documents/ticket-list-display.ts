import { createClientIndex } from "@/lib/client-work-links"
import { resolveTicketLiveDisplay } from "./ticket-live-display"
import type { SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

export function ticketListDisplay(work: SyncRecord, client?: SyncRecord | null) {
  const display = resolveTicketLiveDisplay(work, client)
  return { client: display.identity.name, locatie: display.contact.location,
    persoanaContact: display.contact.name, telefon: display.contact.phone, persoanaContactEmail: display.contact.email }
}

export function createTicketListDisplays(works: SyncRecord[], clients: SyncRecord[]) {
  const index = createClientIndex(clients)
  return new Map(works.map(work => [String(work.id), ticketListDisplay(work, index.resolve(work))]))
}

const copiedClientFields = new Set(["client", "locatie", "locationName", "locationAddress", "persoanaContact", "telefon",
  "persoanaContactEmail", "email", "clientInfo", "persoaneContact", "contactSync"])

export function matchesTicketSearchText(work: SyncRecord, display: ReturnType<typeof ticketListDisplay>, term: string) {
  const lower = term.toLocaleLowerCase("ro")
  if (Object.values(display).some(value => value.toLocaleLowerCase("ro").includes(lower))) return true
  return Object.entries(work).some(([key, value]) => {
    if (copiedClientFields.has(key) || value == null || typeof value === "object" && !Array.isArray(value)) return false
    if (Array.isArray(value)) return value.some(item => typeof item !== "object" && String(item).toLocaleLowerCase("ro").includes(lower))
    return String(value).toLocaleLowerCase("ro").includes(lower)
  })
}
