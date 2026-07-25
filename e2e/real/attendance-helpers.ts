import type { Browser, Locator, Page } from "@playwright/test"

import { expect } from "./fixtures"
import { getBaseUrl, getCredentials, makeRunPrefix, readOptionalEnv, STORAGE_STATE } from "./env"

export type AttendanceFixture = {
  source: string
  employeeId: string
  employeeName: string
  userUid: string
  departmentId: string | null
}

export type AttendanceExpectedValues = {
  expectedBank?: string
  expectedC1?: string
  expectedC2?: string
  expectedC3?: string
  expectedC4?: string
  expectedC5?: string
  expectedC6?: string
  expectedC7?: string
}

export function getAttendanceExpectedValues(): AttendanceExpectedValues {
  return {
    expectedBank: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_BANK"),
    expectedC1: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_C1"),
    expectedC2: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_C2"),
    expectedC3: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_C3"),
    expectedC4: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_C4"),
    expectedC5: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_C5"),
    expectedC6: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_C6"),
    expectedC7: readOptionalEnv("E2E_ATTENDANCE_EXPECTED_C7"),
  }
}

function ensureBootstrapPayload(data: unknown): AttendanceFixture {
  const fixture = (data as any)?.fixture
  if (!fixture?.employeeName || !fixture?.employeeId) {
    throw new Error(`Invalid E2E attendance fixture response: ${JSON.stringify(data)}`)
  }

  return {
    source: String(fixture.source || "api"),
    employeeId: String(fixture.employeeId),
    employeeName: String(fixture.employeeName),
    userUid: String(fixture.userUid || ""),
    departmentId: fixture.departmentId ? String(fixture.departmentId) : null,
  }
}

export async function ensureAttendanceFixtureFromAdminPage(page: Page): Promise<AttendanceFixture> {
  const response = await page.request.post("/api/e2e/attendance-fixture", {
    data: {
      allowMutating: true,
      runPrefix: makeRunPrefix(),
      techEmail: getCredentials("tech").email,
    },
  })

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    data = { error: await response.text().catch(() => "") }
  }

  if (!response.ok()) {
    throw new Error(
      [
        `E2E attendance fixture bootstrap failed (${response.status()}).`,
        "Verifica daca deployment-ul contine ruta /api/e2e/attendance-fixture si daca sesiunea admin este valida.",
        `Response: ${JSON.stringify(data)}`,
      ].join(" ")
    )
  }

  return ensureBootstrapPayload(data)
}

export async function ensureAttendanceFixture(browser: Browser): Promise<AttendanceFixture> {
  const adminContext = await browser.newContext({
    baseURL: getBaseUrl(),
    storageState: STORAGE_STATE.admin,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
  })

  try {
    const adminPage = await adminContext.newPage()
    return await ensureAttendanceFixtureFromAdminPage(adminPage)
  } finally {
    await adminContext.close()
  }
}

export function localMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

export function localDateAt(hour: number, minute = 0, base = new Date()) {
  const d = new Date(base)
  d.setHours(hour, minute, 0, 0)
  return d
}

export async function setFakeNow(page: Page, value: Date) {
  await page.addInitScript((iso) => {
    window.localStorage.setItem("e2e_fake_now", iso)
  }, value.toISOString())
}

export async function setRuntimeFakeNow(page: Page, value: Date) {
  await page.evaluate((iso) => {
    window.localStorage.setItem("e2e_fake_now", iso)
  }, value.toISOString())
}

export async function clearFakeNow(page: Page) {
  await page.evaluate(() => {
    window.localStorage.removeItem("e2e_fake_now")
  }).catch(() => undefined)
}

export function safeFixturePattern(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
}

export async function selectKioskUser(page: Page, employeeName: string) {
  const userButton = page.locator("button").filter({ hasText: safeFixturePattern(employeeName) }).first()
  await expect(userButton, `Kiosk fixture user not found: ${employeeName}`).toBeVisible({ timeout: 20_000 })
  await userButton.click()
}

export async function clickKioskSelfieCapture(page: Page) {
  const captureButton = page.getByRole("button", { name: /Fă selfie|Fa selfie|Pornește Scanarea|Porneste Scanarea/i }).first()
  await expect(captureButton).toBeVisible({ timeout: 20_000 })
  await expect(captureButton).toBeEnabled({ timeout: 20_000 })
  await captureButton.click()
}

export async function enterKioskPin(page: Page, pin = readOptionalEnv("E2E_KIOSK_PIN") || "1234") {
  await expect(page.getByTestId("kiosk-pin-dialog")).toBeVisible({ timeout: 20_000 })
  for (const digit of String(pin).replace(/\D/g, "").slice(0, 4)) {
    await page.getByTestId(`kiosk-pin-key-${digit}`).click()
  }
}

export async function finishKioskConfirmAndSelfie(page: Page, options?: { allowError?: RegExp }) {
  await expect(page.getByRole("dialog")).toContainText(/Confirmare Start|Confirmare Stop|Pontaj în zi nelucrătoare|Pontaj in zi nelucratoare/i)
  await page.getByRole("button", { name: /Da, mă pontez|Da, ma pontez|Da, continuă|Da, continua/i }).click()
  await enterKioskPin(page)
  await expect(page.getByRole("dialog")).toContainText(/Selfie pontaj/i, { timeout: 20_000 })
  await clickKioskSelfieCapture(page)
  const successPattern = /Succes|Check-In Reușit|Check-Out Reușit|Ți-ai|Ti-ai/i
  const expectedPattern = options?.allowError
    ? new RegExp(`${successPattern.source}|${options.allowError.source}`, "i")
    : successPattern
  await expect(page.locator("body")).toContainText(expectedPattern, { timeout: 60_000 })

  if (options?.allowError) {
    const bodyText = await page.locator("body").innerText().catch(() => "")
    if (options.allowError.test(bodyText)) {
      return "allowed-error" as const
    }
  }

  return "success" as const
}

export async function finishFieldSelfie(page: Page) {
  await expect(page.getByRole("dialog")).toContainText(/Ești pregătit|Esti pregatit|selfie/i, { timeout: 20_000 })
  await expect(page.locator("body")).toContainText(/Pontaj înregistrat|Ai pornit|Ai oprit|ACTIV/i, { timeout: 60_000 })
}

export async function openCondicaForFixture(page: Page, params: { employeeId?: string; monthKey?: string }) {
  const search = new URLSearchParams()
  if (params.employeeId) search.set("employeeId", params.employeeId)
  if (params.monthKey) search.set("month", params.monthKey)
  const suffix = search.toString() ? `?${search.toString()}` : ""
  await page.goto(`/dashboard/resurse-umane/condica-prezenta${suffix}`, { waitUntil: "domcontentloaded" })
  await expect(page.locator("body")).toContainText(/Condică|Condica|Export CSV/i)
}

export async function expectCondicaHasPontaj(page: Page, employeeName: string, expectedText?: RegExp) {
  await expect(page.locator("body")).toContainText(safeFixturePattern(employeeName), { timeout: 30_000 })
  await expect(page.locator("body")).toContainText(expectedText ?? /Pontaj|WORK|h|ore/i, { timeout: 30_000 })
}

export async function clickFieldAttendanceButton(page: Page, name: RegExp) {
  const button = page.getByRole("button", { name }).first()
  await expect(button).toBeVisible({ timeout: 30_000 })
  await button.click()
  return button as Locator
}
