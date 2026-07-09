import { expect, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

test.describe("Etapa 4 - admin aprobari si condica smoke", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test("cereri-aprobari si condica se incarca pentru verificari ulterioare", async ({ appPage: page }) => {
    await page.goto("/dashboard/cereri-aprobari", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/cereri-aprobari(?:$|[/?#])/)
    await expect(page.locator("body")).toContainText(/Cererile primite|Concedii/i)

    await page.goto("/dashboard/resurse-umane/condica-prezenta", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/resurse-umane\/condica-prezenta(?:$|[/?#])/)
    await expect(page.locator("body")).toContainText(/Condică|Export CSV/i)
  })
})
