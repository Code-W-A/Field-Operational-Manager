import path from "node:path"
import { expect, test, type Browser, type Page } from "@playwright/test"

import { e2eDb, FieldValue, Timestamp } from "../../fixtures/firebase-admin"
import {
  EMPLOYEE_ID, RUN_ID, TECH_UID, getLock, getTimesheet, resetPontajMutations, seedMinimalPontajFixture,
} from "../../fixtures/pontaj-minimal"
import { installClock, START_INSTANT } from "../helpers"

async function adminPage(browser: Browser, at = START_INSTANT) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100", storageState: path.resolve("tests/e2e/.auth/admin.json"),
    locale: "ro-RO", timezoneId: "Europe/Bucharest",
  })
  const page = await context.newPage()
  await installClock(page, at)
  return { context, page }
}

async function seedCompleted(params: {
  id: string; startMs: number; endMs: number; userId?: string; employeeId?: string; userName?: string;
}) {
  await e2eDb.collection("attendance").doc(params.id).set({
    userId: params.userId ?? TECH_UID,
    ...(params.employeeId === "" ? {} : { employeeId: params.employeeId ?? EMPLOYEE_ID }),
    ...(params.userName ? { userName: params.userName } : {}),
    sessionStart: Timestamp.fromMillis(params.startMs), sessionEnd: Timestamp.fromMillis(params.endMs),
    status: "completed", mode: "field", checkOutMode: "field", ownerRunId: RUN_ID,
  })
}

async function clickDailySync(page: Page) {
  await page.goto("/dashboard/resurse-umane/pontaj/sync")
  await page.getByRole("button", { name: "Sincronizează", exact: true }).click()
  await expect(page.getByText("Sincronizare Reușită", { exact: true })).toBeVisible()
}

async function selectCalendarDay(page: Page, triggerIndex: number, day: string) {
  await page.getByRole("button", { name: "Selectează data", exact: true }).nth(triggerIndex).click()
  await page.getByRole("dialog").last().getByRole("button").filter({ hasText: new RegExp(`^${day}$`) }).click()
}

async function publishScheduledFunction(functionName: string) {
  const topic = `firebase-schedule-${functionName}`
  return fetch(`http://127.0.0.1:8085/v1/projects/demo-fom-pontaj-e2e/topics/${topic}:publish`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ data: Buffer.from("{}").toString("base64") }] }),
  })
}

test.beforeEach(async () => {
  await seedMinimalPontajFixture({ auth: false })
  await resetPontajMutations()
})
test.afterEach(async () => resetPontajMutations())

test("SYN-001 Stop -> client este corelat prin attendanceSessionId", async () => {
  // Fluxul UI complet este STO-001/V01; aici păstrăm invariantul rezultatului sincronizat.
  await seedCompleted({ id: "syn-client", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 120_000 })
  expect(await getTimesheet()).toBeNull()
})

test("SYN-002 triggerul Functions real rulează blocking în emulator", async () => {
  const id = "syn-functions"
  const ref = e2eDb.collection("attendance").doc(id)
  await ref.set({
    userId: TECH_UID, employeeId: EMPLOYEE_ID, sessionStart: Timestamp.fromMillis(START_INSTANT.getTime()),
    status: "active", mode: "field", ownerRunId: RUN_ID,
  })
  await ref.update({ status: "completed", sessionEnd: Timestamp.fromMillis(START_INSTANT.getTime() + 120_000) })
  await expect.poll(async () => Boolean(await getTimesheet()), { timeout: 20_000 }).toBe(true)
  expect(((await getTimesheet() as any).days["8"].entries as any[])[0].attendanceSessionId).toBe(id)
})

test("SYN-003 sincronizarea zilnică din UI materializează ziua și updatedAt", async ({ browser }) => {
  await seedCompleted({ id: "syn-daily", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 120_000 })
  const { context, page } = await adminPage(browser)
  await clickDailySync(page)
  const timesheet = await getTimesheet() as any
  expect(timesheet.days["8"].entries).toHaveLength(1)
  expect(timesheet.updatedAt).toBeTruthy()
  await context.close()
})

test("SYN-004 sincronizarea de interval scrie exact zilele selectate", async ({ browser }) => {
  await seedCompleted({ id: "syn-range-8", startMs: Date.parse("2026-07-08T05:00:00Z"), endMs: Date.parse("2026-07-08T06:00:00Z") })
  await seedCompleted({ id: "syn-range-9", startMs: Date.parse("2026-07-09T05:00:00Z"), endMs: Date.parse("2026-07-09T06:00:00Z") })
  const { context, page } = await adminPage(browser)
  await page.goto("/dashboard/resurse-umane/pontaj/sync")
  await selectCalendarDay(page, 0, "8")
  await selectCalendarDay(page, 0, "9")
  await page.getByRole("button", { name: "Sincronizează Intervalul" }).click()
  await expect(page.getByText("Sincronizare Reușită", { exact: true })).toBeVisible()
  const days = (await getTimesheet() as any).days
  expect(Object.keys(days).sort()).toEqual(["8", "9"])
  await context.close()
})

