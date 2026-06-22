import { test, expect } from "@playwright/test"

/**
 * Verifică cerința: din pagina Istoric intervenții, un tichet se deschide
 * dând click direct pe linia lui (nu doar pe butonul „Vezi tichetul”).
 */
test.describe("Istoric intervenții — deschidere tichet din rând", () => {
  test("click pe rândul din tabel navighează la tichet", async ({ page }) => {
    await page.goto("/dashboard/istoric-interventii")

    // Datele fixture E2E (mockLucrari) se încarcă asincron în hook.
    const firstRow = page.locator("table tbody tr").first()
    await expect(firstRow).toBeVisible({ timeout: 60_000 })

    // Click pe rând (în zona text, nu pe butonul de acțiune) -> navigare la tichet.
    await firstRow.getByText("S Residence", { exact: false }).click()

    await expect(page).toHaveURL(/\/dashboard\/lucrari\/[^/]+$/, { timeout: 15_000 })
  })
})
