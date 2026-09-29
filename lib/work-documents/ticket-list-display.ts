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