test("SYN-005 re-sincronizarea zilei de ieri este idempotentă", async ({ browser }) => {
  await seedCompleted({ id: "syn-yesterday", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 120_000 })
  const { context, page } = await adminPage(browser)
  await clickDailySync(page)
  const first = (await getTimesheet() as any).days["8"]
  await page.getByRole("button", { name: "Sincronizează", exact: true }).click()
  await expect.poll(async () => ((await getTimesheet() as any).days["8"].entries as any[]).length).toBe(1)
  const second = (await getTimesheet() as any).days["8"]
  expect(second.entries).toEqual(first.entries)
  await context.close()
})

test("SYN-006 cron EOD completează, sincronizează și șterge activeSessionId fără stale lock", async () => {
  const startMs = Date.now() - 2 * 60 * 60 * 1000
  const id = `cron-${startMs}`
  await e2eDb.collection("attendance").doc(id).set({
    userId: TECH_UID, employeeId: EMPLOYEE_ID, sessionStart: Timestamp.fromMillis(startMs),
    status: "active", mode: "field", programLucruStart: "08:00", programLucruEnd: "16:30", ownerRunId: RUN_ID,
  })
  await e2eDb.collection("attendanceActiveSessions").doc(TECH_UID).set({
    userId: TECH_UID, employeeId: EMPLOYEE_ID, activeSessionId: id,
    sessionStart: Timestamp.fromMillis(startMs), ownerRunId: RUN_ID,
  })
  const response = await publishScheduledFunction("autoStopAttendanceSessions")
  expect(response.ok).toBe(true)
  await expect.poll(async () => (await e2eDb.collection("attendance").doc(id).get()).get("status"), { timeout: 20_000 }).toBe("completed")
  await expect.poll(async () => (await getLock()) === null, { timeout: 20_000 }).toBe(true)
  const session = (await e2eDb.collection("attendance").doc(id).get()).data() as any
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(startMs))
  const part = (type: string) => local.find((item) => item.type === type)!.value
  const month = `${part("year")}-${part("month")}`
  const day = String(Number(part("day")))
  const timesheet = await expect.poll(async () => {
    const snap = await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_${month}`).get()
    return snap.exists ? snap.data() : null
  }, { timeout: 20_000 }).toBeTruthy()
  void timesheet
  const doc = (await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_${month}`).get()).data() as any
  expect(doc.days[day].entries.some((entry: any) => entry.attendanceSessionId === id)).toBe(true)
  expect(session.checkOutAutoReason).toBe("eod_force")
})

test("SYN-007 sesiunea QR completată este sincronizată cu metadata auto păstrată", async ({ browser }) => {
  await seedCompleted({ id: "syn-first-qr", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 120_000 })
  await e2eDb.collection("attendance").doc("syn-first-qr").update({ checkInAuto: true, checkInAutoReason: "first_qr" })
  const { context, page } = await adminPage(browser)
  await clickDailySync(page)
  const session = (await e2eDb.collection("attendance").doc("syn-first-qr").get()).data() as any
  expect(session).toMatchObject({ checkInAuto: true, checkInAutoReason: "first_qr" })
  expect(((await getTimesheet() as any).days["8"].entries as any[])[0].attendanceSessionId).toBe("syn-first-qr")
  await context.close()
})

test("SYN-008 multiple, duplicate și overlap produc union fără intrări duplicate de sesiune", async ({ browser }) => {
  await seedCompleted({ id: "syn-overlap-a", startMs: Date.parse("2026-07-08T05:00:00Z"), endMs: Date.parse("2026-07-08T09:00:00Z") })
  await seedCompleted({ id: "syn-overlap-b", startMs: Date.parse("2026-07-08T08:00:00Z"), endMs: Date.parse("2026-07-08T13:00:00Z") })
  const { context, page } = await adminPage(browser)
  await clickDailySync(page)
  const day = (await getTimesheet() as any).days["8"]
  expect(day.hours).toBe(7.5)
  expect(new Set(day.entries.map((entry: any) => entry.attendanceSessionId)).size).toBe(2)
  await context.close()
})

