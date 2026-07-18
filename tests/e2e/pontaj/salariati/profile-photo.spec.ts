import { expect, test } from "@playwright/test"

import { e2eDb, e2eStorage } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID } from "../../fixtures/pontaj-minimal"
import { hrContext, openEmployees, resetHrFixture } from "./hr.helpers"

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLw7QAAAABJRU5ErkJggg==", "base64")

test.describe("HR-006 fotografie profil", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("upload-ul si stergerea actualizeaza Storage si documentul salariatului", async ({ browser }) => {
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    await page.getByRole("button", { name: "Editează salariat" }).first().click()
    const dialog = page.getByRole("dialog", { name: "Editează salariat" })
    await dialog.locator('input[type="file"]').setInputFiles({ name: "profil.png", mimeType: "image/png", buffer: PNG })
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).get()).get("photoURL")).toContain("hrEmployees")
    let [files] = await e2eStorage.bucket().getFiles({ prefix: `hrEmployees/${EMPLOYEE_ID}/` })
    expect(files).toHaveLength(1)

    await page.getByRole("button", { name: "Editează salariat" }).first().click()
    const deleteDialog = page.getByRole("dialog", { name: "Editează salariat" })
    await deleteDialog.getByRole("button", { name: "Elimină poza" }).click()
    await deleteDialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).get()).get("photoURL")).toBeNull()
    ;[files] = await e2eStorage.bucket().getFiles({ prefix: `hrEmployees/${EMPLOYEE_ID}/` })
    expect(files).toHaveLength(0)
    await context.close()
  })
})
