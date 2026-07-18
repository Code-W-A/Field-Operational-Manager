import { expect, test } from "@playwright/test"

import { EMPLOYEE_ID, condicaContext, openCondica, resetCondicaFixture, seedCondicaDays } from "../condica/condica.helpers"

test.describe("REP-006 summary C1-C7, trasee și tichete", () => {
  test.beforeEach(resetCondicaFixture)

  test("REP-006 traseul contribuie la C1, iar weekendul rămâne caracterizat în C6/C7", async ({ browser }) => {
    await seedCondicaDays({
      "6": {
        code: "WORK", hours: 10.5,
        entries: [
          { start: "07:00", end: "08:00", travelToClient: true },
          { start: "08:00", end: "16:30", project: "Pontaj" },
          { start: "16:30", end: "17:30", travelToHome: true },
        ],
        breaks: [{ start: "12:30", end: "13:00" }],
      },
      "11": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00", project: "Pontaj" }] },
      "12": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00", project: "Pontaj" }] },
    })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId(`summary-tichete_masa-${EMPLOYEE_ID}`)).toHaveText("1")
    await expect(page.getByTestId(`summary-traseu_la-${EMPLOYEE_ID}`)).toHaveText("1")
    await expect(page.getByTestId(`summary-traseu_de-${EMPLOYEE_ID}`)).toHaveText("1")
    await expect(page.getByTestId(`summary-c1-${EMPLOYEE_ID}`)).toHaveText("1")
    await expect(page.getByTestId(`summary-c2-${EMPLOYEE_ID}`)).toHaveText("1")
    await expect(page.getByTestId(`summary-c6-${EMPLOYEE_ID}`)).toHaveText("8")
    await expect(page.getByTestId(`summary-c7-${EMPLOYEE_ID}`)).toHaveText("8")
    await context.close()
  })
})
