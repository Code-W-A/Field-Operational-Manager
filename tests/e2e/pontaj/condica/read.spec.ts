import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, condicaContext, openCondica, resetCondicaFixture, seedCondicaDays } from "./condica.helpers"

test.describe("Condica read contracts", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-001 ruta respectă luna din query și calendarul lunii", async ({ browser }) => {
    await seedCondicaDays({ "31": { code: "WORK", hours: 8 } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-31`)).toHaveAttribute("data-hours", "8")
    await context.close()
  })

  test("CON-002 filtrul păstrează grila și lista pentru salariatul ales", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8 } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toBeVisible()
    await page.getByRole("button", { name: "Grid" }).click()
    await expect(page.getByTestId(`timesheet-list-cell-${EMPLOYEE_ID}-8`)).toBeVisible()
    await context.close()
  })

  test("CON-003 modul compact persistă în localStorage și revine în mod detaliat", async ({ browser }) => {
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Compact" }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem("condica-compact-mode"))).toBe("true")
    await page.reload()
    await expect(page.getByRole("button", { name: "Detaliat" })).toBeVisible()
    await context.close()
  })

  test("CON-004 lista goală este explicită și nu scrie în Firestore", async ({ browser }) => {
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).delete()
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page, { employeeId: "all" })
    await expect(page.getByTestId("condica-empty")).toBeVisible()
    expect((await e2eDb.collection("hrTimesheets").get()).empty).toBe(true)
    await context.close()
  })
})
