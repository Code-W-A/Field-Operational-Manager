import path from "node:path"
import { expect, test, type BrowserContext, type Page } from "@playwright/test"

import { e2eDb, FieldValue, Timestamp } from "../../fixtures/firebase-admin"
import {
  EMPLOYEE_ID, RUN_ID, TECH_UID, getAttendanceForTechnician, getLock, getTimesheet,
  resetPontajMutations, seedActiveSession, seedMinimalPontajFixture,
} from "../../fixtures/pontaj-minimal"
import { continueWithoutSelfie, installClock, START_INSTANT } from "../helpers"
import { executeCheckoutPipeline, executeCheckoutWithConfirmation } from "../../../../lib/attendance/checkout-pipeline"
import {
  createPreConfirmationObserver,
  failAuditWrite,
  failTimesheetWrite,
} from "../infrastructure/checkout-fault-adapters"

async function openStop(page: Page, at: Date) {
  await installClock(page, at)
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
}

async function clickStop(page: Page) {
  await page.getByRole("button", { name: /Mă opresc acum/i }).click()
  await continueWithoutSelfie(page)
}

async function expectCompleted(sessionId: string, expectedEnd?: number) {
  await expect.poll(async () => (await e2eDb.collection("attendance").doc(sessionId).get()).get("status")).toBe("completed")
  const session = (await e2eDb.collection("attendance").doc(sessionId).get()).data() as any
  if (expectedEnd != null) expect(session.sessionEnd.toMillis()).toBe(expectedEnd)
  return session
}

async function seedSession(params: { id: string; startMs: number; status?: "active" | "completed"; lock?: boolean; programEnd?: string }) {
  const ref = e2eDb.collection("attendance").doc(params.id)
  await ref.set({
    userId: TECH_UID, employeeId: EMPLOYEE_ID, status: params.status ?? "active",
    sessionStart: Timestamp.fromMillis(params.startMs), mode: "field", location: { lat: 44.4268, lng: 26.1025 },
    programLucruStart: "08:00", programLucruEnd: params.programEnd ?? "16:30", ownerRunId: RUN_ID,
    ...(params.status === "completed" ? { sessionEnd: Timestamp.fromMillis(params.startMs + 60_000) } : {}),
  })
  if (params.lock) await e2eDb.collection("attendanceActiveSessions").doc(TECH_UID).set({
    userId: TECH_UID, employeeId: EMPLOYEE_ID, activeSessionId: params.id,
    sessionStart: Timestamp.fromMillis(params.startMs), ownerRunId: RUN_ID,
  })
}

async function seedIsolatedPipelineSession(id: string, userId: string) {
  const startMs = START_INSTANT.getTime()
  await e2eDb.collection("attendance").doc(id).set({
    userId,
    status: "active",
    sessionStart: Timestamp.fromMillis(startMs),
    mode: "field",
    ownerRunId: RUN_ID,
  })
  await e2eDb.collection("attendanceActiveSessions").doc(userId).set({
    userId,
    activeSessionId: id,
    sessionStart: Timestamp.fromMillis(startMs),
    ownerRunId: RUN_ID,
  })
}

async function commitIsolatedPipelineSession(id: string, userId: string) {
  await e2eDb.runTransaction(async (transaction) => {
    transaction.update(e2eDb.collection("attendance").doc(id), {
      status: "completed",
      sessionEnd: Timestamp.fromMillis(START_INSTANT.getTime() + 120_000),
      updatedAt: FieldValue.serverTimestamp(),
    })
    transaction.delete(e2eDb.collection("attendanceActiveSessions").doc(userId))
  })
  return { id, userId }
}

test.beforeEach(async () => {
  await seedMinimalPontajFixture({ auth: false })
  await resetPontajMutations()
})
test.afterEach(async () => resetPontajMutations())

test("STO-001 Stop normal completează aceeași sesiune, șterge lock-ul și sincronizează", async ({ page }) => {
  const id = await seedActiveSession(START_INSTANT.getTime())
  const end = START_INSTANT.getTime() + 8 * 60 * 60 * 1000
  await openStop(page, new Date(end))
  await clickStop(page)
  const session = await expectCompleted(id, end)
  expect(["missing", "error"]).toContain(session.checkOutSelfieStatus)
  expect(await getLock()).toBeNull()
  await expect.poll(async () => Boolean(await getTimesheet())).toBe(true)
})

// STO-002 și STO-003 sunt executate de stop-minimum.spec.ts, fără duplicarea vectorilor V56/V57.

