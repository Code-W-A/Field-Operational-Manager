import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { presentAuditEvent } from "./activity-presentation"
import { exportActivityPdf, exportActivityXlsx, exportUninvoicedPdf, exportUninvoicedXlsx } from "./report-export.server"
import type { AuditEvent, UninvoicedReportRow } from "./types"

const generatedAt = new Date("2026-08-01T09:00:00.000Z")
const uninvoiced: UninvoicedReportRow[] = [{
  id: "w1", ticketNumber: "#001", client: "Șantier România", location: "București", workType: "Intervenție",
  equipment: "Ușă secțională (R72A123)",
  interventionDate: "01.08.2026", reportDate: generatedAt.toISOString(), technicians: ["Ion"], workStatus: "Finalizat",
  invoiceStatus: "Nefacturat", ageDays: 0, archived: false, href: "/dashboard/lucrari/w1",
}]
const activity: AuditEvent[] = [{
  id: "a1", occurredAt: generatedAt.toISOString(), actorId: "u1", actorName: "Ștefan", actorRole: "admin",
  module: "Tichete", action: "Actualizare tichet", outcome: "success", entityType: "Tichet", entityId: "w1",
  entityLabel: "#001", summary: "A schimbat starea", changes: [
    { field: "statusLucrare", label: "statusLucrare", before: "Nou", after: "Finalizat" },
    { field: "products", label: "products", before: "[]", after: '[{"denumire":"Filtru","cantitate":2}]' },
  ],
  source: "test", coverage: "complete",
}]

test("exporturile XLSX conțin același număr de rânduri", async () => {
  const uninvoicedExport = await exportUninvoicedXlsx(uninvoiced, generatedAt)
  const activityExport = await exportActivityXlsx(activity, generatedAt, "01.08.2026")
  for (const output of [uninvoicedExport, activityExport]) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(output.body as any)
    assert.equal(workbook.worksheets[0].rowCount, 2)
  }
})

test("exportul nefacturate include coloana Echipament", async () => {
  const output = await exportUninvoicedXlsx(uninvoiced, generatedAt)
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output.body as any)
  const header = (workbook.worksheets[0].getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String)
  const row = (workbook.worksheets[0].getRow(2).values as ExcelJS.CellValue[]).slice(1).map(String)
  assert.ok(header.includes("Echipament"))
  assert.equal(row[header.indexOf("Echipament")], "Ușă secțională (R72A123)")
})
test("exportul de activitate folosește texte lizibile și nu expune JSON", async () => {
  const output = await exportActivityXlsx(activity, generatedAt, "01.08.2026")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output.body as any)
  const values = workbook.worksheets[0].getRow(2).values as ExcelJS.CellValue[]
  const row = values.slice(1).map(String)
  const text = row.join(" | ")
  assert.match(text, /A actualizat tichetul #001/)
  assert.match(text, /Status tichet: Nou → Finalizat/)
  assert.match(text, /Produse ofertă: Niciun element → 1 produs/)
  assert.doesNotMatch(text, /statusLucrare|\{"denumire"/)
})

test("exportul explică semantic timpii reviziei și ascunde ID-urile echipamentelor", async () => {
  const revision = presentAuditEvent({
    ...activity[0],
    id: "revision-1",
    changes: [{
      field: "revisionEquipmentTimes",
      label: "revisionEquipmentTimes",
      before: '{"equipment-internal-id":{"startIso":"2026-08-01T08:00:00.000Z"}}',
      after: '{"equipment-internal-id":{"startIso":"2026-08-01T08:00:00.000Z","endIso":"2026-08-01T09:00:00.000Z","durationText":"1h 0m"}}',
    }],
  }, { equipmentLabels: { "equipment-internal-id": "Centrală termică (CT-01)" } })
  const output = await exportActivityXlsx([revision], generatedAt, "01.08.2026")
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(output.body as any)
  const values = workbook.worksheets[0].getRow(2).values as ExcelJS.CellValue[]
  const text = values.slice(1).map(String).join(" | ")
  assert.match(text, /A finalizat revizia pentru Centrală termică \(CT-01\)/)
  assert.match(text, /Revizie – Centrală termică \(CT-01\)/)
  assert.doesNotMatch(text, /equipment-internal-id|revisionEquipmentTimes|\{"/)
})

test("exporturile PDF sunt documente multipaginabile valide", () => {
  const first = exportUninvoicedPdf(uninvoiced, generatedAt)
  const second = exportActivityPdf(activity, generatedAt, "01.08.2026")
  assert.equal(first.body.subarray(0, 4).toString(), "%PDF")
  assert.equal(second.body.subarray(0, 4).toString(), "%PDF")
  assert.ok(first.body.length > 1_000)
  assert.ok(second.body.length > 1_000)
})
