import test from "node:test"
import assert from "node:assert/strict"
import { resolveTicketLiveDisplay } from "./ticket-live-display"
import { freshReinterventionContact, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

function fixture() {
  const client: SyncRecord = { id: "c", nume: "Client", adresa: "Sediu", telefon: "100", email: "office@example.test", cif: "RO123", regCom: "J123",
    locatii: [{ id: "l", nume: "Locație", adresa: "Adresă", persoaneContact: [{ id: "p", nume: "Contact", telefon: "200", email: "contact@example.test" }] }] }
  const seed = { id: "w", clientId: "c", locationId: "l", contactId: "p", statusLucrare: "Finalizat", clientInfo: { cui: "RO123", rc: "J123" } }
  const work: SyncRecord = structuredClone({ ...seed, ...freshReinterventionContact(client, seed), offerVersions: [{ name: "Istoric" }] })
  return { client, work }
}

test("afișează datele moștenite actuale fără să modifice tichetul sau documentele", () => {
  const { client, work } = fixture(), saved = structuredClone(work)
  Object.assign(client, { nume: "Client nou", adresa: "Sediu nou", telefon: "101", email: "nou@example.test" })
  Object.assign(client.locatii[0], { nume: "Locație nouă", adresa: "Adresă nouă" })
  Object.assign(client.locatii[0].persoaneContact[0], { nume: "Contact nou", telefon: "201", email: "contact-nou@example.test" })
  const result = resolveTicketLiveDisplay(work, client)
  assert.deepEqual(result.contact, { name: "Contact nou", phone: "201", email: "contact-nou@example.test", location: "Locație nouă", address: "Adresă nouă" })
  assert.equal(result.identity.name, "Client nou")
  assert.equal(result.identity.address, "Sediu nou")
  assert.equal(result.identity.phone, "101")
  assert.equal(result.identity.email, "nou@example.test")
  assert.deepEqual(result.issues, [])
  assert.deepEqual(work, saved)
})

test("păstrează excepțiile manuale și valorile goale chiar dacă există proveniență", () => {
  const { client, work } = fixture()
  work.telefon = "999"; work.persoanaContactEmail = ""; work.client = "Denumire manuală"
  const result = resolveTicketLiveDisplay(work, client)
  assert.equal(result.contact.phone, "999")
  assert.equal(result.contact.email, "")
  assert.equal(result.identity.name, "Denumire manuală")
  assert.equal(result.issues.length, 3)
})

test("fără proveniență păstrează datele vechi și semnalează diferențele", () => {
  const { client, work } = fixture(); delete work.contactSync
  client.nume = "Nou"; client.locatii[0].persoaneContact[0].telefon = "300"
  const result = resolveTicketLiveDisplay(work, client)
  assert.equal(result.identity.name, "Client")
  assert.equal(result.contact.phone, "200")
  assert.equal(result.issues.length, 2)
})

test("câmpurile lipsă primesc sursa actuală; golurile nemonitorizate nu", () => {
  const { client, work } = fixture(); delete work.contactSync
  delete work.telefon; work.persoanaContactEmail = ""
  const result = resolveTicketLiveDisplay(work, client)
  assert.equal(result.contact.phone, "200")
  assert.equal(result.contact.email, "")
  assert.equal(result.issues.length, 1)
})

test("un gol moștenit monitorizat poate primi noua valoare", () => {
  const { client, work } = fixture(); work.telefon = ""; work.contactSync.values.telefon = ""
  assert.equal(resolveTicketLiveDisplay(work, client).contact.phone, "200")
})

test("contactul șters nu blochează firma și locația și nu selectează un omonim", () => {
  const { client, work } = fixture()
  client.nume = "Nou"; client.locatii[0].adresa = "Nouă"
  client.locatii[0].persoaneContact[0].id = "altul"
  client.locatii[0].persoaneContact[0].telefon = "999"
  const result = resolveTicketLiveDisplay(work, client)
  assert.equal(result.identity.name, "Nou")
  assert.equal(result.contact.address, "Nouă")
  assert.equal(result.contact.phone, "200")
  assert.equal(result.issues.length, 1)
})

test("locația ștearsă nu blochează firma și nu selectează o locație omonimă", () => {
  const { client, work } = fixture(); client.locatii[0].id = "altul"; client.nume = "Nou"
  const result = resolveTicketLiveDisplay(work, client)
  assert.equal(result.identity.name, "Nou")
  assert.equal(result.contact.location, "Locație")
  assert.equal(result.issues.length, 1)
})

test("client greșit sau inaccesibil păstrează exclusiv datele salvate", () => {
  const { client, work } = fixture(); client.id = "altul"; client.nume = "Greșit"
  assert.deepEqual(resolveTicketLiveDisplay(work, client), resolveTicketLiveDisplay(work, null))
})

test("asocierea legacy exactă este read-only și refuză locații/contacte ambigue", () => {
  const { client, work } = fixture(); delete work.clientId; delete work.clientInfo.id; delete work.locationId; delete work.clientInfo.locationId; delete work.contactId
  const saved = structuredClone(work)
  assert.deepEqual(resolveTicketLiveDisplay(work, client).issues, [])
  client.locatii[0].persoaneContact.push({ ...client.locatii[0].persoaneContact[0], id: "p2" })
  assert.match(resolveTicketLiveDisplay(work, client).issues.join(), /Contactul/)
  client.locatii.push({ ...client.locatii[0], id: "l2" })
  assert.match(resolveTicketLiveDisplay(work, client).issues.join(), /Locația/)
  assert.deepEqual(work, saved)
})

test("proveniența unui alt contact nu autorizează suprascrierea", () => {
  const { client, work } = fixture()
  work.contactSync.contactId = "old"; client.locatii[0].persoaneContact[0].telefon = "300"
  assert.equal(resolveTicketLiveDisplay(work, client).contact.phone, "200")
})

for (const marker of [{ statusLucrare: "Arhivată" }, { statusLucrare: "Anulată" }, { archivedAt: "ieri" }, { archived: true }, { anulat: true }, { anulatAt: "ieri" }]) {
  test(`istoric fără fallback live: ${JSON.stringify(marker)}`, () => {
    const { client, work } = fixture(); Object.assign(work, marker)
    delete work.telefon; delete work.clientInfo.cui
    assert.deepEqual(resolveTicketLiveDisplay(work, client), resolveTicketLiveDisplay(work, null))
    assert.equal(resolveTicketLiveDisplay(work, client).contact.phone, "")
    assert.equal(resolveTicketLiveDisplay(work, client).identity.cui, "")
  })
}

test("CUI/CIF, ONRC și reprezentant folosesc fallback live numai când lipsesc copiile", () => {
  const { client, work } = fixture(); delete work.clientInfo.cui; delete work.clientInfo.rc
  client.reprezentantFirma = "Reprezentant"
  assert.equal(resolveTicketLiveDisplay(work, client).identity.cui, "RO123")
  assert.equal(resolveTicketLiveDisplay(work, client).identity.reg, "J123")
  assert.equal(resolveTicketLiveDisplay(work, client).identity.representative, "Reprezentant")
  work.clientInfo.cui = "ROOLD"
  assert.equal(resolveTicketLiveDisplay(work, client).identity.cui, "ROOLD")
})
