import path from "node:path"
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { calculateDistance, determineMode } from "../../../../lib/attendance/location"
import { e2eDb, FieldValue, Timestamp } from "../../fixtures/firebase-admin"
import {
  ADMIN_UID, DISPATCHER_UID, EMPLOYEE_ID, RUN_ID, TECH_UID,
  getAttendanceForTechnician, getLock, getTimesheet, resetPontajMutations, seedMinimalPontajFixture,
} from "../../fixtures/pontaj-minimal"
import { continueWithoutSelfie, installClock, START_INSTANT } from "../helpers"

const employeeRef = () => e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID)
const defaultsRef = () => e2eDb.collection("hrSettings").doc("defaults")
const duplicateNameEmployeeRef = () => e2eDb.collection("hrEmployees").doc(`${EMPLOYEE_ID}_duplicate_name`)

async function openField(page: Page, at = START_INSTANT) {
  await installClock(page, at)
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
}

async function clickStart(page: Page, confirmSpecial = false) {
  await page.getByRole("button", { name: /Mă pontez acum/i }).click()
  if (confirmSpecial) await page.getByRole("button", { name: "Da, mă pontez" }).click()
  await continueWithoutSelfie(page)
}

async function expectSingleActive(options: { timesheetAbsent?: boolean } = {}) {
  await expect.poll(async () => (await getAttendanceForTechnician()).length).toBe(1)
  const [session] = await getAttendanceForTechnician() as any[]
  expect(session.status).toBe("active")
  expect((await getLock() as any)?.activeSessionId).toBe(session.id)
  if (options.timesheetAbsent !== false) expect(await getTimesheet()).toBeNull()
  return session
}

