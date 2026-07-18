import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { ADMIN_UID, EMPLOYEE_ID, RUN_ID } from "../../fixtures/pontaj-minimal"
import { hrContext, hrSnapshot, openEmployees, resetHrFixture } from "./hr.helpers"

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLw7QAAAABJRU5ErkJggg==", "base64")

test.describe("HR-013 autorizare dispecer", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("caracterizeaza toate actiunile UI pentru salariati si refuzul de interfata pentru departamente", async ({ browser }) => {
    const context = await hrContext(browser, "dispatcher")
    const page = await context.newPage()
    await openEmployees(page)
    await page.getByLabel("Caută în tabel").fill(`Tehnician ${RUN_ID}`)
    await expect(page.getByRole("button", { name: "Fișă" })).toBeVisible()
    await page.getByRole("button", { name: "Fișă" }).click()
    await expect(page).toHaveURL(new RegExp(`/salariati/${EMPLOYEE_ID}`))
    await expect(page.getByRole("button", { name: "Editează", exact: true })).toBeVisible()

    const association = page.getByText("Utilizator asociat").locator("..").getByRole("combobox")
    await association.click()
    await page.getByText(`${RUN_ID} Admin`, { exact: false }).last().click()
    await expect.poll(async () => (await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).get()).get("userUid")).toBe(ADMIN_UID)
    await association.click()
    await page.getByText("Fără asociere", { exact: true }).click()
    await expect.poll(async () => (await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).get()).get("userUid")).toBeNull()

    await page.getByRole("button", { name: "Editează", exact: true }).click()
    const edit = page.getByRole("dialog", { name: "Editează salariat" })
    await edit.locator('input[type="file"]').setInputFiles({ name: "dispatcher.png", mimeType: "image/png", buffer: PNG })
    await edit.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).get()).get("photoURL")).toContain("hrEmployees")

    await page.goto("/dashboard/resurse-umane/salariati")
    await expect(page.getByRole("button", { name: "Adaugă", exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Adaugă salariat" })
    await dialog.locator("#employeePrenume").fill("Dispecer")
    await dialog.locator("#employeeNume").fill(`Acces ${RUN_ID}`)
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrEmployees").where("nume", "==", `Acces ${RUN_ID}`).get()).size).toBe(1)

    await page.locator("#defaultProgramStart").fill("09:00")
    await page.locator("#defaultProgramEnd").fill("17:00")
    await page.locator("#defaultBreakStart").fill("12:00")
    await page.locator("#defaultBreakEnd").fill("12:30")
    await page.getByRole("button", { name: "Salvează", exact: true }).click()
    await page.getByRole("alertdialog", { name: "Aplicăm programul la toți salariații?" }).getByRole("button", { name: "Doar program standard" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrSettings").doc("defaults").get()).get("programLucruStart")).toBe("09:00")

    const beforeDepartments = await hrSnapshot("hrDepartments")
    await page.goto("/dashboard/resurse-umane/departamente")
    await expect(page.getByText("Acces restricționat", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "Adaugă departament" })).toHaveCount(0)
    await page.reload()
    await expect(page.getByText("Acces restricționat", { exact: true })).toBeVisible()
    await page.goBack()
    await expect(page.getByRole("heading", { name: "Salariați" })).toBeVisible()
    await page.goForward()
    await expect(page.getByText("Acces restricționat", { exact: true })).toBeVisible()
    expect(await hrSnapshot("hrDepartments")).toEqual(beforeDepartments)
    await context.close()
  })
})
