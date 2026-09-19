import { currentTicketContactValues, isContactSyncEligible, readContactPath, ticketContactOptions, type SyncRecord } from "./client-ticket-sync"

export type ContactCorrection = { path: string; before: unknown; after: unknown; sourceId?: string }
export type ContactReconciliation = {
  ticketId: string; clientId: string; locationId?: string; contactId?: string
  differences: ContactCorrection[]; issues: string[]
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Report candidates only. A difference is not authorization to overwrite a manual value. */
export function reportTicketContact(client: SyncRecord, work: SyncRecord): ContactReconciliation {
  const report: ContactReconciliation = { ticketId: work.id, clientId: client.id, differences: [], issues: [] }
  if (!isContactSyncEligible(work)) { report.issues.push("Tichet arhivat sau anulat"); return report }
  try {
    const live = currentTicketContactValues(client, work)
    report.locationId = live.location.id || ""
    report.contactId = live.contact.id || ""
    for (const [path, after] of Object.entries(live.values)) {
      const before = readContactPath(work, path)
      if (before !== undefined && !equal(before, after)) report.differences.push({ path, before, after })
    }
    for (const [index, entry] of (work.persoaneContact || []).entries()) {
      const contacts = ticketContactOptions(client, live.location)
      const matched = contacts.filter(c => entry.id ? c.id === entry.id : c.nume === entry.nume && c.telefon === entry.telefon && c.email === entry.email)
      if (matched.length !== 1) { report.issues.push(`persoaneContact.${index}: asociere ambiguă sau lipsă`); continue }
      for (const key of ["nume", "telefon", "email"]) {
        const after = matched[0][key] || ""
        if (entry[key] !== undefined && !equal(entry[key], after)) report.differences.push({ path: `persoaneContact.${index}.${key}`, before: entry[key], after, sourceId: matched[0].id || "" })
      }
    }
  } catch (error) { report.issues.push(error instanceof Error ? error.message : "Asociere imposibilă") }
  return report
}

/** Compare the reviewed report with fresh client/ticket data inside the caller's transaction. */
export function planSelectedContactCorrections(client: SyncRecord, work: SyncRecord, reviewed: ContactReconciliation, fields: string[]) {
  const fresh = reportTicketContact(client, work)
  const patch: SyncRecord = {}, skipped: string[] = []
  if (reviewed.ticketId !== work.id || reviewed.clientId !== client.id || fresh.locationId !== reviewed.locationId || fresh.contactId !== reviewed.contactId || !isContactSyncEligible(work)) {
    return { patch, skipped: fields }
  }
  const baseline = { ...(work.contactSync?.values || {}) }
  for (const path of fields) {
    const approved = reviewed.differences.find(d => d.path === path)
    const actual = fresh.differences.find(d => d.path === path)
    if (!approved || !actual || approved.sourceId !== actual.sourceId || !equal(approved.before, actual.before) || !equal(approved.after, actual.after)) { skipped.push(path); continue }
    if (path.startsWith("persoaneContact.")) {
      const [, index, key] = path.split(".")
      patch.persoaneContact ||= work.persoaneContact.map((entry: SyncRecord) => ({ ...entry }))
      patch.persoaneContact[Number(index)][key] = actual.after
      const id = work.persoaneContact[Number(index)].id
      if (id) baseline[`persoaneContact.${id}.${key}`] = actual.after
    } else { patch[path] = actual.after; baseline[path] = actual.after }
  }
  if (Object.keys(patch).length) patch.contactSync = { clientId: client.id, locationId: fresh.locationId || "", contactId: fresh.contactId || "", values: baseline,
    conflicts: (work.contactSync?.conflicts || []).filter((path: string) => !fields.includes(path) || skipped.includes(path)) }
  return { patch, skipped }
}
