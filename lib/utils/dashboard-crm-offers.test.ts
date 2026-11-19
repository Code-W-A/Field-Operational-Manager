import test from "node:test"
import assert from "node:assert/strict"
import { buildCrmOfferDashboardItems } from "./dashboard-crm-offers"

const opportunity = {
  id: "op-38",
  code: "OP.38",
  title: "Bariera serviciu",
  clientId: "client-1",
  pipelineStage: "OFERTA_ACCEPTATA",
}

test("oferta CRM acceptată apare verde și deschide oportunitatea", () => {
  const [item] = buildCrmOfferDashboardItems({
    offers: [{ id: "offer-1", opportunityId: "op-38", status: "ACCEPTED", version: 1, response: { status: "accept", at: "2026-11-19T14:00:00Z" } }],
    opportunities: [opportunity],
    clients: [],
    legacyClients: [{ id: "client-1", nume: "Firma Veche SRL" }],
  })
  assert.equal(item.locatie, "OP.38")
  assert.equal(item.equipmentLabel, "Firma Veche SRL")
  assert.equal(item.workType, "Bariera serviciu")
  assert.equal(item.offerStatus, "accept")
  assert.equal(item.href, "/crm/opportunities/op-38/offers")
})

test("rămâne ultima versiune, iar oportunitatea ieșită din ofertă dispare", () => {
  const items = buildCrmOfferDashboardItems({
    offers: [
      { id: "old", opportunityId: "op-38", status: "REJECTED", version: 1 },
      { id: "new", opportunityId: "op-38", status: "SENT", version: 2, sentAt: "2026-11-19T10:00:00Z" },
      { id: "done", opportunityId: "op-9", status: "ACCEPTED", version: 1 },
    ],
    opportunities: [
      { ...opportunity, pipelineStage: "OFERTA_TRANSMISA" },
      { id: "op-9", code: "OP.9", pipelineStage: "FACTURA_DE_AVANS" },
    ],
  })
  assert.deepEqual(items.map((item) => item.id), ["new"])
  assert.equal(items[0].offerStatus, undefined)
})

test("acceptate, refuzate și în așteptare se sortează ca la oferte", () => {
  const items = buildCrmOfferDashboardItems({
    offers: [
      { id: "wait", opportunityId: "a", status: "SENT", sentAt: "2026-11-01T00:00:00Z" },
      { id: "no", opportunityId: "b", status: "REJECTED", response: { at: "2026-11-02T00:00:00Z" } },
      { id: "yes", opportunityId: "c", status: "ACCEPTED", response: { at: "2026-11-03T00:00:00Z" } },
    ],
    opportunities: [
      { id: "a", code: "A", pipelineStage: "OFERTA_TRANSMISA" },
      { id: "b", code: "B", pipelineStage: "OFERTA_REFUZATA" },
      { id: "c", code: "C", pipelineStage: "OFERTA_ACCEPTATA" },
    ],
  })
  assert.deepEqual(items.map((item) => item.id), ["yes", "no", "wait"])
})
