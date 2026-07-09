import { expect, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

test.describe("Etapa 6 - lucrari tehnician smoke", () => {
  test.use({ storageState: STORAGE_STATE.tech })

  test("lucrari se incarca si expune lista sau empty state", async ({ appPage: page }) => {
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/lucrari(?:$|[/?#])/)
    await expect(page.locator("body")).toContainText(/Lucrări|Lucrari|Tichete|Nu există/i)
  })
})
