import { expect, test } from "@playwright/test"

import { hrContext, resetHrFixture } from "../salariati/hr.helpers"
import { reportDocumentCounts } from "./overtime.helpers"

test.describe("REP-008 stări raport", () => {
  test.beforeEach(resetHrFixture)

  test("REP-008 empty, refresh și documente lipsă nu blochează raportul și nu scriu", async ({ browser }) => {
    const before = await reportDocumentCounts()
    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.clock.install({ time: new Date("2026-07-14T09:00:00+03:00") })
    await page.goto("/dashboard/resurse-umane/rapoarte?tab=overtime")
    await expect(page.getByTestId("overtime-empty")).toBeVisible()
    await page.reload()
    await expect(page.getByTestId("overtime-empty")).toBeVisible()
    await page.goto("/dashboard/resurse-umane/rapoarte?month=2026-07")
    await expect(page.getByTestId("report-kpi-total-hours")).toHaveText("0")
    await expect(page.getByTestId("report-kpi-average-hours")).toHaveText("0")
    await expect.poll(reportDocumentCounts).toEqual(before)
    await context.close()
  })
})
