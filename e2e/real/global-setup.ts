import fs from "node:fs"
import path from "node:path"
import { chromium, expect, type Page } from "@playwright/test"

import { getBaseUrl, getCredentials, REAL_AUTH_DIR, STORAGE_STATE, type E2ERole } from "./env"

async function login(page: Page, role: E2ERole) {
  const { email, password, expectedUrl } = getCredentials(role)

  await page.goto("/login", { waitUntil: "domcontentloaded" })
  await page.locator("#email").fill(email)
  await page.locator("#password").fill(password)
  await page.getByRole("button", { name: /Autentificare/i }).click()
  await expect(page).toHaveURL(expectedUrl, { timeout: 45_000 })
  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies()
        return {
          hasSession: cookies.some((cookie) => cookie.name === "__session"),
          userRole: cookies.find((cookie) => cookie.name === "userRole")?.value,
        }
      },
      { timeout: 20_000 }
    )
    .toEqual({ hasSession: true, userRole: role === "tech" ? "tehnician" : role })
  await page.context().storageState({ path: STORAGE_STATE[role], indexedDB: true })
}

async function globalSetup() {
  fs.mkdirSync(path.resolve(REAL_AUTH_DIR), { recursive: true })

  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  })

  try {
    for (const role of ["admin", "tech", "kiosk"] as E2ERole[]) {
      const context = await browser.newContext({
        baseURL: getBaseUrl(),
        locale: "ro-RO",
        timezoneId: "Europe/Bucharest",
        permissions: ["geolocation", "camera"],
        geolocation: { latitude: 44.4268, longitude: 26.1025 },
      })
      const page = await context.newPage()
      await login(page, role)
      await context.close()
    }
  } finally {
    await browser.close()
  }
}

export default globalSetup
