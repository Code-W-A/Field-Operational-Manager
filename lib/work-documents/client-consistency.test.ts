import test from "node:test"
import assert from "node:assert/strict"
import { createClientIndex, withClientWorkCounts } from "@/lib/client-work-links"
import { createTicketListDisplays } from "./ticket-list-display"
import { documentClientPdfFields, resolveDocumentClientSnapshot, withDocumentClientSnapshot } from "./document-client-snapshot"
import { buildOfferVersionPdfInput } from "./offer-pdf-input"
import { freshReinterventionContact, type SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

function fixture() {
  const client: SyncRecord = { id: "c", nume: "Client", cui: "RO1", regCom: "J1", adresa: "Sediu",
    locatii: [{ id: "l", nume: "Locație", adresa: "Adresă", persoaneContact: [{ id: "p", nume: "Contact", telefon: "100", email: "a@example.test" }] }] }
  const seed = { id: "w", clientId: "c", locationId: "l", contactId: "p", statusLucrare: "Listată" }
  const work: SyncRecord = { ...seed, ...freshReinterventionContact(client, seed), clientInfo: { ...freshReinterventionContact(client, seed).clientInfo, cui: "RO1", rc: "J1" } }
  return { client, work: structuredClone(work) }
}

test("client counts follow IDs after rename, with legacy exact unique matching only", () => {
  const clients = [{ id: "a", nume: "Nou" }, { id: "b", nume: "Altul" }]
  const works = [{ clientId: "a", client: "Vechi" }, { clientInfo: { id: "a" }, client: "Vechi" },
    { client: "Nou" }, { clientId: "missing", client: "Nou" }, { clientId: "b", clientInfo: { id: "a" } }]
  assert.deepEqual(withClientWorkCounts(clients, works).map(c => c.numarLucrari), [3, 1])
  assert.deepEqual(withClientWorkCounts(clients, []).map(c => c.numarLucrari), [0, 0])
})
test("duplicate names never attach legacy works to either client", () => {
  const clients = [{ id: "a", nume: "Comun" }, { id: "b", nume: "Comun" }]
  assert.equal(createClientIndex(clients).resolve({ client: "Comun" }), null)
  assert.equal(createClientIndex(clients).resolve({ client: "comun" }), null)
  assert.equal(createClientIndex(clients).resolve({ clientId: "a", client: "Comun" })?.id, "a")
})
test("list projection refreshes searchable fields and leaves raw save input unchanged", () => {
  const { client, work } = fixture(), before = structuredClone(work)
  client.nume = "Actual"; client.locatii[0].nume = "Nouă"; client.locatii[0].persoaneContact[0].telefon = "200"
  const display = createTicketListDisplays([work], [client]).get("w")!
  assert.equal(display.client, "Actual"); assert.equal(display.locatie, "Nouă"); assert.equal(display.telefon, "200")
  assert.deepEqual(work, before)
})
test("list projection preserves overrides, empty fields and historical tickets", () => {
  const { client, work } = fixture(); client.nume = "Actual"; work.telefon = ""; work.locatie = "Manuală"
  const result = createTicketListDisplays([work, { ...work, id: "archive", statusLucrare: "Arhivată" }, { ...work, id: "cancel", statusLucrare: "Anulat" }], [client])
  assert.equal(result.get("w")?.telefon, ""); assert.equal(result.get("w")?.locatie, "Manuală")
  assert.equal(result.get("archive")?.client, "Client"); assert.equal(result.get("cancel")?.client, "Client")
})
test("new document captures current fiscal identity and safe contact overrides", () => {
  const { client, work } = fixture(), before = structuredClone(work)
  Object.assign(client, { nume: "Actual", cui: "RO2", regCom: "J2", adresa: "Sediu nou" })
  work.telefon = "Manual"; work.persoanaContactEmail = ""
  const snapshot = resolveDocumentClientSnapshot(work, client)
  assert.equal(snapshot.client, "Actual"); assert.equal(snapshot.clientInfo.cui, "RO2"); assert.equal(snapshot.clientInfo.rc, "J2")
  assert.equal(snapshot.clientInfo.adresa, "Sediu nou"); assert.equal(snapshot.telefon, "Manual"); assert.equal(snapshot.persoanaContactEmail, "")
  assert.equal(work.clientInfo.cui, before.clientInfo.cui)
})
test("current fiscal empty values remain empty rather than reviving obsolete copies", () => {
  const { client, work } = fixture(); client.cui = ""; client.regCom = ""; client.adresa = ""
  const fields = documentClientPdfFields(resolveDocumentClientSnapshot(work, client))
  assert.deepEqual(fields.beneficiar, { name: "Client", cui: "", reg: "", address: "" })
})
test("wrong explicit client cannot issue a new document by name fallback", () => {
  const { client, work } = fixture(); client.id = "other"
  assert.throws(() => resolveDocumentClientSnapshot(work, client), /identificat sigur/)
})
test("deleted contact keeps saved contact without blocking updated fiscal identity", () => {
  const { client, work } = fixture(); client.locatii[0].persoaneContact = []; client.nume = "Nou"
  const snapshot = resolveDocumentClientSnapshot(work, client)
  assert.equal(snapshot.client, "Nou"); assert.equal(snapshot.telefon, "100")
})
test("saved offer/deviz/report identity stays frozen after later client and work edits", () => {
  const { client, work } = fixture()
  const snapshot = resolveDocumentClientSnapshot(work, client)
  client.nume = "Viitor"; work.client = "Viitor"; work.clientInfo.cui = "RO999"
  const projected = withDocumentClientSnapshot(work, snapshot)
  assert.equal(projected.client, "Client"); assert.equal(projected.clientInfo.cui, "RO1")
  const pdf = buildOfferVersionPdfInput({ lucrareId: "w", work, version: { clientSnapshot: snapshot, products: [{ name: "Piesă", quantity: 1, price: 10 }] }, versionNumber: 1, fallbackVatPercent: 21 })
  assert.equal(pdf.client, "Client"); assert.equal(pdf.beneficiar?.cui, "RO1")
  assert.equal(work.client, "Viitor")
})
test("legacy document downloads retain their previous input and no live client lookup", () => {
  const { work } = fixture()
  assert.equal(withDocumentClientSnapshot(work, undefined), work)
  assert.deepEqual(documentClientPdfFields(undefined), {})
})
test("archived new snapshot uses stored historic identity", () => {
  const { client, work } = fixture(); work.statusLucrare = "Arhivată"; client.nume = "Viitor"
  assert.equal(resolveDocumentClientSnapshot(work, client).client, "Client")
})
