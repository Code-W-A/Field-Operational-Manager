import test from "node:test"
import assert from "node:assert/strict"
import { stableWorkLocation, scheduledWorkLocation, writesWorkAssociation, planLegacyRevisionLocationRepair } from "./work-location-association"

const location = { id: "location-id", nume: "Cladire Admin", echipamente: [{ id: "eq" }] }
const client = { id: "client", nume: "Monsanto", locatii: [location] }
const work = { clientId: "client", locationId: "location-id", locatie: "Cladire Admin" }

test("writes accept stable IDs and reject names, foreign IDs and conflicting snapshots", () => {
  assert.equal(stableWorkLocation(client, work), location)
  for (const patch of [{ locationId: "Cladire Admin" }, { locationId: "foreign" }, { clientId: "other" }, { locatie: "Other" }, { clientInfo: { locationId: "old-id" } }]) {
    assert.throws(() => stableWorkLocation(client, { ...work, ...patch }))
  }
  assert.equal(stableWorkLocation(client, { clientId: "client", locatie: location.nume }).id, location.id)
  assert.throws(() => stableWorkLocation({ ...client, locatii: [{ nume: location.nume }] }, { clientId: client.id, locatie: location.nume }))
})

test("only scheduler converts exact legacy names; ambiguous and deleted IDs stay blocked", () => {
  assert.equal(scheduledWorkLocation(client, { locationId: location.nume, locationName: location.nume }).id, location.id)
  assert.equal(scheduledWorkLocation(client, { locationId: location.id, locationName: location.nume }).id, location.id)
  assert.throws(() => scheduledWorkLocation(client, { locationId: "deleted", locationName: location.nume }))
  assert.throws(() => scheduledWorkLocation({ ...client, locatii: [location, { ...location, id: "duplicate" }] }, { locationId: location.nume }))
  assert.throws(() => scheduledWorkLocation(client, {}))
})

test("unrelated updates remain available on legacy tickets", () => {
  for (const patch of [{ statusLucrare: "Finalizat" }, { revisionEquipmentTimes: {} }, { notificationRead: true }, { descriere: "text" }]) assert.equal(writesWorkAssociation(patch), false)
  for (const patch of [{ locationId: "name" }, { clientInfo: {} }, { clientId: "client" }, { locatie: "name" }]) assert.equal(writesWorkAssociation(patch), true)
})

test("repair changes only the ID and rejects ambiguous locations, foreign equipment and frozen work", () => {
  const legacy = { ...work, locationId: location.nume, tipLucrare: "Revizie", statusLucrare: "Atribuită", equipmentIds: ["eq"] }
  assert.deepEqual(planLegacyRevisionLocationRepair(client, legacy), { locationId: location.id })
  for (const patch of [{ equipmentIds: ["foreign"] }, { equipmentIds: [] }, { archived: true }, { statusLucrare: "Finalizat" }, { tipLucrare: "Intervenție" }, { locationId: "unknown" }, { clientInfo: { locationId: "conflict" } }]) assert.throws(() => planLegacyRevisionLocationRepair(client, { ...legacy, ...patch }))
})
