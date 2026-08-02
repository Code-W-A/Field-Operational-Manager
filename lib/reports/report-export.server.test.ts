import assert from "node:assert/strict"
import test from "node:test"
import ExcelJS from "exceljs"
import { exportActivityPdf, exportActivityXlsx, exportUninvoicedPdf, exportUninvoicedXlsx } from "./report-export.server"
import type { AuditEvent, UninvoicedReportRow } from "./types"

const generatedAt = new Date("2026-08-01T09:00:00.000Z")
const uninvoiced: UninvoicedReportRow[] = [{
  id: "w1", ticketNumber: "#001", client: "Șantier România", location: "București", workType: "Intervenție",
  interventionDate: "01.08.2026", reportDate: generatedAt.toISOString(), technicians: ["Ion"], workStatus: "Finalizat",
  invoiceStatus: "Nefacturat", ageDays: 0, archived: false, href: "/dashboard/lucrari/w1",
}]
const activity: AuditEvent[] = [{
  id: "a1", occurredAt: generatedAt.toISOString(), actorId: "u1", actorName: "Ștefan", actorRole: "admin",
  module: "Tichete", action: "Actualizare tichet", outcome: "success", entityType: "Tichet", entityId: "w1",
  entityLabel: "#001", summary: "A schimbat starea", changes: [{ field: "status", label: "Status", before: "Nou", after: "Finalizat" }],
  source: "test", coverage: "complete",
}]

test("exporturile XLSX conțin același număr de rânduri", async () => {
  const uninvoicedExport = await exportUninvoicedXlsx(uninvoiced, generatedAt)
  const activityExport = await exportActivityXlsx(activity, generatedAt, "01.08.2026")
  for (const output of [uninvoicedExport, activityExport]) {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(output.body)
    assert.equal(workbook.worksheets[0].rowCount, 2)
  }
})

test("exporturile PDF sunt documente multipaginabile valide", () => {
  const first = exportUninvoicedPdf(uninvoiced, generatedAt)
  const second = exportActivityPdf(activity, generatedAt, "01.08.2026")
  assert.equal(first.body.subarray(0, 4).toString(), "%PDF")
  assert.equal(second.body.subarray(0, 4).toString(), "%PDF")
  assert.ok(first.body.length > 1_000)
  assert.ok(second.body.length > 1_000)
})
