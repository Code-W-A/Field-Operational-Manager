import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { HR_EMPLOYEE_ID, hrContext, resetHrFixture } from "../salariati/hr.helpers"

const MONTH_KEY = "2026-07"

test.describe("REP-001 KPI si grafice Pontaj HR", () => {
  test.beforeEach(resetHrFixture)

  test("REP-001 calculeaza ore efective identic in KPI si grafic si exclude salariatul inactiv", async ({ browser }) => {
    await e2eDb.collection("hrEmployees").doc("emp_report_inactive").set({
      nume: "Inactiv",
      prenume: "Raport",
      active: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await e2eDb.collection("hrTimesheets").doc(`${HR_EMPLOYEE_ID}_${MONTH_KEY}`).set({
      employeeId: HR_EMPLOYEE_ID,
      monthKey: MONTH_KEY,
      days: {
        "8": {
          code: "WORK",
          hours: 8.5,
          entries: [{ start: "08:00", end: "16:30" }],
          breaks: [{ start: "12:30", end: "13:00" }],
        },
        "9": { code: "CO" },
        "10": { code: "WE" },
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await e2eDb.collection("hrTimesheets").doc(`emp_report_inactive_${MONTH_KEY}`).set({
      employeeId: "emp_report_inactive",
      monthKey: MONTH_KEY,
      days: { "8": { code: "WORK", hours: 99 } },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.goto(`/dashboard/resurse-umane/rapoarte?month=${MONTH_KEY}`)
    await expect(page.getByRole("heading", { name: "Rapoarte HR" })).toBeVisible()
    await expect(page.getByTestId("report-kpi-total-hours")).toHaveText("8")
    await expect(page.getByTestId("report-kpi-average-hours")).toHaveText("8")
    await expect(page.getByTestId("report-kpi-co-sl")).toHaveText("1 / 0")
    await expect(page.getByTestId("report-kpi-we")).toHaveText("1")
    await expect(page.getByTestId("report-chart-work-hours")).toContainText(/Tehnician/)
    await expect(page.getByTestId("report-chart-work-hours")).not.toContainText("Raport Inactiv")
    await context.close()
  })
})
