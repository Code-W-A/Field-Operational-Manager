import assert from "node:assert/strict"
import test from "node:test"
import { formatEquipmentLabel, isUninvoicedWork, toUninvoicedReportRow } from "./uninvoiced"

test("un tichet este nefacturat doar după generarea raportului", () => {
  assert.equal(isUninvoicedWork({ statusFacturare: "Nefacturat" }), false)
  assert.equal(isUninvoicedWork({ raportGenerat: true, statusFacturare: "Nefacturat" }), true)
})

test("exclude toate semnalele de facturare rezolvată", () => {
  const base = { raportGenerat: true, statusFacturare: "Nefacturat" }
  assert.equal(isUninvoicedWork({ ...base, numarFactura: "F-10" }), false)
  assert.equal(isUninvoicedWork({ ...base, facturaDocument: { url: "https://example.test/f.pdf" } }), false)
  assert.equal(isUninvoicedWork({ ...base, motivNefacturare: "Garanție" }), false)
  assert.equal(isUninvoicedWork({ ...base, statusFacturare: "Facturat" }), false)
  assert.equal(isUninvoicedWork({ ...base, statusFacturare: "Nu se facturează" }), false)
})

test("rândul raportului păstrează tichetele arhivate și calculează vechimea", () => {
  const row = toUninvoicedReportRow(
    {
      id: "work-1",
      nrLucrare: "#001",
      raportGenerat: true,
      statusLucrare: "Arhivată",
      statusFacturare: "Nefacturat",
      raportSnapshot: { dataGenerare: "2026-07-01T08:00:00.000Z" },
    },
    new Date("2026-07-04T08:00:00.000Z"),
  )
  assert.equal(row.archived, true)
  assert.equal(row.href, "/dashboard/arhivate/work-1")
  assert.equal(row.ageDays, 3)
  assert.equal(row.equipment, "—")
})

test("formatEquipmentLabel combină numele și codul", () => {
  assert.equal(formatEquipmentLabel("Ușă secțională", "R72A123"), "Ușă secțională (R72A123)")
  assert.equal(formatEquipmentLabel("Ușă secțională", ""), "Ușă secțională")
  assert.equal(formatEquipmentLabel("", "R72A123"), "R72A123")
  assert.equal(formatEquipmentLabel("", ""), "—")
})

test("rândul include echipamentul din câmpurile principale", () => {
  const row = toUninvoicedReportRow({
    id: "work-2",
    nrLucrare: "#002",
    raportGenerat: true,
    statusLucrare: "Finalizat",
    echipament: "Ușă secțională",
    echipamentCod: "R72A123",
  })
  assert.equal(row.equipment, "Ușă secțională (R72A123)")
})