async function seedTimesheetDay(day: Record<string, unknown>) {
  await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`).set({
    employeeId: EMPLOYEE_ID, monthKey: "2026-07", days: { "8": day }, ownerRunId: RUN_ID,
  })
}

test.beforeEach(async () => {
  await duplicateNameEmployeeRef().delete()
  await seedMinimalPontajFixture({ auth: false })
  await resetPontajMutations()
})
test.afterEach(async () => {
  await duplicateNameEmployeeRef().delete()
  await seedMinimalPontajFixture({ auth: false })
  await resetPontajMutations()
})

test("STA-001 employeeId rezolvat direct produce o singură sesiune și lock valid", async ({ page }) => {
  await openField(page)
  await clickStart(page)
  const session = await expectSingleActive()
  expect(session.employeeId).toBe(EMPLOYEE_ID)
  expect(session.sessionStart).toBeInstanceOf(Timestamp)
  expect(session.programLucruStart).toBe("08:00")
  expect(session.programLucruEnd).toBe("16:30")
})

test("STA-002 rezolvarea după userUid păstrează employeeId", async ({ page }) => {
  await openField(page)
  await clickStart(page)
  expect((await expectSingleActive()).employeeId).toBe(EMPLOYEE_ID)
})

test("STA-003 fallback fullName face backfill userUid", async ({ page }) => {
  await employeeRef().update({ userUid: FieldValue.delete(), fullName: `${RUN_ID} Tehnician` })
  await openField(page)
  await clickStart(page)
  expect((await expectSingleActive()).employeeId).toBe(EMPLOYEE_ID)
  await expect.poll(async () => (await employeeRef().get()).get("userUid")).toBe(TECH_UID)
})

test("STA-004 fallback fullName ambiguu refuză Start până la asocierea explicită userUid", async ({ page }) => {
  const duplicateId = duplicateNameEmployeeRef().id
  await employeeRef().update({ userUid: FieldValue.delete(), fullName: `${RUN_ID} Tehnician` })
  await e2eDb.collection("hrEmployees").doc(duplicateId).set({
    fullName: `${RUN_ID} Tehnician`,
    active: true,
    ownerRunId: RUN_ID,
  })

  await openField(page)
  await clickStart(page)
  await expect(page.getByText(/mai mulți salariați cu acest nume/i).first()).toBeVisible()
  expect(await getAttendanceForTechnician()).toHaveLength(0)
  expect(await getLock()).toBeNull()
  expect((await employeeRef().get()).get("userUid")).toBeUndefined()
  expect((await e2eDb.collection("hrEmployees").doc(duplicateId).get()).get("userUid")).toBeUndefined()

  await employeeRef().update({ userUid: TECH_UID })
  await page.reload()
  await clickStart(page)
  expect((await expectSingleActive()).employeeId).toBe(EMPLOYEE_ID)
})

test("STA-005 tehnicianul fără employee creează attendance fără employeeId și fără timesheet", async ({ page }) => {
  await employeeRef().delete()
  await openField(page)
  await clickStart(page)
  const session = await expectSingleActive()
  expect(session.employeeId).toBeUndefined()
})

test("STA-006 admin și dispecer fără employee sunt blocați înainte de write", async ({ browser }) => {
  for (const [state, uid] of [["admin", ADMIN_UID], ["dispatcher", DISPATCHER_UID]] as const) {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:3100", storageState: path.resolve(`tests/e2e/.auth/${state}.json`),
      permissions: ["geolocation"], geolocation: { latitude: 44.4268, longitude: 26.1025 },
    })
    const page = await context.newPage()
    await page.goto("/dashboard/lucrari")
    await expect(page.getByText(/Contul tău nu este asociat cu un salariat HR/)).toBeVisible()
    await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeDisabled()
    expect((await e2eDb.collection("attendance").where("userId", "==", uid).get()).size).toBe(0)
    await context.close()
  }
})

test("STA-007 inactive, fără email și fără departament urmează caracterizarea field", async ({ page }) => {
  await employeeRef().update({ active: false, email: FieldValue.delete(), sectorIds: [] })
  await openField(page)
  await clickStart(page)
  expect((await expectSingleActive()).employeeId).toBe(EMPLOYEE_ID)
})

test("STA-008 precedența program individual, defaults, parțial și fallback", async ({ page }) => {
  await employeeRef().update({ programLucruStart: "07:15", programLucruEnd: "15:45" })
  await openField(page)
  await clickStart(page)
  let session = await expectSingleActive()
  expect([session.programLucruStart, session.programLucruEnd]).toEqual(["07:15", "15:45"])

  await resetPontajMutations()
  await employeeRef().update({ programLucruStart: FieldValue.delete(), programLucruEnd: FieldValue.delete() })
  await page.reload()
  await clickStart(page)
  session = await expectSingleActive()
  expect([session.programLucruStart, session.programLucruEnd]).toEqual(["08:00", "16:30"])

  await resetPontajMutations()
  await employeeRef().update({ programLucruStart: "09:00", programLucruEnd: FieldValue.delete() })
  await page.reload()
  await clickStart(page)
  session = await expectSingleActive()
  expect([session.programLucruStart, session.programLucruEnd]).toEqual(["09:00", "16:30"])

  await resetPontajMutations()
  await employeeRef().update({ programLucruStart: FieldValue.delete(), programLucruEnd: FieldValue.delete() })
  await defaultsRef().delete()
  await page.reload()
  await clickStart(page)
  session = await expectSingleActive()
  expect([session.programLucruStart, session.programLucruEnd]).toEqual(["08:00", "16:30"])
})

test("STA-009 devreme este 0, întârzierea folosește floor", async ({ page }) => {
  await openField(page, new Date("2026-07-08T04:30:00.000Z"))
  await clickStart(page)
  expect((await expectSingleActive()).lateStartMinutes).toBeUndefined()
  await resetPontajMutations()
  await page.clock.setFixedTime(new Date("2026-07-08T05:17:59.000Z"))
  await page.reload()
  await clickStart(page)
  expect((await expectSingleActive()).lateStartMinutes).toBe(17)
})

test("STA-010 CO/CFP/CM/IN blochează, DEL permite", async ({ page }) => {
  for (const code of ["CO", "CFP", "CM", "IN"]) {
    await resetPontajMutations()
    await seedTimesheetDay({ code })
    await openField(page)
    await clickStart(page)
    await expect(page.getByText(/astăzi ești în concediu/i).first()).toBeVisible()
    expect(await getAttendanceForTechnician()).toHaveLength(0)
  }
  await resetPontajMutations()
  await seedTimesheetDay({ code: "DEL" })
  await page.reload()
  await clickStart(page)
  await expectSingleActive({ timesheetAbsent: false })
})

test("STA-011 overlap respectă intervalul semi-deschis [start,end)", async ({ page }) => {
  await seedTimesheetDay({ code: "WORK", entries: [{ start: "07:00", end: "08:00", source: "Manual" }] })
  await openField(page)
  await clickStart(page)
  await expectSingleActive({ timesheetAbsent: false })

  await resetPontajMutations()
  await seedTimesheetDay({ code: "WORK", entries: [{ start: "07:59", end: "08:01", source: "Manual" }] })
  await page.reload()
  await clickStart(page)
  await expect(page.getByText(/Există deja pontaj în condică/)).toBeVisible()
  expect(await getAttendanceForTechnician()).toHaveLength(0)
})

test("STA-012 weekend: anularea nu scrie, confirmarea salvează snapshotul", async ({ page }) => {
  const saturday = new Date("2026-07-11T05:00:00.000Z")
  await openField(page, saturday)
  await page.getByRole("button", { name: /Mă pontez acum/i }).click()
  await expect(page.getByRole("heading", { name: "Pontaj în zi nelucrătoare" })).toBeVisible()
  await page.getByRole("button", { name: "Anulează" }).click()
  expect(await getAttendanceForTechnician()).toHaveLength(0)
  await clickStart(page, true)
  expect((await expectSingleActive()).specialDayConfirmation).toMatchObject({ required: true, confirmed: true })
})

test("STA-013 selfie field poate fi omis și statusul missing este salvat", async ({ page }) => {
  await openField(page)
  await clickStart(page)
  expect((await expectSingleActive()).checkInSelfieStatus).toBe("missing")
})

test("STA-014 camera indisponibilă nu blochează opțiunea fără selfie", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100", storageState: path.resolve("tests/e2e/.auth/technician.json"),
    permissions: ["geolocation"], geolocation: { latitude: 44.4268, longitude: 26.1025 },
  })
  const page = await context.newPage()
  await openField(page)
  await clickStart(page)
  await expectSingleActive()
  await context.close()
})

test("STA-015 pragurile GPS 49/50/51m sunt determinate fără rotunjire", async () => {
  const office = { lat: 44.4268, lng: 26.1025, address: "E2E Office" }
  const pointAt = (meters: number) => ({ lat: office.lat + meters / 111_111, lng: office.lng })
  expect(calculateDistance(office.lat, office.lng, pointAt(49).lat, pointAt(49).lng)).toBeLessThan(50)
  expect(determineMode(pointAt(49), office)).toBe("office")
  expect(determineMode(pointAt(51), office)).toBe("field")
})

test("STA-016 GPS refuzat afișează instrucțiuni și reia același Start fără document orphan", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100", storageState: path.resolve("tests/e2e/.auth/technician.json"),
  })
  await context.addInitScript(() => {
    let attempts = 0
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback) => {
          attempts += 1
          if (attempts === 1) {
            error({ code: 1, message: "Permission denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
            return
          }
          success({
            coords: {
              latitude: 44.4268,
              longitude: 26.1025,
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
            },
            timestamp: Date.now(),
          } as GeolocationPosition)
        },
      },
    })
  })
  const page = await context.newPage()
  await openField(page)
  await clickStart(page)
  const dialog = page.getByRole("dialog", { name: "Locația este necesară pentru pontaj" })
  await expect(dialog).toContainText("Permisiunea pentru locație a fost refuzată")
  await expect(dialog).toContainText("aplicația web nu poate deschide direct setările telefonului")
  expect(await getAttendanceForTechnician()).toHaveLength(0)
  expect(await getLock()).toBeNull()
  await dialog.getByRole("button", { name: "Încearcă din nou" }).click()
  await expectSingleActive()
  await context.close()
})

test("STA-017 două contexte Start păstrează invariantul unei singure sesiuni active", async ({ browser }) => {
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({
    baseURL: "http://127.0.0.1:3100", storageState: path.resolve("tests/e2e/.auth/technician.json"),
    permissions: ["geolocation"], geolocation: { latitude: 44.4268, longitude: 26.1025 },
  })))
  const pages = await Promise.all(contexts.map((context) => context.newPage()))
  await Promise.all(pages.map((page) => openField(page)))
  await Promise.all(pages.map((page) => page.getByRole("button", { name: /Mă pontez acum/i }).click()))
  await Promise.all(pages.map((page) => continueWithoutSelfie(page)))
  await expect.poll(async () => (await getAttendanceForTechnician()).filter((s: any) => s.status === "active").length).toBe(1)
  const [active] = (await getAttendanceForTechnician() as any[]).filter((s) => s.status === "active")
  expect((await getLock() as any)?.activeSessionId).toBe(active.id)
  await Promise.all(contexts.map((context) => context.close()))
})

test("STA-018 lock stale și orphan este înlocuit de Start", async ({ page }) => {
  await e2eDb.collection("attendanceActiveSessions").doc(TECH_UID).set({
    userId: TECH_UID, activeSessionId: "missing-session", ownerRunId: RUN_ID,
  })
  await installClock(page, START_INSTANT)
  await page.goto("/dashboard/lucrari")
  await clickStart(page)
  const active = await expectSingleActive()
  expect((await getLock() as any)?.activeSessionId).toBe(active.id)
})

test("STA-019 active fără lock este recuperată de cititor, fără a crea a doua sesiune", async ({ page }) => {
  const startMs = START_INSTANT.getTime() - 120_000
  await e2eDb.collection("attendance").doc("unlocked-active").set({
    userId: TECH_UID, employeeId: EMPLOYEE_ID, status: "active", sessionStart: Timestamp.fromMillis(startMs),
    programLucruStart: "08:00", programLucruEnd: "16:30", ownerRunId: RUN_ID,
  })
  await installClock(page, START_INSTANT)
  await page.goto("/dashboard/lucrari")
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
  expect((await getAttendanceForTechnician() as any[]).filter((s) => s.status === "active")).toHaveLength(1)
  expect(await getLock()).toBeNull()
})

test("STA-020 offline înainte de commit produce zero write și refresh-ul recuperează", async ({ context, page }) => {
  await openField(page)
  await context.setOffline(true)
  await page.getByRole("button", { name: /Mă pontez acum/i }).click()
  await continueWithoutSelfie(page)
  await expect.poll(async () => (await getAttendanceForTechnician()).length, { timeout: 2_000 }).toBe(0)
  await context.setOffline(false)
  await page.reload()
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
})
