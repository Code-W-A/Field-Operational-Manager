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
  assert.equal(isUninvoicedWork({ ...base, motivNefacturare: "Revizie cuprinsă în abonament" }), false)
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

test("formatEquipmentLabel ignorează whitespace și valori nule", () => {
  assert.equal(formatEquipmentLabel("  Motor  ", "  M-01  "), "Motor (M-01)")
  assert.equal(formatEquipmentLabel(null, undefined), "—")
  assert.equal(formatEquipmentLabel("   ", "   "), "—")
  assert.equal(formatEquipmentLabel(undefined, "COD"), "COD")
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

test("rândul fără echipament folosește placeholder", () => {
  const row = toUninvoicedReportRow({
    id: "work-3",
    nrLucrare: "#003",
    raportGenerat: true,
    statusLucrare: "Finalizat",
  })
  assert.equal(row.equipment, "—")
})


test("installation #002168 uses the final handover instead of the ordinary report flag", () => {
  const work = {
    nrLucrare: "#002168", tipLucrare: "Instalare", statusLucrare: "Finalizat", preluatDispecer: true,
    tehnicieni: [], statusFacturare: "Nefacturat",
    installation: { schemaVersion: 1, closedReason: "completed", completionDocumentId: "final" },
  }
  assert.equal(isUninvoicedWork(work), true)
  assert.equal(isUninvoicedWork({ ...work, raportGenerat: false }), true)
  for (const invoice of [
    { numarFactura: "F-1" },
    { facturaDocument: { url: "https://example.test/invoice.pdf" } },
    { facturaDocument: { fileName: "invoice.pdf" } },
    { facturaDocument: { numarFactura: "F-1" } },
    { statusFacturare: "Facturat" },
    { statusFacturare: "Nu se facturează" },
    { motivNefacturare: "Inclus în contract" },
  ]) assert.equal(isUninvoicedWork({ ...work, ...invoice }), false)
})

test("unfinished, unsigned and continuation installations are not invoice-ready", () => {
  for (const installation of [
    { schemaVersion: 1 },
    { schemaVersion: 1, closedReason: "completed" },
    { schemaVersion: 1, completionDocumentId: "draft" },
    { schemaVersion: 1, closedReason: "continuation", completionDocumentId: "final" },
  ]) assert.equal(isUninvoicedWork({ raportGenerat: true, installation, statusFacturare: "Nefacturat" }), false)
  assert.equal(isUninvoicedWork(null), false)
})