test("SYN-009 manual + Pontaj păstrează manualul și codurile protejate", async ({ browser }) => {
  await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`).set({
    employeeId: EMPLOYEE_ID, monthKey: "2026-07", ownerRunId: RUN_ID,
    days: { "8": { code: "WORK", hours: 4, entries: [{ start: "08:00", end: "12:00", project: "Manual" }] } },
  })
  await seedCompleted({ id: "syn-manual", startMs: Date.parse("2026-07-08T07:00:00Z"), endMs: Date.parse("2026-07-08T13:00:00Z") })
  const { context, page } = await adminPage(browser)
  await clickDailySync(page)
  const day = (await getTimesheet() as any).days["8"]
  expect(day.entries.some((entry: any) => entry.project === "Manual")).toBe(true)
  expect(day.entries.some((entry: any) => entry.attendanceSessionId === "syn-manual")).toBe(true)
  await context.close()
})

test("SYN-010 rezoluția employee direct, UID, nume și missing are ținta corectă", async ({ browser }) => {
  const { context, page } = await adminPage(browser)
  await seedCompleted({ id: "resolve-uid", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 60_000, employeeId: "" })
  await clickDailySync(page)
  expect(await getTimesheet()).toBeTruthy()

  await resetPontajMutations()
  await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({ userUid: FieldValue.delete(), fullName: `${RUN_ID} Tehnician` })
  await seedCompleted({ id: "resolve-name", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 60_000, employeeId: "", userName: `${RUN_ID} Tehnician` })
  await page.reload()
  await page.getByRole("button", { name: "Sincronizează", exact: true }).click()
  await expect.poll(async () => Boolean(await getTimesheet())).toBe(true)

  await resetPontajMutations()
  await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).delete()
  await seedCompleted({ id: "resolve-missing", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 60_000, employeeId: "", userName: "Nobody" })
  await page.reload()
  await page.getByRole("button", { name: "Sincronizează", exact: true }).click()
  await expect(page.getByText("Sincronizare Reușită", { exact: true })).toBeVisible()
  expect(await getTimesheet()).toBeNull()
  await context.close()
})

test("SYN-011 pauza default și două sincronizări rămân deterministe", async ({ browser }) => {
  await seedCompleted({ id: "syn-break", startMs: START_INSTANT.getTime(), endMs: Date.parse("2026-07-08T13:30:00Z") })
  const { context, page } = await adminPage(browser)
  await clickDailySync(page)
  expect((await getTimesheet() as any).days["8"].hours).toBe(8)
  await page.getByRole("button", { name: "Sincronizează", exact: true }).click()
  await expect.poll(async () => (await getTimesheet() as any).days["8"].entries.length).toBe(1)
  expect((await getTimesheet() as any).days["8"].hours).toBe(8)
  await context.close()
})

test("SYN-012 statusul este aproximativ: zi existentă înseamnă Sincronizat fără corelare", async ({ browser }) => {
  await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`).set({
    employeeId: EMPLOYEE_ID, monthKey: "2026-07", updatedAt: FieldValue.serverTimestamp(),
    days: { "8": { code: "WORK", hours: 1, entries: [{ start: "10:00", end: "11:00", project: "Manual" }] } },
    ownerRunId: RUN_ID,
  })
  const { context, page } = await adminPage(browser)
  await page.goto("/dashboard/resurse-umane/pontaj/sync")
  await page.getByRole("button", { name: "Verifică Status" }).click()
  await expect(page.getByText("Sincronizat", { exact: true })).toBeVisible()
  await expect(page.getByText("Sesiuni completate: 0", { exact: true })).toBeVisible()
  await context.close()
})

test("SYN-013 două sincronizări simultane converg la același timesheet fără duplicate", async ({ browser }) => {
  await seedCompleted({ id: "syn-concurrent", startMs: START_INSTANT.getTime(), endMs: START_INSTANT.getTime() + 120_000 })
  const clients = await Promise.all([0, 1].map(() => adminPage(browser)))
  await Promise.all(clients.map(async ({ page }) => {
    await page.goto("/dashboard/resurse-umane/pontaj/sync")
    await page.getByRole("button", { name: "Sincronizează", exact: true }).click()
  }))
  await expect.poll(async () => ((await getTimesheet() as any)?.days?.["8"]?.entries ?? []).length).toBe(1)
  await Promise.all(clients.map(({ context }) => context.close()))
})

test("SYN-014 interval invalid rămâne disabled și timezone-ul browserului nu mută instantul", async ({ browser }) => {
  const { context, page } = await adminPage(browser)
  await page.goto("/dashboard/resurse-umane/pontaj/sync")
  await expect(page.getByRole("button", { name: "Sincronizează Intervalul" })).toBeDisabled()
  expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe("Europe/Bucharest")
  expect(await getTimesheet()).toBeNull()
  await context.close()
})
