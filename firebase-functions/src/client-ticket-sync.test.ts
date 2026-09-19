import test from "node:test"
import assert from "node:assert/strict"
import { freshReinterventionContact, planClientTicketSync, resolveTicketContact, ticketContactDisplay, ticketClientIdentityDisplay, type SyncRecord } from "./client-ticket-sync"
import { reportTicketContact, planSelectedContactCorrections } from "./client-contact-reconciliation"

const client = (): SyncRecord => ({ id: "c", nume: "MARF", adresa: "HQ", email: "office@marf.ro", telefon: "100",
  locatii: [{ id: "l", nume: "Avangarde", adresa: "Adresa veche", persoaneContact: [{ id: "p", nume: "Admin", telefon: "200", email: "support@marf.ro", functie: "Administrator" }] }] })
const work = (): SyncRecord => ({ id: "w", clientId: "c", locationId: "l", contactId: "p", client: "MARF", locatie: "Avangarde",
  persoanaContact: "Admin", telefon: "200", persoanaContactEmail: "support@marf.ro", statusLucrare: "Finalizat",
  clientInfo: { nume: "MARF", adresa: "HQ", locationAddress: "Adresa veche", custom: "keep" },
  persoaneContact: [{ ...client().locatii[0].persoaneContact[0], note: "keep" }],
  reportSnapshot: { email: "support@marf.ro" }, offerVersions: [{ email: "support@marf.ro" }], products: [{ price: 100 }] })
function apply(record: SyncRecord, patch: SyncRecord) {
  const updated = structuredClone(record)
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split("."), key = keys.pop()!
    let target = updated
    for (const part of keys) target = target[part] ||= {}
    target[key] = structuredClone(value)
  }
  return updated
}

for (const [label, mutate, path, expected] of [
  ["email", (c: SyncRecord) => c.locatii[0].persoaneContact[0].email = "suport@marf.ro", "persoanaContactEmail", "suport@marf.ro"],
  ["telefon", (c: SyncRecord) => c.locatii[0].persoaneContact[0].telefon = "300", "telefon", "300"],
  ["nume contact", (c: SyncRecord) => c.locatii[0].persoaneContact[0].nume = "Admin nou", "persoanaContact", "Admin nou"],
  ["nume client", (c: SyncRecord) => c.nume = "MARF nou", "client", "MARF nou"],
  ["nume locatie", (c: SyncRecord) => c.locatii[0].nume = "Locatie noua", "locatie", "Locatie noua"],
  ["adresa", (c: SyncRecord) => c.locatii[0].adresa = "Adresa noua", "clientInfo.locationAddress", "Adresa noua"],
] as const) test(`sincronizează ${label} inclusiv Finalizat`, () => {
  const before = client(), current = client(); mutate(current)
  const result = planClientTicketSync(before, current, work())
  assert.equal(result.patch[path], expected)
})

test("actualizare simultană, copii și documente emise intacte; duplicatul nu scrie", () => {
  const before = client(), current = client(), original = work()
  current.nume = "Nou"; current.locatii[0].adresa = "Noua"
  Object.assign(current.locatii[0].persoaneContact[0], { nume: "Nou", telefon: "300", email: "suport@marf.ro" })
  const updated = apply(original, planClientTicketSync(before, current, original).patch)
  assert.equal(updated.persoaneContact[0].email, "suport@marf.ro")
  assert.equal(updated.persoaneContact[0].note, "keep")
  assert.equal(updated.clientInfo.custom, "keep")
  for (const key of ["reportSnapshot", "offerVersions", "products"]) assert.deepEqual(updated[key], original[key])
  assert.deepEqual(planClientTicketSync(before, current, updated).patch, {})
})

test("asociere legacy exactă și unică atribuie ID-uri", () => {
  const w = work(); delete w.clientId; delete w.locationId; delete w.contactId
  const current = client(); current.locatii[0].adresa = "Noua"
  const patch = planClientTicketSync(client(), current, w).patch
  assert.equal(patch.clientId, "c"); assert.equal(patch.locationId, "l"); assert.equal(patch.contactId, "p")
  assert.equal(patch["clientInfo.locationAddress"], "Noua")
})

test("contacte cu nume identice: numai ID-ul sau datele vechi unice disting", () => {
  const c = client(), w = work()
  c.locatii[0].persoaneContact.push({ id: "p2", nume: "Admin", telefon: "999", email: "other@marf.ro" })
  assert.equal(resolveTicketContact(c, w).contact.id, "p")
  delete w.contactId
  assert.equal(resolveTicketContact(c, w).contact.id, "p")
  delete w.telefon; delete w.persoanaContactEmail
  assert.throws(() => resolveTicketContact(c, w), /ambiguu/)
})

test("nu acceptă potrivire parțială, ID șters sau locație ambiguă", () => {
  const c = client(), w = work(); delete w.locationId
  w.locatie = "Avant"; assert.throws(() => resolveTicketContact(c, w))
  w.locationId = "deleted"; w.locatie = "Avangarde"; assert.throws(() => resolveTicketContact(c, w))
  delete w.locationId; c.locatii.push({ ...c.locatii[0], id: "l2" })
  assert.throws(() => resolveTicketContact(c, w))
})

test("excepții manuale și valori goale rămân nemodificate, inclusiv linkuri", () => {
  const before = client(), current = client(), w = work()
  w.telefon = "manual"; w.persoanaContactEmail = ""; w.clientInfo.locationAddress = "Manual address"
  current.locatii[0].persoaneContact[0].telefon = "300"; current.locatii[0].persoaneContact[0].email = "suport@marf.ro"
  const result = planClientTicketSync(before, current, w)
  assert.equal(result.patch.telefon, undefined); assert.equal(result.patch.persoanaContactEmail, undefined)
  assert.ok(result.conflicts.includes("telefon")); assert.ok(result.conflicts.includes("persoanaContactEmail"))
  assert.deepEqual(ticketContactDisplay(apply(w, result.patch), current), { name: "Admin", phone: "manual", email: "", location: "Avangarde", address: "Manual address" })
})

