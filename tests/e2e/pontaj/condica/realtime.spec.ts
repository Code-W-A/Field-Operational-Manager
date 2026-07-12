import { expect, test } from "@playwright/test"

import { EMPLOYEE_ID, condicaContext, openCondica, resetCondicaFixture, seedCondicaDays } from "./condica.helpers"

test.describe("Condica realtime", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-008 două taburi primesc aceeași actualizare Firestore", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8 } })
    const context = await condicaContext(browser)
    const first = await context.newPage()
    const second = await context.newPage()
    await Promise.all([openCondica(first), openCondica(second)])
    await seedCondicaDays({ "8": { code: "WORK", hours: 7 } })
    await expect(first.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toHaveAttribute("data-hours", "7")
    await expect(second.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toHaveAttribute("data-hours", "7")
    await context.close()
  })
})
