import type { Locator, Page } from "@playwright/test"

import { expect } from "./fixtures"

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

export async function finishKioskConfirmAndSelfie(page: Page) {
  await expect(page.getByRole("dialog")).toContainText(/Confirmare Start|Confirmare Stop|Pontaj în zi nelucrătoare|Pontaj in zi nelucratoare/i)
  await page.getByRole("button", { name: /Da, mă pontez|Da, ma pontez|Da, continuă|Da, continua/i }).click()
  await expect(page.getByRole("dialog")).toContainText(/Selfie pontaj/i, { timeout: 20_000 })
  await expect(page.locator("body")).toContainText(/Succes|Check-In Reușit|Check-Out Reușit|Ți-ai|Ti-ai/i, { timeout: 60_000 })
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