test("un gol nemonitorizat nu devine permisiune după un eveniment fără schimbare", () => {
  const before = client(), w = work(); before.locatii[0].persoaneContact[0].email = ""; w.persoanaContactEmail = ""
  const tracked = apply(w, planClientTicketSync(before, before, w).patch)
  const patch = planClientTicketSync(before, client(), tracked).patch
  assert.equal(patch.persoanaContactEmail, undefined)
})

for (const status of [{ statusLucrare: "Arhivată" }, { statusLucrare: "Anulată" }, { archivedAt: "2026-09-10" }, { anulatAt: "2026-09-10" }]) {
  test(`exclude istoricul ${JSON.stringify(status)}`, () => {
    assert.deepEqual(planClientTicketSync(client(), client(), { ...work(), ...status }).patch, {})
  })
}

test("contact șters semnalează conflict fără a alege alt contact", () => {
  const current = client(); current.locatii[0].persoaneContact = [{ id: "new", nume: "Admin", email: "other@marf.ro" }]
  const result = planClientTicketSync(client(), current, work())
  assert.deepEqual(result.patch, {}); assert.equal(result.conflicts.length, 1)
})

test("evenimente în ordine inversă converg către clientul recitit", () => {
  const a = client(), b = client(), c = client()
  b.locatii[0].persoaneContact[0].email = "b@marf.ro"; c.locatii[0].persoaneContact[0].email = "c@marf.ro"
  let w = apply(work(), planClientTicketSync(b, c, work()).patch)
  w = apply(w, planClientTicketSync(a, c, w).patch)
  assert.equal(w.persoanaContactEmail, "c@marf.ro")
  assert.deepEqual(planClientTicketSync(b, c, w).patch, {})
})

test("reintervenția folosește sursa actuală fără a modifica arhiva", () => {
  const archived = { ...work(), statusLucrare: "Arhivată", telefon: "manual vechi" }, saved = structuredClone(archived), c = client()
  c.locatii[0].persoaneContact[0].telefon = "300"
  const fresh = freshReinterventionContact(c, archived)
  assert.equal(fresh.telefon, "300"); assert.equal(fresh.contactId, "p"); assert.deepEqual(archived, saved)
})

test("contactul general este asociat unic; nu alegem primul dintre contacte identice", () => {
  const c = client(), w = work()
  c.persoaneContact = c.locatii[0].persoaneContact; c.locatii[0].persoaneContact = []
  delete w.contactId
  assert.equal(resolveTicketContact(c, w).contact.id, "p")
  c.persoaneContact.push({ ...c.persoaneContact[0], id: "p2" })
  assert.throws(() => resolveTicketContact(c, w))
})

test("snapshoturile noi urmăresc inclusiv câmpurile goale copiate din sursa selectată", () => {
  const before = client(); before.locatii[0].persoaneContact[0].email = ""
  const initial = { ...work(), ...freshReinterventionContact(before, work()) }
  const updated = apply(initial, planClientTicketSync(before, client(), initial).patch)
  assert.equal(updated.persoanaContactEmail, "support@marf.ro")
  assert.equal(updated.persoaneContact[0].email, "support@marf.ro")
})

test("identitatea clientului păstrează snapshotul manual; arhivele nu primesc fallback live", () => {
  const w = work(); w.client = "Client manual"; w.clientInfo.telefon = ""; w.clientInfo.email = "manual@example.ro"
  assert.deepEqual(ticketClientIdentityDisplay(w, client()), { name: "Client manual", phone: "", email: "manual@example.ro", address: "HQ" })
  assert.equal(ticketContactDisplay({ ...w, statusLucrare: "Arhivată", persoanaContactEmail: undefined }, client()).email, "")
})

test("raportul este inert; aplicarea cere câmpuri explicite și verifică schimbări concurente", () => {
  const c = client(), w = work(), saved = structuredClone(w)
  c.locatii[0].persoaneContact[0].telefon = "300"; c.locatii[0].adresa = "noua"
  const report = reportTicketContact(c, w)
  assert.deepEqual(w, saved)
  assert.deepEqual(planSelectedContactCorrections(c, w, report, []).patch, {})
  const planned = planSelectedContactCorrections(c, w, report, ["telefon"])
  assert.equal(planned.patch.telefon, "300"); assert.equal(planned.patch["clientInfo.locationAddress"], undefined)
  assert.deepEqual(planSelectedContactCorrections(c, { ...w, telefon: "concurent" }, report, ["telefon"]).skipped, ["telefon"])
  assert.deepEqual(planSelectedContactCorrections(c, { ...w, archivedAt: "now" }, report, ["telefon"]).patch, {})
  c.locatii[0].persoaneContact[0].telefon = "400"
  assert.deepEqual(planSelectedContactCorrections(c, w, report, ["telefon"]).patch, {})
})

test("reconcilierea nu aplică o corecție altui contact după reordonarea listei", () => {
  const c = client(), w = work()
  c.locatii[0].persoaneContact[0].telefon = "300"
  const report = reportTicketContact(c, w)
  w.persoaneContact[0].id = "p2"
  c.locatii[0].persoaneContact.push({ ...c.locatii[0].persoaneContact[0], id: "p2" })
  assert.deepEqual(planSelectedContactCorrections(c, w, report, ["persoaneContact.0.telefon"]).patch, {})
})
