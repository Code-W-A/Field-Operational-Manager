import { test, expect } from "@playwright/test"

const HARNESS_URL = "/e2e/pontaj-auto-checkout"

test.describe("Pontaj — depontare automată la raport semnat", () => {
  test("cu lucrări rămase azi → depontarea este BLOCATĂ (amânată)", async ({ page }) => {
    await page.goto(HARNESS_URL)
    await expect(page.getByTestId("harness-title")).toBeVisible({ timeout: 60_000 })

    await expect(page.getByTestId("decision-remaining-work")).toHaveText("blocked")
    await expect(page.getByTestId("message-remaining-work")).toContainText(
      "mai are lucrări neterminate azi",
    )
  })

  test("la ultima lucrare a zilei → depontarea este PERMISĂ", async ({ page }) => {
    await page.goto(HARNESS_URL)
    await expect(page.getByTestId("harness-title")).toBeVisible({ timeout: 60_000 })

    await expect(page.getByTestId("decision-last-work")).toHaveText("allowed")
    await expect(page.getByTestId("message-last-work")).toContainText(
      "pontajul a fost oprit după raportul semnat",
    )
  })
})
