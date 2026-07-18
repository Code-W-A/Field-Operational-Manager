import { expect, test, type Download } from "@playwright/test"

import { hrContext } from "../salariati/hr.helpers"
import { reportDocumentCounts, resetReportsFixture, seedOvertimeRequest, seedReportTimesheet } from "./overtime.helpers"

async function readDownload(download: Download) {
  const stream = await download.createReadStream()
  if (!stream) throw new Error("CSV download stream unavailable")
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString("utf8")
}

test.describe("REP-007 exporturi overtime", () => {
  test.beforeEach(resetReportsFixture)

  test("REP-007 descarca si pastreaza cele trei CSV-uri fara mutatii Firebase", async ({ browser }) => {
    await seedOvertimeRequest({ id: "rep-export", date: "2026-07-08", overtimeHours: 1.5, reason: "Intervenție \"urgentă\"" })
    await seedReportTimesheet({
      "8": { code: "WORK", entries: [{ start: "08:00", end: "18:00", project: "Pontaj", attendanceSessionId: "att-export" }] },
    })
    const before = await reportDocumentCounts()

    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.clock.install({ time: new Date("2026-07-14T09:00:00+03:00") })
    await page.goto("/dashboard/resurse-umane/rapoarte?tab=overtime")

    const summaryPromise = page.waitForEvent("download")
    await page.getByTestId("overtime-export-summary").click()
    const summary = await summaryPromise
    expect(summary.suggestedFilename()).toBe("ore-suplimentare-2026-sumar.csv")
    const summaryCsv = await readDownload(summary)
    expect(summaryCsv.startsWith("\uFEFF")).toBe(true)
    expect(summaryCsv).toContain('"Angajat","Total Ore","Nr. Cereri"')
    expect(summaryCsv).toContain('"Tehnician E2E_PONTAJ_STAGE5","1,5 h","1"')

    const detailedPromise = page.waitForEvent("download")
    await page.getByTestId("overtime-export-detailed").click()
    const detailed = await detailedPromise
    expect(detailed.suggestedFilename()).toBe("ore-suplimentare-2026-detaliat.csv")
    const detailedCsv = await readDownload(detailed)
    expect(detailedCsv.startsWith("\uFEFF")).toBe(true)
    expect(detailedCsv).toContain('"Angajat","Data","Ore","Motiv"')
    expect(detailedCsv).toContain('"08.07.2026"')
    expect(detailedCsv).toContain('Intervenție ""urgentă""')

    await page.getByRole("tab", { name: "Reconciliere condică" }).click()
    await expect(page.getByTestId("overtime-export-reconciliation")).toBeEnabled()
    const reconciliationPromise = page.waitForEvent("download")
    await page.getByTestId("overtime-export-reconciliation").click()
    const reconciliation = await reconciliationPromise
    expect(reconciliation.suggestedFilename()).toBe("ore-suplimentare-reconciliere-2026.csv")
    const reconciliationCsv = await readDownload(reconciliation)
    expect(reconciliationCsv.startsWith("\uFEFF")).toBe(true)
    expect(reconciliationCsv).toContain('"Status reconciliere"')
    expect(reconciliationCsv).toContain('"Confirmat"')
    expect.poll(reportDocumentCounts).toEqual(before)
    await context.close()
  })
})
