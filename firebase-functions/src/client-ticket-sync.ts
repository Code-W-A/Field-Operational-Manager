// Pure rules shared by Functions, the ticket UI and the reconciliation CLI.
export type SyncRecord = Record<string, any>
const text = (value: unknown) => typeof value === "string" ? value.trim() : ""
const rows = (value: any): SyncRecord[] => Array.isArray(value) ? value : []
const unique = (values: SyncRecord[], predicate: (v: SyncRecord) => boolean) => {
  const matches = values.filter(predicate)
  return matches.length === 1 ? matches[0] : null
}
export class ContactAssociationError extends Error {}
export const readContactPath = (record: SyncRecord, path: string): any =>
  path.split(".").reduce((value, key) => value?.[key], record)

export function isContactSyncEligible(work: SyncRecord): boolean {
  const status = text(work.statusLucrare).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return !work.archivedAt && !work.archived && !work.anulat && !work.anulatAt && !status.startsWith("arhivat") && !status.startsWith("anulat")
}

export function resolveTicketLocation(client: SyncRecord, work: SyncRecord) {
  const clientId = text(work.clientId || work.clientInfo?.id)
  if (clientId && clientId !== text(client.id)) throw new ContactAssociationError("Clientul asociat nu corespunde tichetului.")
  if (!clientId && (!text(work.client) || text(work.client) !== text(client.nume))) throw new ContactAssociationError("Clientul trebuie selectat explicit.")
  return resolveLocationWithinClient(client, work)
}

/** Location-only resolver for callers that have already fetched the selected client. */
export function resolveLocationWithinClient(client: SyncRecord, work: SyncRecord) {
  const locationId = text(work.locationId || work.clientInfo?.locationId || work.clientInfo?.locatieId)
  const location = locationId
    ? unique(rows(client.locatii), l => text(l.id) === locationId)
    : unique(rows(client.locatii), l => {
      const name = text(work.locatie || work.clientInfo?.locationName)
      const address = text(work.clientInfo?.locationAddress)
      return Boolean(name || address) && (!name || text(l.nume) === name) && (!address || text(l.adresa) === address)
    })
  if (!location) throw new ContactAssociationError("Locația lipsește sau este ambiguă. Selectați locația actuală.")
  return location
}

export function ticketContactOptions(client: SyncRecord, location: SyncRecord): SyncRecord[] {
  const local = rows(location.persoaneContact)
  return [...local, ...rows(client.persoaneContact).filter(c => !c.id || !local.some(p => p.id === c.id))]
}

export function resolveTicketContact(client: SyncRecord, work: SyncRecord) {
  const location = resolveTicketLocation(client, work)
  const contactId = text(work.contactId)
  const candidates = ticketContactOptions(client, location)
  const contact = contactId
    ? unique(candidates, c => text(c.id) === contactId)
    : unique(candidates, c => {
      const name = text(work.persoanaContact)
      const phone = text(work.telefon)
      const email = text(work.persoanaContactEmail)
      return Boolean(name || phone || email) && (!name || text(c.nume) === name)
        && (!phone || text(c.telefon) === phone) && (!email || text(c.email) === email)
    })
  if (!contact) throw new ContactAssociationError("Contactul lipsește sau este ambiguu. Selectați contactul actual.")
  return { location, contact }
}

function values(client: SyncRecord, location: SyncRecord, contact: SyncRecord): Record<string, string> {
  return {
    client: text(client.nume), locatie: text(location.nume), locationName: text(location.nume), locationAddress: text(location.adresa),
    persoanaContact: text(contact.nume), telefon: text(contact.telefon), persoanaContactEmail: text(contact.email),
    "clientInfo.nume": text(client.nume), "clientInfo.adresa": text(client.adresa),
    "clientInfo.locationName": text(location.nume), "clientInfo.locationAddress": text(location.adresa),
    "clientInfo.locationEmail": text(contact.email), "clientInfo.contactEmail": text(contact.email),
    "clientInfo.email": text(client.email), "clientInfo.telefon": text(client.telefon),
    "clientInfo.locationPhone": text(contact.telefon),
  }
}

export function currentTicketContactValues(client: SyncRecord, work: SyncRecord) {
  const { location, contact } = resolveTicketContact(client, work)
  return { location, contact, values: values(client, location, contact) }
}

