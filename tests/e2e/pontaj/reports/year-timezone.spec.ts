import { expect, test } from "@playwright/test"

import { resetReportsFixture, seedOvertimeRequest } from "./overtime.helpers"

test.describe("REP-009 agregare anuală și timezone", () => {
  test.beforeEach(resetReportsFixture)

  for (const timezoneId of ["Europe/Bucharest", "UTC", "Europe/London", "America/New_York"]) {
    test(`REP-009 agregă doar cele 12 luni 2026 în ${timezoneId}`, async ({ browser }) => {
      const idPrefix = `rep-year-${timezoneId.replace(/\//g, "_")}`
      await Promise.all([
        seedOvertimeRequest({ id: `${idPrefix}-jan`, date: "2026-01-01", overtimeHours: 1 }),
        seedOvertimeRequest({ id: `${idPrefix}-dec`, date: "2026-12-31", overtimeHours: 2 }),
        seedOvertimeRequest({ id: `${idPrefix}-previous`, date: "2025-12-31", overtimeHours: 9 }),
        seedOvertimeRequest({ id: `${idPrefix}-next`, date: "2027-01-01", overtimeHours: 9 }),
      ])
      const context = await browser.newContext({
        baseURL: "http://127.0.0.1:3100", locale: "ro-RO", timezoneId, storageState: "tests/e2e/.auth/admin.json",
      })
      const page = await context.newPage()
      await page.clock.install({ time: new Date("2026-07-14T09:00:00+03:00") })
      await page.goto("/dashboard/resurse-umane/rapoarte?tab=overtime")
      await expect(page.getByTestId("overtime-kpi-total")).toHaveText("3 h")
      await expect(page.getByTestId("overtime-kpi-requests")).toHaveText("2")
      await expect(page.getByTestId("overtime-summary-table")).toContainText("3 h")
      await context.close()
    })
  }
})
