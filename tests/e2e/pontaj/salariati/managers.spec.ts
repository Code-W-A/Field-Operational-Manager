import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { ADMIN_UID, DISPATCHER_UID, EMPLOYEE_ID, RUN_ID } from "../../fixtures/pontaj-minimal"
import { departmentId, employeeDocument, hrContext, openEmployees, resetHrFixture, seedDepartment } from "./hr.helpers"

test.describe("HR-005 manageri pe sectoare", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("pastreaza managerul ales pe fiecare departament si elimina maparea departamentului scos", async ({ browser }) => {
    const primaryDepartment = departmentId("manager_primary")
    const secondaryDepartment = departmentId("manager_secondary")
    const primaryName = `${RUN_ID} Primar`
    const secondaryName = `${RUN_ID} Secundar`
    await seedDepartment(primaryDepartment, { name: primaryName, managerUid: ADMIN_UID })
    await seedDepartment(secondaryDepartment, { name: secondaryName, managerUid: DISPATCHER_UID })
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({
      sectorIds: [],
      managerUidBySector: null,
      superiorUid: null,
    })

    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    const row = page.getByRole("row").filter({ hasText: `Tehnician ${RUN_ID}` })
    await row.getByLabel("Editează salariat").click()
    const dialog = page.getByRole("dialog", { name: "Editează salariat" })

    await dialog.getByLabel(primaryName).check()
    await dialog.getByLabel(secondaryName).check()

    const primaryManager = dialog.getByText(`Departament: ${primaryName}`).locator("..").getByRole("combobox")
    await primaryManager.click()
    await page.getByRole("option", { name: new RegExp(`${RUN_ID} Admin`) }).click()
    const secondaryManager = dialog.getByText(`Departament: ${secondaryName}`).locator("..").getByRole("combobox")
    await secondaryManager.click()
    await page.getByRole("option", { name: new RegExp(`${RUN_ID} Dispecer`) }).click()
    await dialog.getByRole("button", { name: "Salvează" }).click()

    await expect.poll(async () => (await employeeDocument(EMPLOYEE_ID))?.managerUidBySector).toEqual({
      [primaryDepartment]: ADMIN_UID,
      [secondaryDepartment]: DISPATCHER_UID,
    })
    const saved = await employeeDocument(EMPLOYEE_ID)
    expect(saved?.sectorIds).toEqual(expect.arrayContaining([primaryDepartment, secondaryDepartment]))
    expect(saved?.superiorUid).toBe(ADMIN_UID)

    await page.reload()
    await openEmployees(page)
    await page.getByRole("row").filter({ hasText: `Tehnician ${RUN_ID}` }).getByLabel("Editează salariat").click()
    const secondDialog = page.getByRole("dialog", { name: "Editează salariat" })
    const secondaryCheckbox = secondDialog.locator(`#dept-${secondaryDepartment}`)
    await expect(secondaryCheckbox).toBeChecked()
    await secondaryCheckbox.click()
    await expect(secondaryCheckbox).not.toBeChecked()
    await expect(secondDialog.getByText(`Departament: ${secondaryName}`)).toHaveCount(0)
    await secondDialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => {
      const savedEmployee = await employeeDocument(EMPLOYEE_ID)
      return { sectorIds: savedEmployee?.sectorIds, managerUidBySector: savedEmployee?.managerUidBySector }
    }).toEqual({
      sectorIds: [primaryDepartment],
      managerUidBySector: { [primaryDepartment]: ADMIN_UID },
    })
    await context.close()
  })
})
