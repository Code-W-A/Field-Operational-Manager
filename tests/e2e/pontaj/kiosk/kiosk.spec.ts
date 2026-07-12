import path from "node:path"
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { e2eDb, e2eStorage, FieldValue, Timestamp } from "../../fixtures/firebase-admin"
import {
  ADMIN_EMPLOYEE_ID,
  ADMIN_UID,
  DISPATCHER_EMPLOYEE_ID,
  DISPATCHER_UID,
  EMPLOYEE_ID,
  KIOSK_UID,
  PASSWORD,
  RUN_ID,
  SECOND_TECH_EMPLOYEE_ID,
  TECH_UID,
  TIMESHEET_ID,
  getAttendanceForTechnician,
  getLock,
  getTimesheet,
  resetPontajMutations,
  seedActiveSession,
  seedMinimalPontajFixture,
} from "../../fixtures/pontaj-minimal"
import { installClock, START_INSTANT, STOP_V01_INSTANT } from "../helpers"

const KIOSK_STATE = path.resolve("tests/e2e/.auth/kiosk.json")
const KIOSK_EXTRA_PREFIX = `${EMPLOYEE_ID}_kiosk_`
const SECOND_TECH_UID = `${TECH_UID}_kiosk_second`
const SAME_NAME_UID = `${TECH_UID}_kiosk_same_name`
const NO_EMAIL_UID = `${TECH_UID}_kiosk_no_email`
const INELIGIBLE_UID = `${TECH_UID}_kiosk_ineligible`

function kioskContext(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}) {
  return browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: KIOSK_STATE,
    permissions: ["geolocation"],
    geolocation: { latitude: 44.4268, longitude: 26.1025 },
    ...options,
  })
}

async function removeKioskExtras() {
  const employees = await e2eDb.collection("hrEmployees").get()
  const users = await e2eDb.collection("users").get()
  const batch = e2eDb.batch()
  employees.docs
    .filter((document) => [ADMIN_EMPLOYEE_ID, DISPATCHER_EMPLOYEE_ID].includes(document.id) || document.id.startsWith(KIOSK_EXTRA_PREFIX))
    .forEach((document) => batch.delete(document.ref))
  users.docs
    .filter((document) => [SECOND_TECH_UID, SAME_NAME_UID, NO_EMAIL_UID, INELIGIBLE_UID].includes(document.id))
    .forEach((document) => batch.delete(document.ref))
  await batch.commit()
}

async function seedKioskUser(params: { uid: string; employeeId: string; fullName: string; email?: string; role?: string; active?: boolean }) {
  const batch = e2eDb.batch()
  batch.set(e2eDb.collection("users").doc(params.uid), {
    uid: params.uid,
    displayName: params.fullName,
    ...(params.email !== undefined ? { email: params.email } : {}),
    ...(params.role !== undefined ? { role: params.role } : {}),
    ownerRunId: RUN_ID,
    updatedAt: FieldValue.serverTimestamp(),
  })
  batch.set(e2eDb.collection("hrEmployees").doc(params.employeeId), {
    prenume: params.fullName.split(" ")[0],
    nume: params.fullName.split(" ").slice(1).join(" ") || RUN_ID,
    fullName: params.fullName,
    active: params.active ?? true,
    userUid: params.uid,
    programLucruStart: "08:00",
    programLucruEnd: "16:30",
    pauzaStart: "12:30",
    pauzaEnd: "13:00",
    ownerRunId: RUN_ID,
    updatedAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()
}

async function openKiosk(page: Page, at = START_INSTANT) {
  await installClock(page, at)
  await page.goto("/kiosk")
  await expect(page.getByTestId("kiosk-state")).toHaveAttribute("data-kiosk-state", "idle")
  await expect(page.getByTestId("kiosk-start")).toBeVisible()
}

async function chooseUser(page: Page, action: "start" | "stop", uid = TECH_UID) {
  await page.getByTestId(action === "start" ? "kiosk-start" : "kiosk-stop").click()
  const candidate = page.locator(`[data-testid="kiosk-user"][data-user-uid="${uid}"]`)
  await candidate.click()
}

async function captureSelfieAndExpectSuccess(page: Page, kind: "Check-In" | "Check-Out") {
  await expect(page.getByRole("heading", { name: "Selfie pontaj" })).toBeVisible()
  await page.getByRole("button", { name: "Fă selfie" }).click()
  await expect(page.getByText(`${kind} Reușit!`, { exact: true }).first()).toBeVisible()
}

async function startKioskSession(page: Page, uid = TECH_UID, specialDay = false) {
  await chooseUser(page, "start", uid)
  await expect(page.getByRole("heading", { name: "Confirmare Start" })).toBeVisible()
  await page.getByRole("button", { name: specialDay ? "Da, mă pontez" : "Da, continuă" }).click()
  await captureSelfieAndExpectSuccess(page, "Check-In")
}

async function stopKioskSession(page: Page, uid = TECH_UID) {
  await chooseUser(page, "stop", uid)
  await expect(page.getByRole("heading", { name: "Confirmare Stop" })).toBeVisible()
  await page.getByRole("button", { name: "Da, continuă" }).click()
  await captureSelfieAndExpectSuccess(page, "Check-Out")
}

async function sessionsFor(uid: string) {
  const snapshot = await e2eDb.collection("attendance").where("userId", "==", uid).get()
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() })) as any[]
}