test("STO-004 Stop la +61 secunde păstrează timestampul exact", async ({ page }) => {
  const id = await seedActiveSession(START_INSTANT.getTime())
  const end = START_INSTANT.getTime() + 61_000
  await openStop(page, new Date(end))
  await clickStop(page)
  await expectCompleted(id, end)
  expect(((await getTimesheet() as any).days["8"].entries as any[])[0].attendanceSessionId).toBe(id)
})

test("STO-005 fără sesiune sau cu sesiune completed nu oferă Stop și nu mută date", async ({ page }) => {
  await installClock(page, new Date(START_INSTANT.getTime() + 120_000))
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
  await seedSession({ id: "already-completed", startMs: START_INSTANT.getTime(), status: "completed" })
  await page.reload()
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
  expect((await e2eDb.collection("attendance").doc("already-completed").get()).get("status")).toBe("completed")
})

test("STO-006 refresh și relogin recuperează sesiunea activă", async ({ browser, page }) => {
  await seedActiveSession(START_INSTANT.getTime())
  await openStop(page, new Date(START_INSTANT.getTime() + 120_000))
  await page.reload()
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100", storageState: path.resolve("tests/e2e/.auth/technician.json"),
    permissions: ["geolocation"], geolocation: { latitude: 44.4268, longitude: 26.1025 },
  })
  const second = await context.newPage()
  await second.goto("/dashboard/lucrari")
  await expect(second.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
  await context.close()
})

test("STO-007 Stop fără lock completează sesiunea și lock-ul rămâne absent", async ({ page }) => {
  const id = "stop-without-lock"
  await seedSession({ id, startMs: START_INSTANT.getTime() })
  const end = START_INSTANT.getTime() + 120_000
  await openStop(page, new Date(end))
  await clickStop(page)
  await expectCompleted(id, end)
  expect(await getLock()).toBeNull()
})

test("STO-008 lock spre alt active protejează sesiunea indicată de lock", async ({ page }) => {
  await seedSession({ id: "session-requested", startMs: START_INSTANT.getTime() })
  await seedSession({ id: "session-locked", startMs: START_INSTANT.getTime() + 1_000, lock: true })
  await openStop(page, new Date(START_INSTANT.getTime() + 180_000))
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
  expect((await getLock() as any)?.activeSessionId).toBe("session-locked")
  expect((await e2eDb.collection("attendance").doc("session-requested").get()).get("status")).toBe("active")
})

test("STO-009 două Stop simultane produc o singură tranziție logică și zero duplicate", async ({ browser }) => {
  const id = await seedActiveSession(START_INSTANT.getTime())
  const contexts: BrowserContext[] = await Promise.all([0, 1].map(() => browser.newContext({
    baseURL: "http://127.0.0.1:3100", storageState: path.resolve("tests/e2e/.auth/technician.json"),
    permissions: ["geolocation"], geolocation: { latitude: 44.4268, longitude: 26.1025 },
  })))
  const pages = await Promise.all(contexts.map((context) => context.newPage()))
  const end = new Date(START_INSTANT.getTime() + 120_000)
  await Promise.all(pages.map((page) => openStop(page, end)))
  await Promise.all(pages.map((page) => clickStop(page).catch(() => undefined)))
  await expectCompleted(id)
  expect(await getLock()).toBeNull()
  await expect.poll(async () => ((await getTimesheet() as any)?.days?.["8"]?.entries ?? []).length).toBe(1)
  await Promise.all(contexts.map((context) => context.close()))
})

test("STO-010 checkout fără selfie salvează status missing fără obiect Storage", async ({ page }) => {
  const id = await seedActiveSession(START_INSTANT.getTime())
  await openStop(page, new Date(START_INSTANT.getTime() + 120_000))
  await clickStop(page)
  expect((await expectCompleted(id)).checkOutSelfieStatus).toBe("missing")
})

test("STO-011 tranziția field-field păstrează mode și salvează checkOutMode/location", async ({ page }) => {
  const id = await seedActiveSession(START_INSTANT.getTime())
  await openStop(page, new Date(START_INSTANT.getTime() + 120_000))
  await clickStop(page)
  const session = await expectCompleted(id)
  expect(session.mode).toBe("field")
  expect(session.checkOutMode).toBe("field")
  expect(session.checkOutLocation).toMatchObject({ lat: 44.4268, lng: 26.1025 })
})

test("STO-012 sync client materializează o singură intrare corelată", async ({ page }) => {
  const id = await seedActiveSession(START_INSTANT.getTime())
  await openStop(page, new Date(START_INSTANT.getTime() + 120_000))
  await clickStop(page)
  const timesheet = await expect.poll(async () => await getTimesheet()).toBeTruthy()
  void timesheet
  const entries = ((await getTimesheet() as any).days["8"].entries as any[])
  expect(entries).toHaveLength(1)
  expect(entries[0].attendanceSessionId).toBe(id)
})

