import {
  isContactSyncEligible,
  readContactPath,
  resolveTicketContact,
  resolveTicketLocation,
  type SyncRecord,
} from "@/firebase-functions/src/client-ticket-sync"

const text = (value: unknown) => typeof value === "string" ? value.trim() : ""

/** Read-only presentation model. Never merge this result into a saved work or a PDF input. */
export function resolveTicketLiveDisplay(work: SyncRecord, client?: SyncRecord | null) {
  const issues = new Set<string>()
  const eligible = isContactSyncEligible(work)
  const linkedId = text(work.clientId || work.clientInfo?.id)
  const validClient = client && (linkedId
    ? linkedId === text(client.id)
    : Boolean(text(work.client)) && text(work.client) === text(client.nume))
  const live = eligible && validClient ? client : null
  let location: SyncRecord | null = null
  let contact: SyncRecord | null = null
  if (live) {
    try { location = resolveTicketLocation(live, work) } catch {
      issues.add("Locația nu poate fi identificată sigur. Datele salvate au fost păstrate.")
    }
    if (location) {
      try { contact = resolveTicketContact(live, work).contact } catch {
        issues.add("Contactul nu poate fi identificat sigur. Selectați contactul actual în formularul de editare.")
      }
    }
  }
  const source = work.contactSync
  const trackedClient = live && source?.clientId === live.id
  const trackedLocation = trackedClient && location && (!source.locationId || source.locationId === location.id)
  const trackedContact = trackedLocation && contact && (!source.contactId || source.contactId === contact.id)

  const pick = (paths: string[], current: unknown, available: boolean, tracked: unknown, label: string) => {
    const path = paths.find(key => readContactPath(work, key) !== undefined) || paths[0]
    const stored = readContactPath(work, path)
    if (!available) return text(stored)
    const desired = text(current)
    if (stored === undefined || text(stored) === desired) return desired
    if (tracked && Object.prototype.hasOwnProperty.call(source?.values || {}, path)
      && text(stored) === text(source.values[path])) return desired
    issues.add(`${label}: valoarea salvată diferă de fișa clientului și a fost păstrată pentru verificare.`)
    return text(stored)
  }

  const identity = {
    name: pick(["client", "clientInfo.nume"], live?.nume, Boolean(live), trackedClient, "Nume client"),
    phone: pick(["clientInfo.telefon"], live?.telefon, Boolean(live), trackedClient, "Telefon client"),
    email: pick(["clientInfo.email"], live?.email, Boolean(live), trackedClient, "Email client"),
    address: pick(["clientInfo.adresa"], live?.adresa, Boolean(live), trackedClient, "Adresă client"),
    cui: pick(["clientInfo.cui", "clientInfo.cif"], live?.cui ?? live?.cif, Boolean(live), trackedClient, "CUI/CIF"),
    reg: pick(["clientInfo.rc", "clientInfo.regCom"], live?.regCom, Boolean(live), trackedClient, "Nr. ordine ONRC"),
    representative: pick(["clientInfo.reprezentantFirma"], live?.reprezentantFirma, Boolean(live), trackedClient, "Reprezentant firmă"),
    representativeRole: pick(["clientInfo.functieReprezentant"], live?.functieReprezentant, Boolean(live), trackedClient, "Funcție reprezentant"),
  }
  const contactDisplay = {
    name: pick(["persoanaContact"], contact?.nume, Boolean(contact), trackedContact, "Nume contact"),
    phone: pick(["telefon"], contact?.telefon, Boolean(contact), trackedContact, "Telefon contact"),
    email: pick(["persoanaContactEmail"], contact?.email, Boolean(contact), trackedContact, "Email contact"),
    location: pick(["locatie", "clientInfo.locationName", "locationName"], location?.nume, Boolean(location), trackedLocation, "Nume locație"),
    address: pick(["clientInfo.locationAddress", "locationAddress"], location?.adresa, Boolean(location), trackedLocation, "Adresă locație"),
  }
  return { identity, contact: contactDisplay, issues: [...issues] }
}
