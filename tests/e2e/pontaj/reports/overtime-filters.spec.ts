import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { RUN_ID } from "../../fixtures/pontaj-minimal"
import { employeeId, hrContext } from "../salariati/hr.helpers"
import { REPORT_YEAR, reportDocumentCounts, resetReportsFixture, seedOvertimeRequest } from "./overtime.helpers"

test.describe("REP-004 filtre overtime", () => {
  test.beforeEach(resetReportsFixture)

  test("REP-004 filtreaza corect anul, luna si salariatul fara scrieri", async ({ browser }) => {
    const secondEmployeeId = employeeId("reports-second")
    await e2eDb.collection("hrEmployees").doc(secondEmployeeId).set({
      prenume: "Ana",
      nume: "Secund",
      active: true,
      ownerRunId: RUN_ID,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await Promise.all([
      seedOvertimeRequest({ id: "rep-filter-january", date: "2026-01-31", overtimeHours: 1 }),
      seedOvertimeRequest({ id: "rep-filter-july", date: "2026-07-08", overtimeHours: 2 }),
      seedOvertimeRequest({ id: "rep-filter-december", date: "2026-12-31", overtimeHours: 3 }),
      seedOvertimeRequest({ id: "rep-filter-previous-year", date: "2025-12-31", overtimeHours: 9 }),
      seedOvertimeRequest({ id: "rep-filter-rejected", date: "2026-07-09", overtimeHours: 9, status: "rejected" }),
      seedOvertimeRequest({ id: "rep-filter-second", employeeId: secondEmployeeId, employeeName: "Ana Secund", date: "2026-07-10", overtimeHours: 4 }),
    ])
    const before = await reportDocumentCounts()

    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.clock.install({ time: new Date("2026-07-14T09:00:00+03:00") })
    await page.goto("/dashboard/resurse-umane/rapoarte?tab=overtime")
    await expect(page.getByRole("combobox", { name: "An", exact: true })).toHaveText(REPORT_YEAR)
    await expect(page.getByTestId("overtime-kpi-total")).toHaveText("10 h")
    await expect(page.getByTestId("overtime-kpi-requests")).toHaveText("4")

    await page.getByRole("combobox", { name: "Lună", exact: true }).click()
    await page.getByRole("option", { name: "Iulie 2026" }).click()
    await expect(page.getByTestId("overtime-kpi-total")).toHaveText("6 h")
    await expect(page.getByTestId("overtime-kpi-requests")).toHaveText("2")
    await expect(page.getByTestId("overtime-summary-table")).toContainText("Tehnician")
    await expect(page.getByTestId("overtime-summary-table")).toContainText("Ana Secund")

    await page.getByRole("combobox", { name: "Angajat", exact: true }).click()
    await page.getByRole("option", { name: "Ana Secund" }).click()
    await expect(page.getByTestId("overtime-kpi-total")).toHaveText("4 h")
    await expect(page.getByTestId("overtime-kpi-requests")).toHaveText("1")
    await page.reload()
    await expect(page.getByTestId("overtime-kpi-total")).toHaveText("10 h")

    await expect.poll(reportDocumentCounts).toEqual(before)
    await context.close()
  })
})
