import { expect, test } from "@playwright/test"

import { EMPLOYEE_ID, condicaContext, getCondicaTimesheet, openCondica, resetCondicaFixture, seedCondicaDays } from "./condica.helpers"

test.describe("Condica day detail and cleanup", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-009 detaliul zilei afișează intervale, pauză, sursă și se redeschide fără scrieri", async ({ browser }) => {
    await seedCondicaDays({
      "8": {
        code: "WORK", hours: 7.5,
        entries: [
          { start: "08:00", end: "12:00", methodStart: "Play", methodEnd: "Stop", project: "Pontaj", attendanceSessionId: "att-detail-1" },
          { start: "13:00", end: "16:30", methodStart: "Introdus manual de către manager", methodEnd: "Introdus manual de către manager", travelToClient: true },
        ],
        breaks: [{ start: "12:00", end: "12:30" }],
      },
    })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    const detail = page.getByTestId("condica-day-detail")
    await expect(detail).toContainText("07:30")
    await expect(detail).toContainText("12:00–12:30")
    await expect(detail.getByTestId("condica-day-entry-0")).toContainText("08:00 – 12:00")
    await expect(detail.getByTestId("condica-day-entry-1")).toContainText("TRASEU")
    await detail.getByRole("button", { name: "Verificări pontaj" }).click()
    await expect(page.getByRole("dialog", { name: "Verificări pontaj" })).toContainText("Metodă început")
    await page.getByRole("dialog", { name: "Verificări pontaj" }).press("Escape")
    await expect(page.getByRole("dialog", { name: "Verificări pontaj" })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(detail).toHaveCount(0)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    await expect(detail).toBeVisible()
    expect((await getCondicaTimesheet() as any).days["8"].entries).toHaveLength(2)
    await context.close()
  })

  test("CON-010 curățarea elimină doar intervalele invalide și păstrează cele valide", async ({ browser }) => {
    await seedCondicaDays({
      "8": { code: "WORK", entries: [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "13:00" }, { start: "16:00", end: "15:00" }], hours: 8 },
    })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    await page.getByRole("button", { name: "Curăță intervale" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]?.entries?.length).toBe(1)
    const next = await getCondicaTimesheet() as any
    expect(next.days["8"].entries[0]).toMatchObject({ start: "08:00", end: "12:00" })
    expect(next.days["8"].hours).toBe(4)
    await context.close()
  })
})
