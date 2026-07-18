import { expect, test } from "@playwright/test"

import { hrContext } from "../salariati/hr.helpers"
import { reportDocumentCounts, resetReportsFixture, seedOvertimeRequest, seedReportTimesheet } from "./overtime.helpers"

test.describe("REP-005 reconciliere overtime", () => {
  test.beforeEach(resetReportsFixture)

  test("REP-005 clasifica confirmed, partial si missing la toleranta de un minut", async ({ browser }) => {
    await Promise.all([
      seedOvertimeRequest({ id: "rep-reconcile-confirmed", date: "2026-07-08", overtimeHours: 1, reason: "Confirmat" }),
      seedOvertimeRequest({ id: "rep-reconcile-partial", date: "2026-07-09", overtimeHours: 2, reason: "Partial" }),
      seedOvertimeRequest({ id: "rep-reconcile-missing-attendance", date: "2026-07-10", overtimeHours: 1, reason: "Fara pontaj" }),
      seedOvertimeRequest({ id: "rep-reconcile-missing-timesheet", date: "2026-07-11", overtimeHours: 1, reason: "Fara condica" }),
    ])
    await seedReportTimesheet({
      "8": { code: "WORK", entries: [{ start: "08:00", end: "17:29", project: "Pontaj", attendanceSessionId: "att-confirmed" }] },
      "9": { code: "WORK", entries: [{ start: "08:00", end: "17:30", project: "Pontaj", attendanceSessionId: "att-partial" }] },
      "10": { code: "WORK", entries: [{ start: "08:00", end: "16:30", project: "Pontaj", attendanceSessionId: "att-none" }] },
    })
    const before = await reportDocumentCounts()

    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.clock.install({ time: new Date("2026-07-14T09:00:00+03:00") })
    await page.goto("/dashboard/resurse-umane/rapoarte?tab=overtime")
    await page.getByRole("tab", { name: "Reconciliere condică" }).click()
    await expect(page.getByTestId("overtime-reconciliation-table")).toContainText("Confirmat")
    await expect(page.getByTestId("overtime-reconciliation-table")).toContainText("Parțial")
    await expect(page.getByTestId("overtime-reconciliation-table")).toContainText("Lipsește pontaj")
    await expect(page.getByTestId("overtime-reconciliation-table")).toContainText("Fără condică")
    await expect(page.getByTestId("overtime-reconciliation-confirmed")).toHaveText("1")
    await expect(page.getByTestId("overtime-reconciliation-issues")).toHaveText("3")
    await expect(page.getByTestId("overtime-reconciliation-requested")).toHaveText("5 h")
    await expect(page.getByTestId("overtime-reconciliation-found")).toHaveText("1,98 h")
    await expect(page.getByTestId("overtime-reconciliation-table")).toContainText("-1 min")
    await expect(page.getByTestId("overtime-reconciliation-table")).toContainText("-1 h")

    await page.getByRole("combobox", { name: "Reconciliere", exact: true }).click()
    await page.getByRole("option", { name: "Doar probleme" }).click()
    await expect(page.getByTestId("overtime-reconciliation-table")).not.toContainText("Confirmat")
    await expect(page.getByTestId("overtime-reconciliation-table")).toContainText("Parțial")
    await expect.poll(reportDocumentCounts).toEqual(before)
    await context.close()
  })
})
