import { expect, test } from "@playwright/test"

import { EMPLOYEE_ID, condicaContext, openCondica, resetCondicaFixture, seedCondicaDays } from "./condica.helpers"

test.describe("Condica summaries", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-005 KPI-urile folosesc minutele efective ale intervalelor", async ({ browser }) => {
    await seedCondicaDays({
      "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:30" }], breaks: [{ start: "12:30", end: "13:00" }] },
    })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId("condica-kpi-total-hours")).toHaveText("8h")
    await expect(page.getByTestId(`summary-ore_prezenta-${EMPLOYEE_ID}`)).toHaveText("08:00")
    await context.close()
  })

  test("CON-006 sumarul expune tichete, traseu și C1-C7", async ({ browser }) => {
    await seedCondicaDays({
      "6": { code: "WORK", entries: [{ start: "07:00", end: "18:00", travelToClient: true }], hours: 11 },
      "11": { code: "WE", entries: [{ start: "08:00", end: "10:00" }], hours: 2 },
    })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId(`summary-tichete_masa-${EMPLOYEE_ID}`)).toHaveText("1")
    await expect(page.getByTestId(`summary-traseu_la-${EMPLOYEE_ID}`)).toHaveText("11")
    await expect(page.getByTestId(`summary-c1-${EMPLOYEE_ID}`)).not.toHaveText("")
    await expect(page.getByTestId(`summary-c6-${EMPLOYEE_ID}`)).not.toHaveText("")
    await context.close()
  })

  test("CON-007 codurile și celulele parțiale sunt reprezentate fără total fals", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "CO" }, "9": { code: "WORK", entries: [] } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toHaveText("CO")
    await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-9`)).toHaveAttribute("data-hours", "")
    await expect(page.getByTestId("condica-kpi-total-hours")).toHaveText("0h")
    await context.close()
  })
})
