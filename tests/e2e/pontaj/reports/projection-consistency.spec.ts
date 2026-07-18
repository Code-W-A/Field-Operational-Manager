import path from "node:path"

import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue, Timestamp } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID, TECH_UID, resetPontajMutations, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"
import { STOP_V01_INSTANT, installClock } from "../helpers"
import { resetHrFixture } from "../salariati/hr.helpers"

test.describe("REP-002 consistență între proiecțiile pontajului", () => {
  test.beforeEach(async () => {
    await resetHrFixture()
    await seedMinimalPontajFixture({ auth: false })
    await resetPontajMutations()
  })
  test.afterEach(resetPontajMutations)

  test("REP-002 V01 păstrează elapsed în Dashboard și ore efective în Condică, Profil și Raport", async ({ browser }) => {
    const sessionId = "rep-projection-v01"
    const start = new Date("2026-07-08T08:00:00+03:00")
    await Promise.all([
      e2eDb.collection("attendance").doc(sessionId).set({
        userId: TECH_UID, employeeId: EMPLOYEE_ID, status: "completed", mode: "field",
        sessionStart: Timestamp.fromDate(start), sessionEnd: Timestamp.fromDate(STOP_V01_INSTANT),
        ownerRunId: RUN_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }),
      e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`).set({
        employeeId: EMPLOYEE_ID, monthKey: "2026-07", ownerRunId: RUN_ID,
        days: { "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:30", project: "Pontaj", attendanceSessionId: sessionId }], breaks: [{ start: "12:30", end: "13:00" }] } },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }),
    ])

    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3100", locale: "ro-RO", timezoneId: "Europe/Bucharest",
      storageState: path.resolve("tests/e2e/.auth/admin.json"),
    })
    const admin = await context.newPage()
    await admin.goto("/dashboard")
    await expect(admin.getByRole("button", { name: /E2E_PONTAJ_STAGE5 Admin/ })).toBeVisible()
    await installClock(admin, STOP_V01_INSTANT)
    await admin.goto("/dashboard/resurse-umane/pontaj/dashboard")
    await expect(admin.getByTestId(`attendance-row-${sessionId}`)).toContainText("8h 30m")
    await expect(admin.getByTestId("attendance-kpi-effective-hours")).toHaveText("8h")
    await admin.goto(`/dashboard/resurse-umane/condica-prezenta?month=2026-07&employeeId=${EMPLOYEE_ID}`)
    await expect(admin.getByTestId("condica-kpi-total-hours")).toHaveText("8h")
    await admin.goto(`/dashboard/resurse-umane/salariati/${EMPLOYEE_ID}?month=2026-07`)
    await admin.getByRole("tab", { name: "Pontaj" }).click()
    await expect(admin.getByTestId("employee-kpi-work-hours")).toHaveText("8h")
    await admin.goto("/dashboard/resurse-umane/rapoarte?month=2026-07")
    await expect(admin.getByTestId("report-kpi-total-hours")).toHaveText("8")
    await context.close()
  })
})