export function planClientTicketSync(before: SyncRecord, current: SyncRecord, work: SyncRecord) {
  const patch: SyncRecord = {}
  const conflicts: string[] = []
  if (!isContactSyncEligible(work)) return { patch, conflicts }
  let oldResolved: ReturnType<typeof resolveTicketContact>
  let next: ReturnType<typeof currentTicketContactValues>
  try {
    // Already migrated tickets resolve by IDs even when an older event arrives later.
    oldResolved = resolveTicketContact(before, work)
    next = currentTicketContactValues(current, {
      ...work, clientId: current.id,
      locationId: work.locationId || oldResolved.location.id,
      contactId: work.contactId || oldResolved.contact.id,
    })
  } catch (error) {
    return { patch, conflicts: [error instanceof Error ? error.message : "Asociere imposibilă"] }
  }
  const previous = values(before, oldResolved.location, oldResolved.contact)
  const baseline: SyncRecord = { ...(work.contactSync?.values || {}) }
  for (const [path, desired] of Object.entries(next.values)) {
    const existing = readContactPath(work, path)
    // Missing fields do not authorize overwriting a deliberately blank value.
    if (existing === undefined) continue
    if (text(existing) === desired) {
      if (desired !== "" || Object.prototype.hasOwnProperty.call(baseline, path)) baseline[path] = desired
      continue
    }
    const tracked = Object.prototype.hasOwnProperty.call(baseline, path)
    const safe = tracked ? text(existing) === baseline[path] : text(existing) !== "" && text(existing) === previous[path]
    if (safe) {
      patch[path] = desired
      baseline[path] = desired
    } else conflicts.push(path)
  }
  // Preserve list membership, custom entries and every non-contact property.
  if (Array.isArray(work.persoaneContact)) {
    const oldContacts = ticketContactOptions(before, oldResolved.location)
    const newContacts = ticketContactOptions(current, next.location)
    const updated = work.persoaneContact.map((entry: SyncRecord, index: number) => {
      const old = entry.id ? unique(oldContacts, c => c.id === entry.id)
        : unique(oldContacts, c => text(c.nume) === text(entry.nume) && text(c.telefon) === text(entry.telefon) && text(c.email) === text(entry.email))
      const live = old?.id ? unique(newContacts, c => c.id === old.id) : null
      if (!old || !live) { conflicts.push(`persoaneContact.${index}`); return entry }
      const result: SyncRecord = { ...entry, ...(live.id ? { id: live.id } : {}) }
      for (const key of ["nume", "telefon", "email"]) {
        if (entry[key] === undefined) continue
        const path = `persoaneContact.${live.id}.${key}`
        const existing = text(entry[key]), desired = text(live[key])
        if (existing === desired || (Object.prototype.hasOwnProperty.call(baseline, path)
          ? existing === baseline[path] : existing !== "" && existing === text(old[key]))) {
          result[key] = desired
          if (desired !== "" || Object.prototype.hasOwnProperty.call(baseline, path)) baseline[path] = desired
        } else conflicts.push(path)
      }
      return result
    })
    if (JSON.stringify(updated) !== JSON.stringify(work.persoaneContact)) patch.persoaneContact = updated
  }
  for (const [key, value] of Object.entries({ clientId: current.id, locationId: next.location.id, contactId: next.contact.id })) {
    if (value && !work[key]) patch[key] = value
  }
  const metadata = { clientId: current.id, locationId: next.location.id || "", contactId: next.contact.id || "", values: baseline, conflicts: conflicts.slice().sort() }
  if (JSON.stringify(work.contactSync) !== JSON.stringify(metadata)) patch.contactSync = metadata
  return { patch, conflicts }
}

/** Reinterventions intentionally start with live data, never inherited manual overrides. */
export function freshReinterventionContact(client: SyncRecord, work: SyncRecord): SyncRecord {
  const live = currentTicketContactValues(client, work)
  if (!live.location.id || !live.contact.id) throw new ContactAssociationError("Salvați fișa clientului pentru a atribui ID-uri locației și contactului.")
  const baseline = { ...live.values }
  for (const entry of rows(live.location.persoaneContact)) {
    if (entry.id) for (const key of ["nume", "telefon", "email"]) baseline[`persoaneContact.${entry.id}.${key}`] = text(entry[key])
  }
  const result: SyncRecord = {
    clientId: client.id, locationId: live.location.id, contactId: live.contact.id,
    client: client.nume, locatie: live.location.nume, locationName: live.location.nume,
    persoanaContact: text(live.contact.nume), telefon: text(live.contact.telefon), persoanaContactEmail: text(live.contact.email),
    persoaneContact: rows(live.location.persoaneContact),
    clientInfo: { ...(work.clientInfo || {}), id: client.id, locationId: live.location.id },
    contactSync: { clientId: client.id, locationId: live.location.id, contactId: live.contact.id, values: baseline, conflicts: [] },
  }
  for (const [path, value] of Object.entries(live.values)) {
    if (path.startsWith("clientInfo.")) result.clientInfo[path.slice(11)] = value
  }
  return result
}

/** Stored ticket values preserve overrides; missing values may use a uniquely linked live record. */
export function ticketContactDisplay(work: SyncRecord, client?: SyncRecord | null) {
  let live: Record<string, string> = {}
  try { if (client && isContactSyncEligible(work)) live = currentTicketContactValues(client, work).values } catch { /* no guessed contacts */ }
  const pick = (path: string) => readContactPath(work, path) !== undefined ? text(readContactPath(work, path)) : live[path] || ""
  return { name: pick("persoanaContact"), phone: pick("telefon"), email: pick("persoanaContactEmail"),
    location: pick("locatie"), address: pick("clientInfo.locationAddress") }
}

export function ticketClientIdentityDisplay(work: SyncRecord, client?: SyncRecord | null) {
  const live = isContactSyncEligible(work) ? client || {} : {}
  const stored = work.clientInfo || {}
  return { name: text(work.client ?? stored.nume ?? live.nume), phone: text(stored.telefon ?? live.telefon),
    email: text(stored.email ?? live.email), address: text(stored.adresa ?? live.adresa) }
}
