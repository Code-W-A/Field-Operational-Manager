import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID } from "../../fixtures/pontaj-minimal"
import { employeeDocument, hrContext, openEmployees, resetHrFixture } from "./hr.helpers"

test.describe("HR-002/003/004 CRUD si asociere salariat", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("HR-002 creeaza, editeaza si caracterizeaza createdAt", async ({ browser }) => {
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Adaugă salariat" })
    await dialog.locator("#employeePrenume").fill("Nou")
    await dialog.locator("#employeeNume").fill(`Salariat ${RUN_ID}`)
    await dialog.locator("#employeeTitle").fill("Tehnician")
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect(page.getByText("Salariat adăugat", { exact: true })).toBeVisible()
    const created = await e2eDb.collection("hrEmployees").where("nume", "==", `Salariat ${RUN_ID}`).get()
    expect(created.size).toBe(1)
    const createdRef = created.docs[0].ref
    const firstCreatedAt = created.docs[0].get("createdAt")
    expect(firstCreatedAt?.toMillis()).toBeTruthy()
    expect(created.docs[0].get("updatedAt")?.toMillis()).toBeTruthy()

    await page.getByRole("button", { name: "Editează salariat" }).last().click()
    const editDialog = page.getByRole("dialog", { name: "Editează salariat" })
    await editDialog.locator("#employeeTitle").fill("Coordonator")
    await editDialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await createdRef.get()).get("title")).toBe("Coordonator")
    const edited = await createdRef.get()
    expect(edited.get("createdAt")?.toMillis()).toBeGreaterThanOrEqual(firstCreatedAt.toMillis())
    expect(edited.get("updatedAt")?.toMillis()).toBeTruthy()
    await context.close()
  })

  test("HR-003 refuza nume gol si ora invalida fara scrieri, iar ordinea programului este caracterizata", async ({ browser }) => {
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    const before = await e2eDb.collection("hrEmployees").get()
    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Adaugă salariat" })
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect(dialog.getByRole("alert")).toContainText("Numele și prenumele sunt obligatorii.")
    expect((await e2eDb.collection("hrEmployees").get()).size).toBe(before.size)

    await dialog.getByRole("button", { name: "Anulează" }).click()
    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const invalidTimeDialog = page.getByRole("dialog", { name: "Adaugă salariat" })
    await invalidTimeDialog.locator("#employeePrenume").fill("Invalid")
    await invalidTimeDialog.locator("#employeeNume").fill(`Ora ${RUN_ID}`)
    await invalidTimeDialog.locator("#employeeProgramLucruStart").fill("24:99")
    await invalidTimeDialog.getByRole("button", { name: "Salvează" }).click()
    await expect(invalidTimeDialog.getByRole("alert")).toContainText("Folosește formatul 24h")
    expect((await e2eDb.collection("hrEmployees").get()).size).toBe(before.size)

    await invalidTimeDialog.locator("#employeeProgramLucruStart").fill("16:30")
    await invalidTimeDialog.locator("#employeeProgramLucruEnd").fill("08:00")
    await invalidTimeDialog.getByRole("button", { name: "Salvează" }).click()
    await expect(page.getByText("Salariat adăugat", { exact: true })).toBeVisible()
    const reversed = await e2eDb.collection("hrEmployees").where("nume", "==", `Ora ${RUN_ID}`).get()
    expect(reversed.docs[0].get("programLucruStart")).toBe("16:30")
    expect(reversed.docs[0].get("programLucruEnd")).toBe("08:00")
    await context.close()
  })

  test("HR-004 asociaza si dez-asociaza explicit userUid prin fisa", async ({ browser }) => {
    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.goto(`/dashboard/resurse-umane/salariati/${EMPLOYEE_ID}?month=2026-07`)
    await expect(page.getByText("Asociere utilizator")).toBeVisible()
    const select = page.getByText("Utilizator asociat").locator("..").getByRole("combobox")
    await select.click()
    await page.getByText(`${RUN_ID} Admin`, { exact: false }).last().click()
    await expect.poll(async () => (await employeeDocument(EMPLOYEE_ID))?.userUid).toContain("admin_")
    await select.click()
    await page.getByText("Fără asociere", { exact: true }).click()
    await expect.poll(async () => (await employeeDocument(EMPLOYEE_ID))?.userUid ?? null).toBeNull()
    await context.close()
  })
})
