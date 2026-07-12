import fs from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { E2E_USERS, PASSWORD } from "./fixtures/pontaj-minimal"
import { e2eDb } from "./fixtures/firebase-admin"

const authDir = path.resolve("tests/e2e/.auth")

async function loginAndSave(
  context: import("@playwright/test").BrowserContext,
  email: string,
  target: RegExp,
  stateFile: string,
  requireRoleCookie = true,
) {
  let page: import("@playwright/test").Page | undefined
  for (let attempt = 0; attempt < 3; attempt += 1) {
    page = await context.newPage()
    await page.goto("/login")
    try {
      await page.getByLabel("Email").waitFor({ state: "visible", timeout: 8_000 })
      break
    } catch {
      await page.close()
      page = undefined
    }
  }
  if (!page) throw new Error("Pagina de login nu s-a stabilizat după 3 încercări")

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Parolă").fill(PASSWORD)
  await page.getByRole("button", { name: "Autentificare" }).click()
  await expect(page).toHaveURL(target)
  if (requireRoleCookie) {
    await expect.poll(async () => (await context.cookies()).find((cookie) => cookie.name === "userRole")?.value).toBeTruthy()
  }
  await context.storageState({ path: stateFile, indexedDB: true })
  return page
}

test.beforeAll(() => fs.mkdirSync(authDir, { recursive: true }))

test("salvează autentificarea rolurilor ETAPA 7 din Auth Emulator", async ({ browser }) => {
  const stateNames: Record<string, string> = {
    admin: "admin", tehnician: "technician", dispecer: "dispatcher", kiosk: "kiosk", client: "client",
    "rol-necunoscut": "unknown",
  }
  for (const user of E2E_USERS) {
    const isMissingProfileCase = "omitUserDoc" in user && user.omitUserDoc
    if (isMissingProfileCase) {
      await e2eDb.collection("users").doc(user.uid).set({
        uid: user.uid, email: user.email, displayName: user.displayName, role: "admin",
        ownerRunId: "E2E_AUTH_SETUP_TEMP",
      })
    }
    const context = await browser.newContext()
    const role = "role" in user ? user.role : undefined
    const stateName = role ? stateNames[role] : ("omitUserDoc" in user ? "no-user-doc" : "no-role")
    const target = role === "tehnician"
      ? /\/dashboard\/lucrari(?:$|[/?#])/
      : role === "kiosk"
        ? /\/kiosk(?:$|[/?#])/
        : role === "client"
          ? /\/portal(?:$|[/?#])/
          : /\/(?:dashboard|login)(?:$|[/?#])/
    const page = await loginAndSave(
      context, user.email, target, path.join(authDir, `${stateName}.json`),
      role !== undefined || isMissingProfileCase,
    )
    await page.close()
    await context.close()
    if (isMissingProfileCase) await e2eDb.collection("users").doc(user.uid).delete()
  }
})