async function storagePathExists(pathValue: string) {
  return (await e2eStorage.bucket().file(pathValue).exists())[0]
}

async function clearKioskSelfies() {
  await e2eStorage.bucket().deleteFiles({ prefix: "attendance/selfies/" })
}

async function expectNoTechnicianKioskWrites() {
  expect(await getAttendanceForTechnician()).toHaveLength(0)
  expect(await getLock()).toBeNull()
  const files = await e2eStorage.bucket().getFiles({ prefix: `attendance/selfies/${TECH_UID}/` })
  expect(files[0]).toHaveLength(0)
}

async function installFirestoreRosterTimeout(context: BrowserContext) {
  let intercepted = 0
  let enabled = true
  let release: (() => void) | undefined
  const released = new Promise<void>((resolve) => { release = resolve })
  await context.route("**/*", async (route) => {
    const request = route.request()
    if (enabled && request.url().includes("firestore") && (request.postData() || "").includes("hrEmployees")) {
      intercepted += 1
      await released
      await route.abort("failed")
      return
    }
    await route.continue()
  })
  return {
    intercepted: () => intercepted,
    release: () => {
      enabled = false
      release?.()
    },
  }
}

test.describe("Kiosk attendance", () => {
  test.beforeEach(async () => {
    await removeKioskExtras()
    await clearKioskSelfies()
    await seedMinimalPontajFixture({ auth: false })
    await Promise.all([
      seedKioskUser({ uid: ADMIN_UID, employeeId: ADMIN_EMPLOYEE_ID, fullName: `Admin ${RUN_ID}`, email: `admin.${RUN_ID.toLowerCase()}@e2e.invalid`, role: "admin" }),
      seedKioskUser({ uid: DISPATCHER_UID, employeeId: DISPATCHER_EMPLOYEE_ID, fullName: `Dispecer ${RUN_ID}`, email: `dispatcher.${RUN_ID.toLowerCase()}@e2e.invalid`, role: "dispecer" }),
    ])
    await resetPontajMutations()
  })

  test.afterEach(async () => {
    await removeKioskExtras()
    await clearKioskSelfies()
    await seedMinimalPontajFixture({ auth: false })
    await resetPontajMutations()
  })

  test("KSK-001 rosterul include numai tehnician, admin și dispecer asociați", async ({ browser }) => {
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await openKiosk(page)
    await page.getByTestId("kiosk-start").click()
    const users = page.getByTestId("kiosk-user")
    await expect(users).toHaveCount(3)
    await expect(page.locator(`[data-user-uid="${TECH_UID}"]`)).toBeVisible()
    await expect(page.locator(`[data-user-uid="${ADMIN_UID}"]`)).toBeVisible()
    await expect(page.locator(`[data-user-uid="${DISPATCHER_UID}"]`)).toBeVisible()
    await context.close()
  })

  test("KSK-002 deduplică UID, sortează stabil și selectează omonimul după UID", async ({ browser }) => {
    await e2eDb.collection("hrEmployees").doc(`${KIOSK_EXTRA_PREFIX}duplicate_uid`).set({
      prenume: "A", nume: "Duplicat", fullName: `A Duplicat ${RUN_ID}`, active: true, userUid: TECH_UID, ownerRunId: RUN_ID,
    })
    await seedKioskUser({
      uid: SAME_NAME_UID,
      employeeId: `${KIOSK_EXTRA_PREFIX}same_name`,
      fullName: `Tehnician ${RUN_ID}`,
      email: `${SAME_NAME_UID}@e2e.invalid`,
      role: "tehnician",
    })
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await openKiosk(page)
    await page.getByTestId("kiosk-start").click()
    await expect(page.getByTestId("kiosk-user")).toHaveCount(4)
    const names = await page.getByTestId("kiosk-user").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-user-name") || ""))
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "ro")))
    await page.locator(`[data-user-uid="${SAME_NAME_UID}"]`).click()
    await page.getByRole("button", { name: "Da, continuă" }).click()
    await captureSelfieAndExpectSuccess(page, "Check-In")
    expect((await sessionsFor(SAME_NAME_UID)).map((session) => session.userId)).toEqual([SAME_NAME_UID])
    expect(await getAttendanceForTechnician()).toHaveLength(0)
    await context.close()
  })

  test("KSK-003 exclude employee inactiv, fără asociere completă sau rol neeligibil", async ({ browser }) => {
    await seedKioskUser({ uid: NO_EMAIL_UID, employeeId: `${KIOSK_EXTRA_PREFIX}no_email`, fullName: "Fara Email", role: "tehnician" })
    await seedKioskUser({ uid: INELIGIBLE_UID, employeeId: `${KIOSK_EXTRA_PREFIX}ineligible`, fullName: "Client Kiosk", email: "client-kiosk@e2e.invalid", role: "client" })
    await e2eDb.collection("hrEmployees").doc(`${KIOSK_EXTRA_PREFIX}inactive`).set({
      prenume: "Inactiv", nume: RUN_ID, fullName: `Inactiv ${RUN_ID}`, active: false, userUid: TECH_UID, ownerRunId: RUN_ID,
    })
    await e2eDb.collection("hrEmployees").doc(`${KIOSK_EXTRA_PREFIX}missing_user`).set({
      prenume: "Fara", nume: "Utilizator", fullName: "Fara Utilizator", active: true, userUid: "missing-kiosk-user", ownerRunId: RUN_ID,
    })
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await openKiosk(page)
    await page.getByTestId("kiosk-start").click()
    await expect(page.locator(`[data-user-uid="${NO_EMAIL_UID}"]`)).toHaveCount(0)
    await expect(page.locator(`[data-user-uid="${INELIGIBLE_UID}"]`)).toHaveCount(0)
    await expect(page.getByText("Inactiv " + RUN_ID)).toHaveCount(0)
    await expect(page.getByText("Fara Utilizator")).toHaveCount(0)
    await context.close()
  })

  test("KSK-004 loading este vizibil înaintea încărcării rosterului", async ({ browser }) => {
    const loadingContext = await kioskContext(browser)
    const loading = await installFirestoreRosterTimeout(loadingContext)
    const loadingPage = await loadingContext.newPage()
    await loadingPage.goto("/kiosk")
    await expect(loadingPage.getByTestId("kiosk-roster-loading")).toBeVisible()
    await expect.poll(loading.intercepted).toBeGreaterThan(0)
    loading.release()
    await loadingContext.close()
  })

  test("KSK-004 lista goală nu scrie attendance, lock sau Storage", async ({ browser }) => {
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).delete()
    await e2eDb.collection("hrEmployees").doc(ADMIN_EMPLOYEE_ID).delete()
    await e2eDb.collection("hrEmployees").doc(DISPATCHER_EMPLOYEE_ID).delete()
    const emptyContext = await kioskContext(browser)
    const emptyPage = await emptyContext.newPage()
    await installClock(emptyPage, START_INSTANT)
    await emptyPage.goto("/kiosk")
    await expect(emptyPage.getByTestId("kiosk-roster-empty")).toBeVisible()
    await expectNoTechnicianKioskWrites()
    await emptyContext.close()
  })

  test("KSK-004 timeout-ul controlat al query-ului de roster afișează eroarea fără scrieri", async ({ browser }) => {
    const timeoutContext = await kioskContext(browser)
    const timeout = await installFirestoreRosterTimeout(timeoutContext)
    const timeoutPage = await timeoutContext.newPage()
    await timeoutPage.clock.install({ time: START_INSTANT })
    await timeoutPage.goto("/kiosk")
    await expect(timeoutPage.getByTestId("kiosk-roster-loading")).toBeVisible()
    await expect.poll(timeout.intercepted).toBeGreaterThan(0)
    await timeoutPage.clock.fastForward(10_000)
    await expect(timeoutPage.getByTestId("kiosk-roster-error")).toBeVisible()
    await expectNoTechnicianKioskWrites()
    timeout.release()
    await timeoutPage.getByTestId("kiosk-roster-retry").click()
    await expect(timeoutPage.getByTestId("kiosk-state")).toHaveAttribute("data-kiosk-state", "idle")
    await expectNoTechnicianKioskWrites()
    await timeoutContext.close()
  })

  test("KSK-005 Start kiosk creează attendance, lock, selfie Storage și audit fără timesheet", async ({ browser }) => {
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await openKiosk(page)
    await startKioskSession(page)
    const [session] = await getAttendanceForTechnician() as any[]
    expect(session.status).toBe("active")
    expect(session.employeeId).toBe(EMPLOYEE_ID)
    expect(session.userId).toBe(TECH_UID)
    expect(session.mode).toBe("office")
    expect(session.checkInSelfieStatus).toBe("ok")
    expect(session.checkInSelfiePath).toContain(`attendance/selfies/${TECH_UID}/`)
    expect(await storagePathExists(session.checkInSelfiePath)).toBe(true)
    expect((await getLock() as any)?.activeSessionId).toBe(session.id)
    expect(await getTimesheet()).toBeNull()
    await expect.poll(async () => (await e2eDb.collection("logs").where("entityId", "==", session.id).get()).docs.some((log) => log.get("actiune") === "Pontaj Play")).toBe(true)
    await page.reload()
    await expect(page.getByTestId("kiosk-stop")).toBeVisible()
    await context.close()
  })

  test("KSK-006 Stop kiosk completează o singură sesiune, șterge lock-ul și sincronizează condica", async ({ browser }) => {
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await openKiosk(page)
    await startKioskSession(page)
    await page.clock.setFixedTime(STOP_V01_INSTANT)
    await page.reload()
    await stopKioskSession(page)
    const [session] = await getAttendanceForTechnician() as any[]
    expect(session.status).toBe("completed")
    expect(session.sessionEnd).toBeInstanceOf(Timestamp)
    expect(session.checkOutMode).toBe("office")
    expect(session.checkOutSelfieStatus).toBe("ok")
    expect(await storagePathExists(session.checkOutSelfiePath)).toBe(true)
    expect(await getLock()).toBeNull()
    await expect.poll(async () => (await getTimesheet() as any)?.days?.["8"]?.entries?.length).toBe(1)
    await expect.poll(async () => (await e2eDb.collection("logs").where("entityId", "==", session.id).get()).docs.some((log) => log.get("actiune") === "Pontaj Stop")).toBe(true)
    await page.reload()
    await expect(page.getByTestId("kiosk-start")).toBeVisible()
    await context.close()
  })

  test("KSK-007 dialogurile pentru tură activă și tură absentă nu produc scrieri nepermise la anulare", async ({ browser }) => {
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await seedActiveSession(START_INSTANT.getTime())
    await openKiosk(page)
    await chooseUser(page, "start")
    await expect(page.getByRole("heading", { name: "Pontaj deja pornit" })).toBeVisible()
    await page.getByRole("button", { name: "Anulează" }).click()
    expect(await getAttendanceForTechnician()).toHaveLength(1)
    expect((await getLock() as any)?.activeSessionId).toContain(TECH_UID)

    await resetPontajMutations()
    await page.reload()
    await chooseUser(page, "stop")
    await expect(page.getByRole("heading", { name: "Nu există tură activă" })).toBeVisible()
    await page.getByRole("button", { name: "Anulează" }).click()
    expect(await getAttendanceForTechnician()).toHaveLength(0)
    expect(await getLock()).toBeNull()
    await context.close()
  })

  for (const specialDay of [
    { label: "Sâmbătă", kind: "saturday", date: new Date("2026-07-11T05:00:00.000Z") },
    { label: "Duminică", kind: "sunday", date: new Date("2026-07-12T05:00:00.000Z") },
    { label: "Zi liberă E2E", kind: "legal_holiday", date: new Date("2026-07-13T05:00:00.000Z"), holiday: "2026-07-13" },
  ] as const) {
    test(`KSK-008 ${specialDay.kind}: Cancel este no-op, Confirm persistă snapshot și refresh`, async ({ browser }) => {
      if (specialDay.holiday) {
        await e2eDb.collection("hrHolidays").doc("2026").set({ items: [{ date: specialDay.holiday, label: specialDay.label }], ownerRunId: RUN_ID })
      }
      const context = await kioskContext(browser)
      const page = await context.newPage()
      await openKiosk(page, specialDay.date)
      await chooseUser(page, "start")
      await expect(page.getByRole("heading", { name: "Confirmare Start" })).toBeVisible()
      await expect(page.getByText(new RegExp(`Azi este ${specialDay.label}`, "i"))).toBeVisible()
      await page.getByRole("button", { name: "Nu" }).click()
      await expectNoTechnicianKioskWrites()

      await chooseUser(page, "start")
      await page.getByRole("button", { name: "Da, mă pontez" }).click()
      await captureSelfieAndExpectSuccess(page, "Check-In")
      expect((await getAttendanceForTechnician() as any[])[0].specialDayConfirmation).toMatchObject({
        required: true,
        confirmed: true,
        kind: specialDay.kind,
      })
      await page.reload()
      await expect(page.getByTestId("kiosk-stop")).toBeVisible()
      await context.close()
    })
  }

  test("KSK-009 caracterizează flag-ul actual: fără parolă salariat, parola kiosk numai la logout", async ({ browser }) => {
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await openKiosk(page)
    await chooseUser(page, "start")
    await page.getByRole("button", { name: "Da, continuă" }).click()
    await expect(page.getByRole("heading", { name: "Selfie pontaj" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Confirmare parolă" })).toHaveCount(0)
    await page.getByRole("button", { name: "Close" }).click()
    await page.getByRole("button", { name: "Deconectare" }).click()
    await expect(page.getByPlaceholder("Parola contului Kiosk")).toBeVisible()
    await context.close()
  })

  test("KSK-010 camera fake reușește, permission denied și media absent nu lasă writes", async ({ browser }) => {
    const successContext = await kioskContext(browser)
    const successPage = await successContext.newPage()
    await openKiosk(successPage)
    await startKioskSession(successPage)
    expect((await getAttendanceForTechnician() as any[])[0].checkInSelfieStatus).toBe("ok")
    await successContext.close()
    await resetPontajMutations()
    await clearKioskSelfies()

    const deniedContext = await kioskContext(browser)
    await deniedContext.addInitScript(() => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => { throw new DOMException("Permission denied", "NotAllowedError") },
      })
    })
    const deniedPage = await deniedContext.newPage()
    await openKiosk(deniedPage)
    await chooseUser(deniedPage, "start")
    await deniedPage.getByRole("button", { name: "Da, continuă" }).click()
    await expect(deniedPage.getByText(/Permisiunea camerei a fost refuzată/).first()).toBeVisible()
    await expectNoTechnicianKioskWrites()
    await deniedContext.close()

    const absentContext = await kioskContext(browser)
    await absentContext.addInitScript(() => {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined })
    })
    const absentPage = await absentContext.newPage()
    await openKiosk(absentPage)
    await chooseUser(absentPage, "start")
    await absentPage.getByRole("button", { name: "Da, continuă" }).click()
    await expect(absentPage.getByText(/Camera nu este disponibilă/).first()).toBeVisible()
    await expectNoTechnicianKioskWrites()
    await absentContext.close()
  })

  for (const gpsFailure of [
    { name: "denied", code: 1, message: "Permission denied" },
    { name: "timeout", code: 3, message: "Timeout" },
  ]) {
    test(`KSK-010 GPS ${gpsFailure.name} folosește fallback-ul office`, async ({ browser }) => {
      const gpsContext = await kioskContext(browser)
      await gpsContext.addInitScript((failure) => {
        Object.defineProperty(navigator, "geolocation", {
        configurable: true,
          value: { getCurrentPosition: (_ok: PositionCallback, fail: PositionErrorCallback) => fail(failure as GeolocationPositionError) },
        })
      }, { code: gpsFailure.code, message: gpsFailure.message })
      const gpsPage = await gpsContext.newPage()
      await openKiosk(gpsPage)
      await startKioskSession(gpsPage)
      expect((await getAttendanceForTechnician() as any[])[0].location).toMatchObject({ lat: 44.4268, lng: 26.1025 })
      await gpsContext.close()
    })
  }

  test("KSK-010 Storage failure și offline înainte de commit nu lasă orphan; retry și reconnect nu dublează", async ({ browser }) => {
    const storageContext = await kioskContext(browser)
    let failStorage = true
    await storageContext.route("**/*", async (route) => {
      const request = route.request()
      if (failStorage && request.url().includes(":9199") && request.method() !== "GET") {
        await route.fulfill({ status: 503, body: "storage emulator unavailable" })
        return
      }
      await route.continue()
    })
    const storagePage = await storageContext.newPage()
    await openKiosk(storagePage)
    await chooseUser(storagePage, "start")
    await storagePage.getByRole("button", { name: "Da, continuă" }).click()
    await storagePage.getByRole("button", { name: "Fă selfie" }).click()
    await expect(storagePage.getByText("Upload selfie eșuat", { exact: true }).first()).toBeVisible()
    await expectNoTechnicianKioskWrites()
    failStorage = false
    await storagePage.reload()
    await startKioskSession(storagePage)
    expect(await getAttendanceForTechnician()).toHaveLength(1)
    await storageContext.close()

    await resetPontajMutations()
    await clearKioskSelfies()
    const offlineContext = await kioskContext(browser)
    const offlinePage = await offlineContext.newPage()
    await openKiosk(offlinePage)
    await chooseUser(offlinePage, "start")
    await offlinePage.getByRole("button", { name: "Da, continuă" }).click()
    await offlineContext.setOffline(true)
    await offlinePage.getByRole("button", { name: "Fă selfie" }).click()
    await expect(offlinePage.getByText("Upload selfie eșuat", { exact: true }).first()).toBeVisible()
    await expectNoTechnicianKioskWrites()
    await offlineContext.setOffline(false)
    await offlinePage.reload()
    await startKioskSession(offlinePage)
    expect(await getAttendanceForTechnician()).toHaveLength(1)

    // Characterization: losing connectivity after the committed Start does not create another session after reconnect.
    await offlineContext.setOffline(true)
    await offlineContext.setOffline(false)
    await offlinePage.reload()
    await expect(offlinePage.getByTestId("kiosk-stop")).toBeVisible()
    expect(await getAttendanceForTechnician()).toHaveLength(1)
    await offlineContext.close()
  })

  test("KSK-011 doi utilizatori consecutivi au stare și documente separate", async ({ browser }) => {
    await seedKioskUser({
      uid: SECOND_TECH_UID,
      employeeId: SECOND_TECH_EMPLOYEE_ID,
      fullName: `Al Doilea ${RUN_ID}`,
      email: `${SECOND_TECH_UID}@e2e.invalid`,
      role: "tehnician",
    })
    const firstContext = await kioskContext(browser)
    const firstPage = await firstContext.newPage()
    await openKiosk(firstPage)
    await startKioskSession(firstPage, TECH_UID)
    await firstContext.close()

    // A fresh kiosk browser session prevents media-element state from leaking between employees.
    const secondContext = await kioskContext(browser)
    const secondPage = await secondContext.newPage()
    await openKiosk(secondPage)
    await startKioskSession(secondPage, SECOND_TECH_UID)
    expect(await sessionsFor(TECH_UID)).toHaveLength(1)
    expect(await sessionsFor(SECOND_TECH_UID)).toHaveLength(1)
    expect((await sessionsFor(TECH_UID))[0].checkInSelfiePath).not.toBe((await sessionsFor(SECOND_TECH_UID))[0].checkInSelfiePath)
    await secondContext.close()
  })

  test("KSK-012 Start și Stop simultan converg la un singur rezultat logic", async ({ browser }) => {
    const startContexts = await Promise.all([0, 1].map(() => kioskContext(browser)))
    const startPages = await Promise.all(startContexts.map((context) => context.newPage()))
    await Promise.all(startPages.map((page) => openKiosk(page)))
    await Promise.all(startPages.map((page) => chooseUser(page, "start")))
    await Promise.all(startPages.map((page) => page.getByRole("button", { name: "Da, continuă" }).click()))
    await Promise.all(startPages.map((page) => page.getByRole("button", { name: "Fă selfie" }).click()))
    await expect.poll(async () => (await sessionsFor(TECH_UID)).filter((session) => session.status === "active").length).toBe(1)
    const [active] = (await sessionsFor(TECH_UID)).filter((session) => session.status === "active")
    expect((await getLock() as any)?.activeSessionId).toBe(active.id)
    await Promise.all(startContexts.map((context) => context.close()))

    const stopContexts = await Promise.all([0, 1].map(() => kioskContext(browser)))
    const stopPages = await Promise.all(stopContexts.map((context) => context.newPage()))
    await Promise.all(stopPages.map(async (page) => {
      await openKiosk(page, STOP_V01_INSTANT)
      await chooseUser(page, "stop")
      await page.getByRole("button", { name: "Da, continuă" }).click()
      await page.getByRole("button", { name: "Fă selfie" }).click()
    }))
    await expect.poll(async () => (await sessionsFor(TECH_UID)).filter((session) => session.status === "completed").length).toBe(1)
    expect(await getLock()).toBeNull()
    await expect.poll(async () => {
      const days = (await e2eDb.collection("hrTimesheets").doc(TIMESHEET_ID).get()).get("days")
      return days?.["8"]?.entries?.length ?? 0
    }).toBe(1)
    await Promise.all(stopContexts.map((context) => context.close()))
  })

  test("KSK-013 logout acoperă Cancel, Escape, X, parolă, loading, dublu-submit și context nou", async ({ browser }) => {
    const context = await kioskContext(browser)
    const page = await context.newPage()
    await openKiosk(page)

    await page.getByRole("button", { name: "Deconectare" }).click()
    await page.getByRole("button", { name: "Anulează" }).click()
    await expect(page.getByRole("heading", { name: "Deconectare Kiosk" })).toHaveCount(0)
    await page.getByRole("button", { name: "Deconectare" }).click()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("heading", { name: "Deconectare Kiosk" })).toHaveCount(0)
    await page.getByRole("button", { name: "Deconectare" }).click()
    await page.getByRole("button", { name: "Close" }).click()
    await expect(page.getByRole("heading", { name: "Deconectare Kiosk" })).toHaveCount(0)

    await page.getByRole("button", { name: "Deconectare" }).click()
    const passwordInput = page.getByPlaceholder("Parola contului Kiosk")
    await expect(passwordInput).toHaveAttribute("type", "password")
    await passwordInput.fill("gresita")
    await page.getByRole("button", { name: "Continuă" }).click()
    await expect(page.getByText("Parolă invalidă", { exact: true }).first()).toBeVisible()
    await passwordInput.fill(PASSWORD)
    let verificationRequests = 0
    let releaseVerification: (() => void) | undefined
    const verificationReleased = new Promise<void>((resolve) => { releaseVerification = resolve })
    let verificationStarted: (() => void) | undefined
    const verificationStartedPromise = new Promise<void>((resolve) => { verificationStarted = resolve })
    await context.route("**/identitytoolkit.googleapis.com/**", async (route) => {
      if (route.request().url().includes("signInWithPassword")) {
        verificationRequests += 1
        verificationStarted?.()
        await verificationReleased
      }
      await route.continue()
    })
    const verify = page.getByRole("button", { name: "Continuă" })
    const firstSubmit = verify.click()
    await verificationStartedPromise
    const verifying = page.getByRole("button", { name: "Verific..." })
    await expect(verifying).toBeDisabled()
    await verifying.dispatchEvent("click")
    releaseVerification?.()
    await firstSubmit
    expect(verificationRequests).toBe(1)
    await expect(page.getByText("Ești sigur că vrei să te deconectezi?")).toBeVisible()
    expect(await page.content()).not.toContain(PASSWORD)
    await page.getByRole("button", { name: "Da, deconectează" }).click()
    await expect(page).toHaveURL(/\/login(?:$|[?#])/)
    expect((await context.cookies()).find((cookie) => cookie.name === "userRole")).toBeUndefined()
    const unauthenticated = await browser.newContext({ baseURL: "http://127.0.0.1:3100" })
    const freshPage = await unauthenticated.newPage()
    await freshPage.goto("/kiosk")
    await expect(freshPage).toHaveURL(/\/login(?:$|[?#])/)
    await unauthenticated.close()
    await context.close()
  })

  test("KSK-014 companion touch verifică portrait, landscape, resize, scroll, focus, dialoguri și tap targets", async ({ browser }) => {
    const context = await kioskContext(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    await openKiosk(page)
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport)
      const start = page.getByTestId("kiosk-start")
      const stop = page.getByTestId("kiosk-stop")
      await expect(start).toBeVisible()
      await expect(stop).toBeVisible()
      const [startBox, stopBox] = await Promise.all([start.boundingBox(), stop.boundingBox()])
      expect(startBox).not.toBeNull()
      expect(stopBox).not.toBeNull()
      expect((startBox as any).width).toBeGreaterThanOrEqual(44)
      expect((startBox as any).height).toBeGreaterThanOrEqual(44)
      expect((stopBox as any).width).toBeGreaterThanOrEqual(44)
      expect((stopBox as any).height).toBeGreaterThanOrEqual(44)
      expect((startBox as any).x + (startBox as any).width <= (stopBox as any).x || (stopBox as any).x + (stopBox as any).width <= (startBox as any).x || (startBox as any).y + (startBox as any).height <= (stopBox as any).y || (stopBox as any).y + (stopBox as any).height <= (startBox as any).y).toBe(true)
      await start.tap()
      await expect(page.getByTestId("kiosk-user").first()).toBeVisible()
      await page.getByTestId("kiosk-user").first().focus()
      await expect(page.getByTestId("kiosk-user").first()).toBeFocused()
      await page.mouse.wheel(0, 600)
      await expect(page.getByTestId("kiosk-user").first()).toBeVisible()
      await page.getByRole("button", { name: "Anulează" }).tap()
      await expect(page.getByTestId("kiosk-state")).toHaveAttribute("data-kiosk-state", "idle")
    }

    await seedActiveSession(START_INSTANT.getTime())
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await page.getByTestId("kiosk-stop").tap()
    await expect(page.getByTestId("kiosk-user").first()).toBeVisible()
    await page.locator(`[data-testid="kiosk-user"][data-user-uid="${TECH_UID}"]`).tap()
    await expect(page.getByRole("heading", { name: "Confirmare Stop" })).toBeVisible()
    const dialogBox = await page.getByRole("dialog").boundingBox()
    expect(dialogBox).not.toBeNull()
    expect((dialogBox as any).x).toBeGreaterThanOrEqual(0)
    expect((dialogBox as any).y).toBeGreaterThanOrEqual(0)
    await page.getByRole("button", { name: "Nu", exact: true }).tap()
    await context.close()
  })
})
