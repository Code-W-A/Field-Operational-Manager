import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { ADMIN_UID, DISPATCHER_UID, EMPLOYEE_ID, RUN_ID } from "../../fixtures/pontaj-minimal"
import { departmentId, employeeDocument, hrContext, openEmployees, resetHrFixture, seedDepartment } from "./hr.helpers"

test.describe("HR-005 minim - inlocuire completa manager-sector", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("deselectarea sectorului B persista exact A si managerul sau dupa refresh", async ({ browser }) => {
    const sectorA = departmentId("minimal_a")
    const sectorB = departmentId("minimal_b")
    const nameA = `${RUN_ID} Sector A`
    const nameB = `${RUN_ID} Sector B`
    await seedDepartment(sectorA, { name: nameA, managerUid: ADMIN_UID })
    await seedDepartment(sectorB, { name: nameB, managerUid: DISPATCHER_UID })
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({
      sectorIds: [sectorA, sectorB],
      managerUidBySector: { [sectorA]: ADMIN_UID, [sectorB]: DISPATCHER_UID },
      superiorUid: ADMIN_UID,
    })

    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    await page.getByRole("row").filter({ hasText: `Tehnician ${RUN_ID}` }).getByLabel("Editează salariat").click()
    const dialog = page.getByRole("dialog", { name: "Editează salariat" })
    const sectorBCheckbox = dialog.getByLabel(nameB)
    await expect(dialog.getByLabel(nameA)).toBeChecked()
    await expect(sectorBCheckbox).toBeChecked()

    await sectorBCheckbox.click()
    await expect(sectorBCheckbox).not.toBeChecked()
    await expect(dialog.getByText(`Departament: ${nameB}`)).toHaveCount(0)
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect(dialog).toHaveCount(0)

    await expect.poll(async () => {
      const employee = await employeeDocument(EMPLOYEE_ID)
      return { sectorIds: employee?.sectorIds, managerUidBySector: employee?.managerUidBySector }
    }).toEqual({
      sectorIds: [sectorA],
      managerUidBySector: { [sectorA]: ADMIN_UID },
    })

    await page.reload()
    await openEmployees(page)
    await page.getByRole("row").filter({ hasText: `Tehnician ${RUN_ID}` }).getByLabel("Editează salariat").click()
    const reopened = page.getByRole("dialog", { name: "Editează salariat" })
    await expect(reopened.getByLabel(nameA)).toBeChecked()
    await expect(reopened.getByLabel(nameB)).not.toBeChecked()
    await expect(reopened.getByText(`Departament: ${nameB}`)).toHaveCount(0)
    await context.close()
  })
})
