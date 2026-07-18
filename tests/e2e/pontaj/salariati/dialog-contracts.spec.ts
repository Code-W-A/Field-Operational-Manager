import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID } from "../../fixtures/pontaj-minimal"
import { hrContext, openDepartments, openEmployees, resetHrFixture } from "./hr.helpers"

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLw7QAAAABJRU5ErkJggg==", "base64")

test.describe("HR dialog contracts", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("add/edit employee: focus modal, Escape/X/outside, validare, reset si snapshot defaults", async ({ browser }) => {
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    const beforeEmployees = await e2eDb.collection("hrEmployees").get()

    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const add = page.getByRole("dialog", { name: "Adaugă salariat" })
    await expect(add).toBeVisible()
    await expect(add.locator(":focus")).toHaveCount(1)
    await page.keyboard.press("Tab")
    await expect(add.locator(":focus")).toHaveCount(1)
    await page.keyboard.press("Shift+Tab")
    await expect(add.locator(":focus")).toHaveCount(1)
    await page.mouse.click(5, 5)
    await expect(add).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(add).toHaveCount(0)

    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const invalid = page.getByRole("dialog", { name: "Adaugă salariat" })

    await invalid.getByRole("button", { name: "Salvează" }).click()
    await expect(invalid.getByRole("alert")).toContainText("Numele și prenumele sunt obligatorii.")
    expect((await e2eDb.collection("hrEmployees").get()).size).toBe(beforeEmployees.size)
    await invalid.getByRole("button", { name: "Close" }).click()
    await expect(invalid).toHaveCount(0)

    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const reopened = page.getByRole("dialog", { name: "Adaugă salariat" })
    await expect(reopened.locator("#employeePrenume")).toHaveValue("")
    await expect(reopened.locator("#employeeProgramLucruStart")).toHaveValue("08:00")
    await reopened.getByRole("button", { name: "Close" }).click()
    await expect(reopened).toHaveCount(0)

    await page.getByRole("button", { name: "Editează salariat" }).first().click()
    const edit = page.getByRole("dialog", { name: "Editează salariat" })
    await edit.locator("#employeeTitle").fill("Draft care nu se resetează")
    await e2eDb.collection("hrSettings").doc("defaults").update({ programLucruStart: "09:00" })
    await expect(edit.locator("#employeeTitle")).toHaveValue("Draft care nu se resetează")
    await edit.locator('input[type="file"]').setInputFiles({ name: "preview.png", mimeType: "image/png", buffer: PNG })
    await edit.getByLabel("Vezi poza").click()
    const zoom = page.getByRole("dialog", { name: "Poză profil" })
    await expect(zoom).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(zoom).toHaveCount(0)
    await expect(edit).toBeVisible()
    await page.keyboard.press("Escape")
    await context.close()
  })

  test("defaults si departamente: confirmari, cancel, create/edit/delete si limita mobila", async ({ browser }) => {
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    await page.getByLabel("Program start").fill("09:00")
    await page.getByRole("button", { name: "Salvează", exact: true }).click()
    const apply = page.getByRole("alertdialog", { name: "Aplicăm programul la toți salariații?" })
    await expect(apply).toBeVisible()
    await page.mouse.click(5, 5)
    await expect(apply).toBeVisible()
    await apply.getByRole("button", { name: "Doar program standard" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrSettings").doc("defaults").get()).get("programLucruStart")).toBe("09:00")

    await openDepartments(page)
    await page.getByRole("button", { name: "Adaugă departament" }).click()
    const create = page.getByRole("dialog", { name: "Departament nou" })
    await expect(create).toBeVisible()
    await create.getByLabel("Nume departament *").fill(`${RUN_ID} Dialog`)
    await page.keyboard.press("Escape")
    expect((await e2eDb.collection("hrDepartments").where("name", "==", `${RUN_ID} Dialog`).get()).empty).toBe(true)

    await page.getByRole("button", { name: "Adaugă departament" }).click()
    await page.getByRole("dialog", { name: "Departament nou" }).getByLabel("Nume departament *").fill(`${RUN_ID} Dialog`)
    await page.getByRole("dialog", { name: "Departament nou" }).getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrDepartments").where("name", "==", `${RUN_ID} Dialog`).get()).size).toBe(1)
    const created = await e2eDb.collection("hrDepartments").where("name", "==", `${RUN_ID} Dialog`).get()
    expect(created.size).toBe(1)

    const row = page.getByRole("row").filter({ hasText: `${RUN_ID} Dialog` })
    await row.getByTitle("Editează").click()
    await page.getByRole("dialog", { name: "Editează departament" }).getByLabel("Nume departament *").fill(`${RUN_ID} Dialog editat`)
    await page.getByRole("dialog", { name: "Editează departament" }).getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await created.docs[0].ref.get()).get("name")).toBe(`${RUN_ID} Dialog editat`)

    const editedRow = page.getByRole("row").filter({ hasText: `${RUN_ID} Dialog editat` })
    await editedRow.getByTitle("Șterge").click()
    const remove = page.getByRole("alertdialog", { name: "Confirmare ștergere" })
    await remove.getByRole("button", { name: "Anulează" }).click()
    expect((await created.docs[0].ref.get()).exists).toBe(true)
    await editedRow.getByTitle("Șterge").click()
    await page.getByRole("alertdialog", { name: "Confirmare ștergere" }).getByRole("button", { name: "Șterge" }).click()
    await expect.poll(async () => (await created.docs[0].ref.get()).exists).toBe(false)
    await context.close()

    const mobile = await browser.newContext({
      baseURL: "http://127.0.0.1:3100",
      locale: "ro-RO",
      timezoneId: "Europe/Bucharest",
      storageState: "tests/e2e/.auth/admin.json",
      viewport: { width: 375, height: 667 },
    })
    const mobilePage = await mobile.newPage()
    await openEmployees(mobilePage)
    await mobilePage.getByRole("button", { name: "Adaugă", exact: true }).click()
    const mobileDialog = mobilePage.getByRole("dialog", { name: "Adaugă salariat" })
    const bounds = await mobileDialog.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeLessThanOrEqual(375)
    expect(bounds!.height).toBeLessThanOrEqual(667)
    await mobile.close()
  })
})
