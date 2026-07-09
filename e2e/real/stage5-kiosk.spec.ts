import { expect, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

test.describe("Etapa 5 - kiosk read-only smoke", () => {
  test.use({ storageState: STORAGE_STATE.kiosk })

  test("kiosk afiseaza start/stop sau starea fara utilizatori eligibili", async ({ appPage: page }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/kiosk(?:$|[/?#])/)

    const body = page.locator("body")
    await expect(body).toContainText(/Sistem Pontaj|Nu sunt utilizatori eligibili/i)

    if (await page.getByText(/Sistem Pontaj/i).count()) {
      await expect(page.getByRole("button", { name: /Start/i })).toBeVisible()
      await expect(page.getByRole("button", { name: /Stop/i })).toBeVisible()
    }
  })
})
