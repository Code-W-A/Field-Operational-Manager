import assert from "node:assert/strict"
import test from "node:test"
import { isUninvoicedWork, toUninvoicedReportRow } from "./uninvoiced"

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
})
