import { expect, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

test.describe("Etapa 3 - tehnician cereri", () => {
  test.use({ storageState: STORAGE_STATE.tech })

  test("pagina cereri se incarca si dialogul cerere noua expune tipurile principale", async ({ appPage: page }) => {
    await page.goto("/dashboard/cereri", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/Cererile mele/i)

    const createButton = page.getByRole("button", { name: /Cerere/i }).first()
    await expect(createButton).toBeVisible()
    await createButton.click()

    if (await page.getByText(/Contul tău nu este asociat|nu este asociat cu un salariat/i).count()) {
      test.info().annotations.push({
        type: "blocked",
        description: "Contul tehnician nu are hrEmployees.userUid asociat; cererile mutating necesita fix/date dedicate.",
      })
      return
    }

    await expect(page.getByRole("dialog")).toContainText(/Cerere nouă/i)
    await page.getByRole("combobox").filter({ hasText: /Concediu|CO|Odihnă|Odihna/i }).first().click()
    await expect(page.getByRole("option", { name: /Concediu/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Învoire|Invoire/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Ore suplimentare/i })).toBeVisible()
  })
})
