import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { hrContext, resetHrFixture } from "../salariati/hr.helpers"
import { RUN_ID } from "../../fixtures/pontaj-minimal"

test.describe("REP-003 salariați fără pontaj și date parțiale", () => {
  test.beforeEach(resetHrFixture)

  test("REP-003 include activii fără timesheet în medie, exclude inactivii și tratează WORK gol ca zero", async ({ browser }) => {
    await Promise.all([
      e2eDb.collection("hrEmployees").doc("emp_report_empty").set({
        prenume: "Activ", nume: "Fără Pontaj", active: true, ownerRunId: RUN_ID,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }),
      e2eDb.collection("hrEmployees").doc("emp_report_inactive_variant").set({
        prenume: "Inactiv", nume: "Cu Pontaj", active: false, ownerRunId: RUN_ID,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }),
      e2eDb.collection("hrTimesheets").doc(`emp_${RUN_ID.toLowerCase()}_2026-07`).set({
        employeeId: `emp_${RUN_ID.toLowerCase()}`, monthKey: "2026-07", ownerRunId: RUN_ID,
        days: { "8": { code: "WORK", entries: [{ start: "08:00", end: "16:30" }], breaks: [{ start: "12:30", end: "13:00" }] }, "9": { code: "WORK" } },
      }),
      e2eDb.collection("hrTimesheets").doc("emp_report_inactive_variant_2026-07").set({
        employeeId: "emp_report_inactive_variant", monthKey: "2026-07", ownerRunId: RUN_ID,
        days: { "8": { code: "WORK", hours: 99 } },
      }),
    ])

    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.goto("/dashboard/resurse-umane/rapoarte?month=2026-07")
    await expect(page.getByTestId("report-kpi-total-hours")).toHaveText("8")
    await expect(page.getByTestId("report-kpi-average-hours")).toHaveText("4")
    await expect(page.getByTestId("report-chart-work-hours")).toContainText("Activ Fără Pontaj")
    await expect(page.getByTestId("report-chart-work-hours")).not.toContainText("Inactiv Cu Pontaj")
    await page.reload()
    await expect(page.getByTestId("report-kpi-average-hours")).toHaveText("4")
    await context.close()
  })
})
