import test from "node:test"
import assert from "node:assert/strict"
import { resolveRecipientEmailForLocation as resolve } from "./shared"

const work = {
  locationId: "loc-1", persoanaContact: "Marf Admin", locatie: "Avangarde Home",
  clientInfo: { locationEmail: "support@marf.ro", email: "support@marf.ro", contactEmail: "support@marf.ro" },
  email: "support@marf.ro", persoanaContactEmail: "support@marf.ro",
}
const location = {
  id: "loc-1", nume: "Avangarde Home", adresa: "Strada Crinului 25",
  email: "location@example.com",
  persoaneContact: [{ nume: "Alt Contact", email: "other@example.com" }, { nume: "Marf Admin", email: "suport@marf.ro" }],
}

test("current named location contact overrides all historical ticket addresses", () => {
  assert.equal(resolve({ locatii: [location], email: "client@example.com" }, work), "suport@marf.ro")
})

test("location ID wins over a stale location name", () => {
  assert.equal(resolve({ locatii: [{ ...location, id: "other", nume: "Old", persoaneContact: [] }, location] }, { ...work, locatie: "Old" }), "suport@marf.ro")
})

test("legacy tickets resolve location by name or address", () => {
  for (const legacy of [
    { ...work, locationId: undefined },
    { ...work, locationId: undefined, locatie: undefined, clientInfo: { locationAddress: location.adresa } },
  ]) assert.equal(resolve({ locatii: [location] }, legacy), "suport@marf.ro")
})

test("fallback order uses only current location and client data", () => {
  const client = { locatii: [structuredClone(location)], email: "client@example.com", persoaneContact: [{ email: "general@example.com" }] }
  client.locatii[0].persoaneContact[1].email = "invalid"
  assert.equal(resolve(client, work), "other@example.com")
  client.locatii[0].persoaneContact = []
  assert.equal(resolve(client, work), "location@example.com")
  client.locatii[0].email = ""
  assert.equal(resolve(client, work), "client@example.com")
  client.email = ""
  assert.equal(resolve(client, work), "general@example.com")
  client.persoaneContact = []
  assert.equal(resolve(client, work), null)
})

test("missing current records never fall back to ticket emails", () => {
  assert.equal(resolve(null, work), null)
  assert.equal(resolve({}, work), null)
  assert.equal(resolve({ email: "client@example.com" }, null), null)
})

test("current address is normalized before sending", () => {
  assert.equal(resolve({ email: " Marf Admin <suport@marf.ro> " }, { ...work, locationId: undefined }), "suport@marf.ro")
})

test("contact ID distinguishes identical names and deleted IDs cannot choose another recipient", () => {
  const contacts = [{ id: "a", nume: "Admin", email: "first@example.ro" }, { id: "b", nume: "Admin", email: "second@example.ro" }]
  const client = { locatii: [{ ...location, persoaneContact: contacts }] }
  assert.equal(resolve(client, { ...work, persoanaContact: "Admin", contactId: "b" }), "second@example.ro")
  assert.equal(resolve(client, { ...work, persoanaContact: "Admin" }), null)
  assert.equal(resolve(client, { ...work, contactId: "deleted" }), null)
  assert.equal(resolve(client, { ...work, locationId: "deleted" }), null)
})
