import { expect, test } from "@playwright/test"

import { EMPLOYEE_ID, condicaContext, openCondica, resetCondicaFixture, seedCondicaDays } from "./condica.helpers"

test.describe("Condica CSV export", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-022 exportă CSV-ul lunii afișate cu salariatul filtrat", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8 } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ])
    expect(download.suggestedFilename()).toBe("condica-2026-07.csv")
    const path = await download.path()
    const content = path ? await readFile(path, "utf8") : ""
    expect(content).toContain("Angajat")
    expect(content).toContain("Tehnician")
    await context.close()
  })
})
import { readFile } from "node:fs/promises"
