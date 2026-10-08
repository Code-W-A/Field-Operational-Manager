import { isContactSyncEligible, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"
import { linkedClientId } from "@/lib/client-work-links"
import { resolveTicketLiveDisplay } from "./ticket-live-display"

import type { DocumentClientSnapshot } from "@/packages/fom-domain/documents";
export type { DocumentClientSnapshot } from "@/packages/fom-domain/documents";

/** Freeze only document identity fields; never merge this projection into the work document. */
export function resolveDocumentClientSnapshot(work: SyncRecord, client: SyncRecord): DocumentClientSnapshot {
  const id = linkedClientId(work)
  if (!client?.id || (id ? id !== client.id : !work.client || work.client !== client.nume)) {
    throw new Error("Clientul documentului nu poate fi identificat sigur. Verificați asocierea tichetului.")
  }
  const display = resolveTicketLiveDisplay(work, client)
  const live = isContactSyncEligible(work) ? client : {}
  const stored = work.clientInfo || {}
  const name = String(live.nume ?? work.client ?? stored.nume ?? "")
  return {
    version: 1, clientId: client.id, client: name,
    locatie: display.contact.location, persoanaContact: display.contact.name,
    telefon: display.contact.phone, persoanaContactEmail: display.contact.email,
    clientInfo: {
      nume: name, cui: String(live.cui ?? live.cif ?? stored.cui ?? stored.cif ?? ""),
      rc: String(live.regCom ?? stored.rc ?? ""), adresa: String(live.adresa ?? stored.adresa ?? ""),
      locationName: display.contact.location, locationAddress: display.contact.address,
    },
  }
}

export function withDocumentClientSnapshot<T extends SyncRecord>(work: T, snapshot?: DocumentClientSnapshot | null): T {
  if (!snapshot || snapshot.version !== 1) return work
  return { ...work, client: snapshot.client, locatie: snapshot.locatie, persoanaContact: snapshot.persoanaContact,
    telefon: snapshot.telefon, persoanaContactEmail: snapshot.persoanaContactEmail,
    clientInfo: { ...work.clientInfo, ...snapshot.clientInfo } }
}

/** Overrides only a new snapshot's identity; absent snapshots retain the legacy PDF behavior. */
export function documentClientPdfFields(snapshot?: DocumentClientSnapshot | null) {
  if (!snapshot || snapshot.version !== 1) return {}
  return { client: snapshot.client, attentionTo: snapshot.persoanaContact, locationName: snapshot.locatie,
    beneficiar: { name: snapshot.client, cui: snapshot.clientInfo.cui, reg: snapshot.clientInfo.rc, address: snapshot.clientInfo.adresa } }
}
