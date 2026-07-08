import { test, expect } from "@playwright/test"

const HARNESS_URL = "/e2e/pontaj-full"

test.describe("Pontaj full controlat", () => {
  test("parcurge rutele principale de pontaj în harness", async ({ page }) => {
    await page.goto(HARNESS_URL)
    await expect(page.getByTestId("pontaj-full-title")).toBeVisible({ timeout: 60_000 })

    const routes = [
      "/dashboard/resurse-umane/pontaj",
      "/dashboard/resurse-umane/pontaj/dashboard",
      "/dashboard/resurse-umane/pontaj/sync",
      "/dashboard/resurse-umane/condica-prezenta",
      "/kiosk",
    ]

    for (const route of routes) {
      await page.getByTestId(`route-${route}`).click()
      await expect(page.getByTestId("current-route")).toHaveText(route)
    }
  })

  test("check-in, check-out, sync condică și păstrează overtime/manual entries", async ({ page }) => {
    await page.goto(HARNESS_URL)
    await expect(page.getByTestId("field-state")).toHaveText("idle")

    await page.getByTestId("field-check-in").click()
    await expect(page.getByTestId("field-state")).toHaveText("active")

    await page.getByTestId("field-check-out").click()
    await expect(page.getByTestId("field-state")).toHaveText("completed")

    await page.getByTestId("manual-sync").click()
    await expect(page.getByTestId("has-pontaj-entry")).toHaveText("true")
    await expect(page.getByTestId("has-overtime-entry")).toHaveText("true")
    await expect(page.getByTestId("has-manual-entry")).toHaveText("true")
    await expect(page.getByTestId("timesheet-hours")).toHaveText("10.5")
    await expect(page.getByTestId("timesheet-entries")).toContainText("Pontaj:08:00-18:00")
    await expect(page.getByTestId("timesheet-entries")).toContainText("Ore suplimentare:16:30-18:00")
    await expect(page.getByTestId("timesheet-entries")).toContainText("Pregătire manuală:18:00-18:30")
  })

  test("reconciliere overtime confirmă orele și filtrează problemele", async ({ page }) => {
    await page.goto(HARNESS_URL)

    await page.getByTestId("field-check-in").click()
    await page.getByTestId("field-check-out").click()
    await page.getByTestId("manual-sync").click()

    await expect(page.getByTestId("reconciliation-status")).toHaveText("confirmed")
    await expect(page.getByTestId("reconciliation-found")).toHaveText("90")
    await expect(page.getByTestId("reconciliation-diff")).toHaveText("0")
    await expect(page.getByTestId("reconciliation-visible")).toHaveText("true")

    await page.getByTestId("reconciliation-filter").selectOption("problems")
    await expect(page.getByTestId("reconciliation-visible")).toHaveText("false")
  })

  test("flux kiosk start/stop actualizează starea", async ({ page }) => {
    await page.goto(HARNESS_URL)
    await expect(page.getByTestId("kiosk-state")).toHaveText("idle")

    await page.getByTestId("kiosk-start").click()
    await expect(page.getByTestId("kiosk-state")).toHaveText("active")

    await page.getByTestId("kiosk-stop").click()
    await expect(page.getByTestId("kiosk-state")).toHaveText("completed")
  })
})
