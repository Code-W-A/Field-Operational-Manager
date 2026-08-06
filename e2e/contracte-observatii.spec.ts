import { test, expect } from "@playwright/test"

test.describe("Contracte — Observații", () => {
  test("dialogul Editează Contract afișează Observații ca ultim câmp, precompletat", async ({ page }) => {
    await page.goto("/dashboard/contracte?edit=sm-1")
    const dialog = page.getByRole("dialog", { name: "Editează Contract" })
    await expect(dialog).toBeVisible({ timeout: 60_000 })

    const observatii = dialog.locator("#editContractObservatii")
    await expect(observatii).toBeVisible()
    await expect(observatii).toHaveValue(/Acces prin poarta secundară/)
    await expect(dialog.getByText("Observații", { exact: true })).toBeVisible()

    // Câmpul e după tip/custom fields și înainte de footer (calendar / salvare)
    const textareaBox = await observatii.boundingBox()
    const footerBtn = dialog.getByTestId("contract-edit-view-calendar")
    const footerBox = await footerBtn.boundingBox()
    expect(textareaBox && footerBox).toBeTruthy()
    expect(textareaBox!.y).toBeLessThan(footerBox!.y)
  })

  test("dialogul Adaugă Contract include câmpul Observații gol", async ({ page }) => {
    await page.goto("/dashboard/contracte")
    await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate 5 din 5 contracte/, {
      timeout: 60_000,
    })

    await page.getByRole("button", { name: /Adaugă Contract/i }).click()
    const dialog = page.getByRole("dialog", { name: /Adaugă Contract/i })
    await expect(dialog).toBeVisible()

    const observatii = dialog.locator("#addContractObservatii")
    await expect(observatii).toBeVisible()
    await expect(observatii).toHaveValue("")
  })

  test("detaliu contract afișează Observații sub Informații Suplimentare", async ({ page }) => {
    await page.goto("/dashboard/contracte/sm-1")
    await expect(page.getByRole("heading", { name: "Mentenanță centrală Acme" })).toBeVisible({
      timeout: 60_000,
    })

    await expect(page.getByText("Configurare Contract", { exact: true })).toBeVisible()
    await expect(page.getByText("Informații Suplimentare", { exact: true })).toBeVisible()
    await expect(page.getByText("Abonament", { exact: true })).toBeVisible()

    const observatii = page.getByTestId("contract-observatii")
    await expect(observatii).toBeVisible()
    await expect(observatii).toContainText("Acces prin poarta secundară")
    await expect(observatii).toContainText("Verificare anuală obligatorie")

    const badge = page.getByText("Abonament", { exact: true })
    const badgeBox = await badge.boundingBox()
    const observatiiBox = await observatii.boundingBox()
    expect(badgeBox && observatiiBox).toBeTruthy()
    expect(observatiiBox!.y).toBeGreaterThan(badgeBox!.y)
  })

  test("doar observații (fără custom fields) tot afișează Informații Suplimentare", async ({ page }) => {
    await page.goto("/dashboard/contracte/sm-2")
    await expect(page.getByRole("heading", { name: "Contract provizoriu Acme" })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByText("Informații Suplimentare", { exact: true })).toBeVisible()
    await expect(page.getByTestId("contract-observatii")).toHaveText("Doar observații, fără tip contract.")
    await expect(page.getByText("Abonament", { exact: true })).toHaveCount(0)
  })

  test("contract fără observații nu afișează blocul Observații", async ({ page }) => {
    await page.goto("/dashboard/contracte/sm-5")
    await expect(page.getByRole("heading", { name: "Gamma fără recurență" })).toBeVisible({
      timeout: 60_000,
    })
    await expect(page.getByTestId("contract-observatii")).toHaveCount(0)
  })
})
