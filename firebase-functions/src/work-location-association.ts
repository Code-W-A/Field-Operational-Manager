import { ContactAssociationError, resolveTicketLocation, type SyncRecord } from "./client-ticket-sync"

const text = (value: unknown): string => typeof value === "string" ? value.trim() : ""

/** Validate at the write boundary; an invalid explicit ID must never fall back to a name. */
export function stableWorkLocation(client: SyncRecord, work: SyncRecord): SyncRecord {
  const location = resolveTicketLocation(client, work)
  if (!text(location.id)) throw new ContactAssociationError("Locația nu are un ID stabil. Corectați locația clientului înainte de salvare.")
  for (const id of [work.locationId, work.clientInfo?.locationId, work.clientInfo?.locatieId]) {
    if (text(id) && text(id) !== text(location.id)) {
      throw new ContactAssociationError("ID-ul locației nu corespunde locației selectate. Selectați din nou locația.")
    }
  }
  const name = text(work.locatie || work.locationName)
  if (name && name !== text(location.nume)) {
    throw new ContactAssociationError("Denumirea locației nu corespunde ID-ului selectat. Selectați din nou locația.")
  }
  return location
}

/** Old contract calendars store names as IDs. Resolve only an exact, unique name,
 * then pass the real ID to the writer. This exception is limited to the scheduler. */
export function scheduledWorkLocation(client: SyncRecord, entry: SyncRecord): SyncRecord {
  const locations: SyncRecord[] = Array.isArray(client.locatii) ? client.locatii : []
  const id = text(entry.locationId), name = text(entry.locationName)
  const byId = locations.filter(location => text(location.id) && text(location.id) === id)
  if (byId.length === 1) return stableWorkLocation(client, { clientId: client.id, locationId: id, locatie: name })
  if (byId.length || (id && name && id !== name)) {
    throw new ContactAssociationError("Calendarul contractului conține o locație invalidă sau ambiguă.")
  }
  const legacyName = name || id
  const matches = locations.filter(location => legacyName && text(location.nume) === legacyName)
  if (matches.length !== 1) throw new ContactAssociationError("Selectați o locație unică în calendarul contractului.")
  return stableWorkLocation(client, { clientId: client.id, locationId: matches[0].id, locatie: matches[0].nume })
}

/** Only deliberate association writes are guarded. Status, QR, duration and
 * read receipts on old tickets must remain usable without migrating history. */
export function writesWorkAssociation(patch: SyncRecord): boolean {
  return ["clientId", "client", "locationId", "locationName", "locatie", "clientInfo"].some(key => key in patch)
}

/** Scope of the reviewed repair: one active revision with an exact legacy name
 * and equipment belonging to that location. Never change contacts or snapshots. */
export function planLegacyRevisionLocationRepair(client: SyncRecord, work: SyncRecord) {
  if (work.tipLucrare !== "Revizie" || work.archived || work.archivedAt || work.anulat || work.anulatAt || /^(arhivat|anulat|finalizat)/i.test(text(work.statusLucrare))) {
    throw new ContactAssociationError("Corectarea este permisă doar pentru revizii active.")
  }
  if (text(work.clientId || work.clientInfo?.id) !== text(client.id)) throw new ContactAssociationError("Client diferit.")
  const location = scheduledWorkLocation(client, { locationId: work.locationId, locationName: work.locatie })
  if (text(work.locationId) !== text(location.nume) || text(work.locationId) === text(location.id)) {
    throw new ContactAssociationError("Tichetul nu are forma legacy aprobată pentru corectare.")
  }
  const equipment = new Set((location.echipamente || []).map((row: SyncRecord) => text(row.id)))
  if (!Array.isArray(work.equipmentIds) || !work.equipmentIds.length || work.equipmentIds.some((id: unknown) => !text(id) || !equipment.has(text(id)))) {
    throw new ContactAssociationError("Echipamentele nu corespund integral locației.")
  }
  stableWorkLocation(client, { ...work, locationId: location.id })
  return { locationId: String(location.id) }
}
