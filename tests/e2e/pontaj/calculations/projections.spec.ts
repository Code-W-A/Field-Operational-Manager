import path from "node:path"
import { expect, test, type Browser } from "@playwright/test"

import { PONTAJ_VECTORS } from "../../data/pontaj-vectors"
import { FieldValue, Timestamp, e2eDb } from "../../fixtures/firebase-admin"
import {
  EMPLOYEE_ID,
  RUN_ID,
  TECH_UID,
  resetPontajMutations,
} from "../../fixtures/pontaj-minimal"

type Projection = { monthKey: string; day: string; cell: Record<string, unknown>; expectedHours: string }

const projections: Record<string, Projection> = {
  V05: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 7.5, entries: [{ start: "08:00", end: "12:00", project: "Pontaj" }, { start: "11:00", end: "16:00", project: "Pontaj" }] }, expectedHours: "7.5" },
  V06: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 7.5, entries: [{ start: "08:00", end: "16:00", project: "Pontaj" }, { start: "08:00", end: "16:00", project: "Pontaj" }] }, expectedHours: "7.5" },
  V08: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 8.25, entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }], breaks: [{ start: "10:00", end: "10:15" }] }, expectedHours: "8.25" },
  V17: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 0, entries: [{ start: "12:30", end: "13:00", project: "Pontaj" }] }, expectedHours: "0" },
  V28: { monthKey: "2026-07", day: "8", cell: { code: "CO" }, expectedHours: "" },
  V35: { monthKey: "2026-07", day: "8", cell: { code: "WORK" }, expectedHours: "" },
  V40: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 7.5, entries: [{ start: "08:00", end: "12:00", project: "Manual" }, { start: "10:00", end: "16:00", project: "Pontaj" }] }, expectedHours: "7.5" },
  V64: { monthKey: "2026-07", day: "31", cell: { code: "WORK", hours: 0.98, entries: [{ start: "23:00", end: "23:59", project: "Pontaj" }] }, expectedHours: "0.98" },
  V66: { monthKey: "2026-03", day: "29", cell: { code: "WORK", hours: 1, entries: [{ start: "02:30", end: "04:30", startTimestampMs: Date.parse("2026-03-29T00:30:00Z"), endTimestampMs: Date.parse("2026-03-29T01:30:00Z"), project: "Pontaj" }] }, expectedHours: "1" },
  V67: { monthKey: "2026-10", day: "25", cell: { code: "WORK", hours: 1, entries: [{ start: "03:30", end: "03:30", startTimestampMs: Date.parse("2026-10-25T00:30:00Z"), endTimestampMs: Date.parse("2026-10-25T01:30:00Z"), project: "Pontaj" }] }, expectedHours: "1" },
  V73: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 9, entries: [{ start: "07:30", end: "17:00", project: "Pontaj" }] }, expectedHours: "9" },
  V74: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 16.5, entries: [{ start: "04:00", end: "21:00", project: "Pontaj" }] }, expectedHours: "16.5" },
  V80: { monthKey: "2026-07", day: "11", cell: { code: "WORK", hours: 4, entries: [{ start: "08:00", end: "12:00", project: "Pontaj" }, { start: "08:00", end: "12:00", project: "Pontaj" }] }, expectedHours: "4" },
  V85: { monthKey: "2026-07", day: "8", cell: { code: "WORK", hours: 6, entries: [{ start: "08:00", end: "14:30", project: "Pontaj" }] }, expectedHours: "6" },
}

async function adminPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    storageState: path.resolve("tests/e2e/.auth/admin.json"),
  })
  return { context, page: await context.newPage() }
}

async function seedProjection(vectorId: string, projection: Projection) {
  await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_${projection.monthKey}`).set({
    employeeId: EMPLOYEE_ID,
    monthKey: projection.monthKey,
    ownerRunId: RUN_ID,
    days: { [projection.day]: projection.cell },
    updatedAt: FieldValue.serverTimestamp(),
  })
  if (vectorId === "V85") {
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({
      programLucruStart: "08:00", programLucruEnd: "14:30", pauzaStart: "12:30", pauzaEnd: "13:00",
    })
  }
}

test.beforeEach(async () => {
  await resetPontajMutations()
})
test.afterEach(async () => {
  await resetPontajMutations()
  await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({
    programLucruStart: "08:00", programLucruEnd: "16:30", pauzaStart: "12:30", pauzaEnd: "13:00",
  })
})

for (const [vectorId, projection] of Object.entries(projections)) {
  const vector = PONTAJ_VECTORS.find(({ id }) => id === vectorId)!
  test(`UI-${vector.id} ${vector.description}`, async ({ browser }) => {
    await seedProjection(vector.id, projection)
    const { context, page } = await adminPage(browser)
    await page.goto(`/dashboard/resurse-umane/condica-prezenta?month=${projection.monthKey}&employeeId=${EMPLOYEE_ID}`)
    const cell = page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-${projection.day}`)
    await expect(cell).toBeVisible()
    await expect(cell).toHaveAttribute("data-hours", projection.expectedHours)
    await context.close()
  })
}

test("UI-V41 Functions trigger pastreaza manual + Pontaj si proiecteaza 7.5h", async ({ browser }) => {
  const startMs = Date.parse("2026-07-08T07:00:00Z")
  const endMs = Date.parse("2026-07-08T13:00:00Z")
  const sessionId = `att_${TECH_UID}_${startMs}`
  await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`).set({
    employeeId: EMPLOYEE_ID,
    monthKey: "2026-07",
    ownerRunId: RUN_ID,
    days: { "8": { code: "WORK", hours: 4, entries: [{ start: "08:00", end: "12:00", project: "Manual" }] } },
  })
  const sessionRef = e2eDb.collection("attendance").doc(sessionId)
  await sessionRef.set({
    userId: TECH_UID, employeeId: EMPLOYEE_ID, status: "active", mode: "field",
    sessionStart: Timestamp.fromMillis(startMs), ownerRunId: RUN_ID,
  })
  await sessionRef.update({
    status: "completed", sessionEnd: Timestamp.fromMillis(endMs), checkOutMode: "field", updatedAt: FieldValue.serverTimestamp(),
  })
  const timesheetRef = e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`)
  await expect.poll(async () => (await timesheetRef.get()).get("days.8.hours"), { timeout: 20_000 }).toBe(7.5)
  const timesheet = (await timesheetRef.get()).data() as any
  expect(timesheet.days["8"].entries).toHaveLength(2)

  const { context, page } = await adminPage(browser)
  await page.goto(`/dashboard/resurse-umane/condica-prezenta?month=2026-07&employeeId=${EMPLOYEE_ID}`)
  await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toHaveAttribute("data-hours", "7.5")
  await context.close()
})
