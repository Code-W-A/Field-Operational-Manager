import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { ADMIN_UID, EMPLOYEE_ID, RUN_ID } from "../../fixtures/pontaj-minimal"
import { departmentId, hrContext, openDepartments, resetHrFixture, seedDepartment } from "./hr.helpers"

test.describe("HR-011/012 departamente", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("HR-011 creeaza, editeaza si pastreaza managerul exact", async ({ browser }) => {
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openDepartments(page)

    await page.getByRole("button", { name: "Adaugă departament" }).click()
    const dialog = page.getByRole("dialog", { name: "Departament nou" })
    const name = `${RUN_ID} Operațional`
    await dialog.getByLabel("Nume departament *").fill(name)
    await dialog.getByLabel("Șef departament").click()
    await page.getByText(`${RUN_ID} Admin`, { exact: false }).last().click()
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrDepartments").where("name", "==", name).get()).size).toBe(1)
    const created = await e2eDb.collection("hrDepartments").where("name", "==", name).get()
    const ref = created.docs[0].ref
    expect(created.docs[0].get("managerUid")).toBe(ADMIN_UID)
    expect(created.docs[0].get("createdAt")).toBeTruthy()
    expect(created.docs[0].get("updatedAt")).toBeTruthy()

    const row = page.getByRole("row").filter({ hasText: name })
    await row.getByTitle("Editează").click()
    const editDialog = page.getByRole("dialog", { name: "Editează departament" })
    await editDialog.getByLabel("Nume departament *").fill(`${name} Editat`)
    await editDialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await ref.get()).get("name")).toBe(`${name} Editat`)
    expect((await ref.get()).get("managerUid")).toBe(ADMIN_UID)
    await context.close()
  })

  test("HR-012 confirma stergerea libera si refuza stergerea unui departament asociat", async ({ browser }) => {
    const freeDepartment = departmentId("free")
    const usedDepartment = departmentId("used")
    await seedDepartment(freeDepartment, { name: `${RUN_ID} Liber` })
    await seedDepartment(usedDepartment, { name: `${RUN_ID} Asociat` })
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({ sectorIds: [usedDepartment] })

    const context = await hrContext(browser)
    const page = await context.newPage()
    await openDepartments(page)

    const freeRow = page.getByRole("row").filter({ hasText: `${RUN_ID} Liber` })
    await freeRow.getByTitle("Șterge").click()
    const confirmation = page.getByRole("alertdialog", { name: "Confirmare ștergere" })
    await confirmation.getByRole("button", { name: "Anulează" }).click()
    expect((await e2eDb.collection("hrDepartments").doc(freeDepartment).get()).exists).toBe(true)
    await freeRow.getByTitle("Șterge").click()
    await page.getByRole("alertdialog", { name: "Confirmare ștergere" }).getByRole("button", { name: "Șterge" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrDepartments").doc(freeDepartment).get()).exists).toBe(false)

    const usedRow = page.getByRole("row").filter({ hasText: `${RUN_ID} Asociat` })
    await usedRow.getByTitle("Șterge").click()
    await page.getByRole("alertdialog", { name: "Confirmare ștergere" }).getByRole("button", { name: "Șterge" }).click()
    await expect(page.getByText("Nu se poate șterge", { exact: true })).toBeVisible()
    expect((await e2eDb.collection("hrDepartments").doc(usedDepartment).get()).exists).toBe(true)
    await context.close()
  })
})
