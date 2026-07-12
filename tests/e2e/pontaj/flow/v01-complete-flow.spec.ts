import path from "node:path"
import { expect, test } from "@playwright/test"

import {
  EMPLOYEE_ID, TECH_UID, getAttendanceForTechnician, getLock, getTimesheet, resetPontajMutations,
} from "../../fixtures/pontaj-minimal"
import { installClock, START_INSTANT, STOP_V01_INSTANT, startFromFieldCard, stopFromFieldCard } from "../helpers"

test.beforeEach(async () => resetPontajMutations())
test.afterEach(async () => resetPontajMutations())

test("CAL-V01 UI -> attendance -> lock -> timesheet -> toate proiecțiile", async ({ page, browser }) => {
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
  await installClock(page, START_INSTANT)
  await startFromFieldCard(page)

  await expect.poll(async () => (await getAttendanceForTechnician()).length).toBe(1)
  let [session] = await getAttendanceForTechnician() as any[]
  expect(session.status).toBe("active")
  expect((await getLock() as any)?.activeSessionId).toBe(session.id)
  expect(await getTimesheet()).toBeNull()

  await installClock(page, STOP_V01_INSTANT)
  await stopFromFieldCard(page)

  await expect.poll(async () => (await getAttendanceForTechnician() as any[])[0]?.status).toBe("completed")
  ;[session] = await getAttendanceForTechnician() as any[]
  expect(session.userId).toBe(TECH_UID)
  expect(session.employeeId).toBe(EMPLOYEE_ID)
  expect(session.sessionStart.toMillis()).toBe(START_INSTANT.getTime())
  expect(session.sessionEnd.toMillis()).toBe(STOP_V01_INSTANT.getTime())
  expect((session.sessionEnd.toMillis() - session.sessionStart.toMillis()) / 3_600_000).toBe(8.5)
  expect(await getLock()).toBeNull()

  await expect.poll(async () => (await getTimesheet() as any)?.days?.["8"]?.hours).toBe(8)
  const timesheet = await getTimesheet() as any
  expect(timesheet.days["8"].code).toBe("WORK")
  expect(timesheet.days["8"].entries).toHaveLength(1)
  expect(timesheet.days["8"].entries[0]).toMatchObject({
    project: "Pontaj",
    attendanceSessionId: session.id,
    start: "08:00",
    end: "16:30",
    startTimestampMs: START_INSTANT.getTime(),
    endTimestampMs: STOP_V01_INSTANT.getTime(),
  })

  await page.reload()
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()

  const adminContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    storageState: path.resolve("tests/e2e/.auth/admin.json"),
  })
  const adminPage = await adminContext.newPage()
  await adminPage.goto("/dashboard")
  await expect(adminPage.getByRole("button", { name: /E2E_PONTAJ_STAGE5 Admin/ })).toBeVisible()
  await installClock(adminPage, STOP_V01_INSTANT)

  await adminPage.goto("/dashboard/resurse-umane/pontaj/dashboard")
  await expect(adminPage.getByTestId(`attendance-row-${session.id}`)).toContainText("8h 30m")
  await expect(adminPage.getByTestId("attendance-kpi-effective-hours")).toHaveText("8h")

  await adminPage.goto(`/dashboard/resurse-umane/condica-prezenta?month=2026-07&employeeId=${EMPLOYEE_ID}`)
  await expect(adminPage.getByTestId("condica-kpi-total-hours")).toHaveText("8h")
  await expect(adminPage.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toHaveAttribute("data-hours", "8")

  await adminPage.goto(`/dashboard/resurse-umane/salariati/${EMPLOYEE_ID}?month=2026-07`)
  await adminPage.getByRole("tab", { name: "Pontaj" }).click()
  await expect(adminPage.getByTestId("employee-kpi-work-hours")).toHaveText("8h")

  await adminPage.goto("/dashboard/resurse-umane/rapoarte?month=2026-07")
  await expect(adminPage.getByTestId("report-kpi-total-hours")).toHaveText("8")

  await adminContext.close()
})
