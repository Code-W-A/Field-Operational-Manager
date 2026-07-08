import { expect, test } from "@playwright/test"

const HARNESS_URL = "/e2e/pontaj-human"

test.describe("Pontaj E2E test clock", () => {
  test("permite setarea, avansarea și curățarea ceasului fără a aștepta timp real", async ({ page }) => {
    await page.goto(HARNESS_URL)
    await expect(page.getByTestId("pontaj-human-title")).toBeVisible({ timeout: 60_000 })

    const startIso = "2026-03-10T08:00:00+02:00"
    const startMs = new Date(startIso).getTime()
    await page.getByTestId("e2e-clock-input").fill(startIso)
    await page.getByTestId("e2e-clock-apply").click()

    await expect(page.getByTestId("e2e-clock-now-ms")).toHaveText(String(startMs))
    await expect(page.evaluate(() => window.localStorage.getItem("e2e_fake_now"))).resolves.toBe(startIso)

    await page.getByTestId("e2e-clock-plus-8h").click()
    await expect(page.getByTestId("e2e-clock-now-ms")).toHaveText(String(startMs + 8 * 60 * 60 * 1000))

    await page.getByTestId("e2e-clock-clear").click()
    await expect(page.evaluate(() => window.localStorage.getItem("e2e_fake_now"))).resolves.toBeNull()
  })
})
