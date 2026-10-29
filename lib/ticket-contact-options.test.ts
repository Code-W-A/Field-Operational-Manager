import test from "node:test"
import assert from "node:assert/strict"
import { freshReinterventionContact, resolveTicketContact } from "@/firebase-functions/src/client-ticket-sync"
import { ticketContactSelectOptions } from "./ticket-contact-options"

const contact = { id: "local", nume: "Olga Ungureanu", telefon: "0729777837", email: "ungureanuolga@yahoo.com" }
const fixture = () => ({ id: "client", nume: "Primaria Barlad", persoaneContact: [{ ...contact, id: "general" }],
  locatii: [{ id: "location", nume: "1 Decembrie", persoaneContact: [{ ...contact }] }] })

test("same contact with different client/location IDs appears once without mutating records", () => {
  const client = fixture(), before = structuredClone(client)
  assert.deepEqual(ticketContactSelectOptions(client, client.locatii[0]), [contact])
  assert.deepEqual(client, before)
})

test("existing selected ID is retained and either stored ID still resolves", () => {
  const client = fixture()
  for (const contactId of ["local", "general"]) {
    const options = ticketContactSelectOptions(client, client.locatii[0], contactId)
    assert.equal(options.length, 1)
    assert.equal(options[0].id, contactId)
    const work = { clientId: client.id, locationId: "location", contactId }
    assert.equal(resolveTicketContact(client, work).contact.id, contactId)
    assert.equal(freshReinterventionContact(client, work).contactId, contactId)
  }
})

test("case, spaces and phone punctuation do not create duplicate choices", () => {
  const client = fixture()
  client.persoaneContact[0] = { ...contact, id: "general", nume: " OLGA   UNGUREANU ", telefon: "(0729) 777-837", email: " UNGUREANUOLGA@YAHOO.COM " }
  assert.equal(ticketContactSelectOptions(client, client.locatii[0]).length, 1)
})

test("same names with different phone, email or missing information remain separate", () => {
  for (const change of [{ telefon: "0700000000" }, { email: "alt@example.com" }, { nume: "Alt contact" }, { email: "" }]) {
    const client = fixture()
    Object.assign(client.persoaneContact[0], change)
    assert.equal(ticketContactSelectOptions(client, client.locatii[0]).length, 2)
  }
})

test("duplicates within one source collapse; contacts without IDs remain unselectable", () => {
  const client = fixture()
  client.locatii[0].persoaneContact.push({ ...contact, id: "local-copy" }, { ...contact, id: "" })
  assert.equal(ticketContactSelectOptions(client, client.locatii[0]).length, 1)
  assert.equal(ticketContactSelectOptions(client, client.locatii[0], "local-copy")[0].id, "local-copy")
  assert.deepEqual(ticketContactSelectOptions({}, {}), [])
})
