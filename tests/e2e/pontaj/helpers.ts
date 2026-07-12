import { expect, type Page } from "@playwright/test"

export const START_INSTANT = new Date("2026-07-08T05:00:00.000Z")
export const STOP_V01_INSTANT = new Date("2026-07-08T13:30:00.000Z")

export async function installClock(page: Page, time: Date) {
  await page.clock.setFixedTime(time)
}

export async function continueWithoutSelfie(page: Page) {
  const skip = page.getByRole("button", { name: "Continuă fără selfie" })
  if (await skip.waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false)) await skip.click()
}

export async function startFromFieldCard(page: Page) {
  const start = page.getByRole("button", { name: /Mă pontez acum/i })
  await expect(start).toBeVisible()
  await expect(start).toBeEnabled()
  await start.click()
  await continueWithoutSelfie(page)
  await expect(page.getByRole("button", { name: /Mă opresc acum/i })).toBeVisible()
}

export async function stopFromFieldCard(page: Page) {
  const stop = page.getByRole("button", { name: /Mă opresc acum/i })
  await expect(stop).toBeVisible()
  await expect(stop).toBeEnabled()
  await stop.click()
  await continueWithoutSelfie(page)
  await expect(page.getByRole("button", { name: /Mă pontez acum/i })).toBeVisible()
}
