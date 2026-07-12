import { expect, test } from "@playwright/test"

import {
  getAttendanceForTechnician, getLock, getTimesheet, resetPontajMutations, seedActiveSession,
} from "../../fixtures/pontaj-minimal"
import { installClock, START_INSTANT, stopFromFieldCard } from "../helpers"

test.afterEach(async () => resetPontajMutations())

test("STO-002 CAL-V56 Stop la +30 secunde este refuzat și păstrează sesiunea activă", async ({ page }) => {
  const sessionId = await seedActiveSession(START_INSTANT.getTime())
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
  await installClock(page, new Date(START_INSTANT.getTime() + 30_000))

  const stop = page.getByRole("button", { name: /Mă opresc acum/i })
  await expect(stop).toBeDisabled()
  await expect(page.getByText(/Așteptați .* pentru check-out/)).toBeVisible()

  const [session] = await getAttendanceForTechnician() as any[]
  expect(session.id).toBe(sessionId)
  expect(session.status).toBe("active")
  expect((await getLock() as any)?.activeSessionId).toBe(sessionId)
  expect(await getTimesheet()).toBeNull()
})

test("STO-003 CAL-V57 Stop exact la +60 secunde completează sesiunea, șterge lock-ul și sincronizează timesheet", async ({ page }) => {
  const sessionId = await seedActiveSession(START_INSTANT.getTime())
  const stopInstant = new Date(START_INSTANT.getTime() + 60_000)
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
  await installClock(page, stopInstant)
  await stopFromFieldCard(page)

  await expect.poll(async () => (await getAttendanceForTechnician() as any[])[0]?.status).toBe("completed")
  const [session] = await getAttendanceForTechnician() as any[]
  expect(session.id).toBe(sessionId)
  expect(session.sessionEnd.toMillis()).toBe(stopInstant.getTime())
  expect(await getLock()).toBeNull()
  await expect.poll(async () => Boolean(await getTimesheet())).toBe(true)
  const timesheet = await getTimesheet() as any
  expect(timesheet.days["8"].code).toBe("WORK")
  expect(timesheet.days["8"].entries).toHaveLength(1)

  await page.clock.resume()
  await page.reload()
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
})
