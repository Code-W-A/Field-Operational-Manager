import { expect, test } from "@playwright/test"

import {
  EMPLOYEE_ID, TECH_UID, getAttendanceForTechnician, getLock, getTimesheet, resetPontajMutations,
} from "../../fixtures/pontaj-minimal"
import { installClock, START_INSTANT, startFromFieldCard } from "../helpers"

test.beforeEach(async () => resetPontajMutations())
test.afterEach(async () => resetPontajMutations())

test("Start creează attendance și lock, fără timesheet", async ({ page }) => {
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
  await installClock(page, START_INSTANT)
  await startFromFieldCard(page)

  await expect.poll(async () => (await getAttendanceForTechnician()).length).toBe(1)
  const [session] = await getAttendanceForTechnician() as any[]
  expect(session.status).toBe("active")
  expect(session.employeeId).toBe(EMPLOYEE_ID)
  expect(session.userId).toBe(TECH_UID)
  expect(session.sessionStart.toMillis()).toBe(START_INSTANT.getTime())

  const lock = await getLock() as any
  expect(lock?.activeSessionId).toBe(session.id)
  expect(await getTimesheet()).toBeNull()

  await page.reload()
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
})
