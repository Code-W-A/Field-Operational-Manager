import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, getAttendanceForTechnician, getTimesheet, resetPontajMutations, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"
import { installClock, START_INSTANT, STOP_V01_INSTANT, startFromFieldCard, stopFromFieldCard } from "../helpers"

test.describe("HR-010 program standard si sesiuni attendance", () => {
  test.beforeEach(async () => {
    await seedMinimalPontajFixture({ auth: false })
    await resetPontajMutations()
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({
      programLucruStart: FieldValue.delete(),
      programLucruEnd: FieldValue.delete(),
      pauzaStart: FieldValue.delete(),
      pauzaEnd: FieldValue.delete(),
    })
  })
  test.afterEach(async () => {
    await seedMinimalPontajFixture({ auth: false })
    await resetPontajMutations()
  })

  test("sesiunea inceputa pastreaza programul si pauza, iar sesiunea noua preia noile valori implicite", async ({ page }) => {
    await installClock(page, START_INSTANT)
    await page.goto("/dashboard/lucrari")
    await startFromFieldCard(page)
    let [firstSession] = await getAttendanceForTechnician() as any[]
    expect([firstSession.programLucruStart, firstSession.programLucruEnd]).toEqual(["08:00", "16:30"])
    expect([firstSession.pauzaStart, firstSession.pauzaEnd]).toEqual(["12:30", "13:00"])

    await e2eDb.collection("hrSettings").doc("defaults").update({
      programLucruStart: "09:00",
      programLucruEnd: "17:00",
      pauzaStart: "12:00",
      pauzaEnd: "12:15",
    })
    await installClock(page, STOP_V01_INSTANT)
    await stopFromFieldCard(page)
    const timesheet = await getTimesheet() as any
    expect(timesheet.days["8"].hours).toBe(8)

    await resetPontajMutations()
    await installClock(page, new Date("2026-07-09T06:00:00.000Z"))
    await page.reload()
    await startFromFieldCard(page)
    ;[firstSession] = await getAttendanceForTechnician() as any[]
    expect([firstSession.programLucruStart, firstSession.programLucruEnd]).toEqual(["09:00", "17:00"])
    expect([firstSession.pauzaStart, firstSession.pauzaEnd]).toEqual(["12:00", "12:15"])
  })
})
