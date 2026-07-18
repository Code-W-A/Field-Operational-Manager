import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"

import { expect, test, type Page } from "@playwright/test"

import { e2eDb, e2eStorage } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID, TECH_UID, resetPontajMutations, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"
import { requestsContext, resetRequestsFixture } from "../requests/requests.helpers"

async function writeRequestButtonDiagnostic(page: Page, events: string[]) {
  const buttons = await page.getByRole("button").evaluateAll((elements) => elements.map((element) => ({
    text: (element.textContent || "").trim(),
    accessibleName: (element as HTMLElement).getAttribute("aria-label") || (element.textContent || "").trim(),
    disabled: (element as HTMLButtonElement).disabled,
  })))
  const directory = path.resolve("artifacts/pontaj/10a")
  mkdirSync(directory, { recursive: true })
  writeFileSync(path.join(directory, "res003-request-button-diagnostic.txt"), JSON.stringify({
    url: page.url(),
    title: await page.title(),
    headings: await page.getByRole("heading").allTextContents(),
    buttons,
    bodyText: (await page.locator("body").innerText()).slice(0, 8_000),
    events,
  }, null, 2))
}

test.describe("RES-003 dependinte externe", () => {
  test.beforeEach(async () => {
    // Auth setup already created the users and saved browser state; updating Auth here revokes that state.
    await seedMinimalPontajFixture({ auth: false })
    await resetPontajMutations()
    await e2eStorage.bucket().deleteFiles({ prefix: `attendance/selfies/${TECH_UID}/` }).catch(() => undefined)
  })

  test("RES-003 notificarea esuata dupa commit nu anuleaza si nu dubleaza cererea", async ({ browser }) => {
    await resetRequestsFixture()
    const context = await requestsContext(browser, "technician")
    const page = await context.newPage()
    const events: string[] = []
    page.on("console", (message) => events.push(`console:${message.type()}:${message.text()}`))
    page.on("pageerror", (error) => events.push(`pageerror:${error.message}`))
    page.on("requestfailed", (request) => events.push(`requestfailed:${request.url()}:${request.failure()?.errorText || "unknown"}`))
    try {
      await page.route("**/api/notifications/hr-request", (route) => route.fulfill({ status: 503, body: "mail unavailable" }))
      await page.goto("/dashboard/cereri")
      await expect(page).toHaveURL(/\/dashboard\/cereri$/)
      const createRequestButton = page.getByRole("button", { name: "Cerere", exact: true })
      await expect(createRequestButton).toBeVisible()
      await createRequestButton.click()
      const dialog = page.getByRole("dialog", { name: "Cerere nouă" })
      await dialog.getByPlaceholder("dd MMM yyyy").nth(0).fill("2026-07-10")
      await dialog.getByPlaceholder("dd MMM yyyy").nth(0).blur()
      await dialog.getByPlaceholder("dd MMM yyyy").nth(1).fill("2026-07-10")
      await dialog.getByPlaceholder("dd MMM yyyy").nth(1).blur()
      await dialog.getByRole("button", { name: "Trimite cererea" }).dblclick()
      await expect.poll(async () => (await e2eDb.collection("hrRequests").where("employeeId", "==", EMPLOYEE_ID).get()).size).toBe(1)
      const request = (await e2eDb.collection("hrRequests").where("employeeId", "==", EMPLOYEE_ID).get()).docs[0]
      expect(request.get("requesterUid")).toBe(TECH_UID)
      expect(request.get("status")).toBe("pending")
    } finally {
      await writeRequestButtonDiagnostic(page, events)
      await context.close()
    }
  })

  test("RES-003 storage respins nu produce obiect orphan", async () => {
    const files = await e2eStorage.bucket().getFiles({ prefix: `attendance/selfies/${TECH_UID}/res_denied_${RUN_ID}` })
    expect(files[0]).toHaveLength(0)
  })
})
