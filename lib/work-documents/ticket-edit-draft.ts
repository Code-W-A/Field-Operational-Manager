import type { SyncRecord } from "@/firebase-functions/src/client-ticket-sync"
import { resolveTicketLiveDisplay } from "./ticket-live-display"

/** Hydrate only inherited identity fields. Explicit ticket differences remain intact. */
export function ticketEditDraft(work: SyncRecord, client?: SyncRecord | null) {
  const display = resolveTicketLiveDisplay(work, client)
  return {
    fields: {
      client: display.identity.name,
      locatie: display.contact.location,
      persoanaContact: display.contact.name,
      telefon: display.contact.phone,
      persoanaContactEmail: display.contact.email,
    },
    issues: display.issues,
  }
}