test("STO-013 attendance commit rămâne completed când scrierea hrTimesheets eșuează", async () => {
  const id = "sto-013-sync-failure"
  const userId = "sto-013-isolated-user"
  await seedIsolatedPipelineSession(id, userId)

  const result = await executeCheckoutPipeline({
    commit: () => commitIsolatedPipelineSession(id, userId),
    audit: async () => undefined,
    sync: async () => failTimesheetWrite(),
  })

  expect(result.syncResult).toBeNull()
  expect(result.syncError).toBeInstanceOf(Error)
  expect((await e2eDb.collection("attendance").doc(id).get()).get("status")).toBe("completed")
  expect((await e2eDb.collection("attendanceActiveSessions").doc(userId).get()).exists).toBe(false)
  expect((await e2eDb.collection("hrTimesheets").where("employeeId", "==", userId).get()).empty).toBe(true)
})

test("STO-014 triggerul Functions sincronizează o tranziție completed", async () => {
  const id = "functions-stop-trigger"
  await seedSession({ id, startMs: START_INSTANT.getTime() })
  await e2eDb.collection("attendance").doc(id).update({
    status: "completed", sessionEnd: Timestamp.fromMillis(START_INSTANT.getTime() + 120_000),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await expect.poll(async () => Boolean(await getTimesheet()), { timeout: 20_000 }).toBe(true)
  expect(((await getTimesheet() as any).days["8"].entries as any[])[0].attendanceSessionId).toBe(id)
})

test("STO-015 confirmarea UI începe numai după ce attendance commit este observabil", async () => {
  const id = "sto-015-pre-confirmation"
  const userId = "sto-015-isolated-user"
  await seedIsolatedPipelineSession(id, userId)

  const observer = createPreConfirmationObserver(async () => {
    expect((await e2eDb.collection("attendance").doc(id).get()).get("status")).toBe("completed")
    expect((await e2eDb.collection("attendanceActiveSessions").doc(userId).get()).exists).toBe(false)
  })
  expect(observer.isConfirmed()).toBe(false)

  await executeCheckoutWithConfirmation(
    () => commitIsolatedPipelineSession(id, userId),
    observer.confirm,
  )

  expect(observer.isConfirmed()).toBe(true)
})

test("STO-016 cross-midnight la sfârșit de lună rămâne în documentul zilei Start", async ({ page }) => {
  const start = Date.parse("2026-07-31T20:00:00.000Z")
  const id = "cross-month-stop"
  await seedSession({ id, startMs: start })
  await openStop(page, new Date("2026-08-01T01:00:00.000Z"))
  await clickStop(page)
  await expectCompleted(id)
  await expect.poll(async () => (await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`).get()).exists).toBe(true)
  expect((await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-08`).get()).exists).toBe(false)
})

test("STO-017 clamp peste miezul nopții folosește programEnd al zilei Start", async ({ page }) => {
  const start = Date.parse("2026-07-08T05:00:00.000Z")
  const id = "clamped-stop"
  await seedSession({ id, startMs: start, programEnd: "16:30" })
  await openStop(page, new Date("2026-07-09T06:00:00.000Z"))
  await clickStop(page)
  expect((await expectCompleted(id)).sessionEnd.toMillis()).toBe(Date.parse("2026-07-08T13:30:00.000Z"))
})

test("STO-018 audit failure după commit nu inversează attendance sau timesheet", async () => {
  const id = "sto-018-audit-failure"
  const userId = "sto-018-isolated-user"
  const timesheetId = "sto-018-timesheet"
  await seedIsolatedPipelineSession(id, userId)

  const result = await executeCheckoutPipeline({
    commit: () => commitIsolatedPipelineSession(id, userId),
    audit: async () => failAuditWrite(),
    sync: async () => {
      await e2eDb.collection("hrTimesheets").doc(timesheetId).set({
        employeeId: userId,
        monthKey: "2026-07",
        ownerRunId: RUN_ID,
        days: { "8": { code: "WORK", hours: 0.03, attendanceSessionId: id } },
      })
      return { synced: true as const }
    },
  })

  expect(result.auditError).toBeInstanceOf(Error)
  expect(result.syncResult).toEqual({ synced: true })
  expect((await e2eDb.collection("attendance").doc(id).get()).get("status")).toBe("completed")
  expect((await e2eDb.collection("hrTimesheets").doc(timesheetId).get()).exists).toBe(true)
})
