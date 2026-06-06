import { test, expect } from "@playwright/test"

async function openEditDialog(page: import("@playwright/test").Page, contractId: string) {
  await page.goto(`/dashboard/contracte?edit=${contractId}`)
  await expect(page.getByRole("dialog", { name: "Editează Contract" })).toBeVisible({
    timeout: 60_000,
  })
}

test.describe("Contracte — calendar revizii din edit", () => {
  test("deschide calendar filtrat pe contract din dialogul de editare", async ({ page }) => {
    await openEditDialog(page, "sm-1")

    await page.getByTestId("contract-edit-view-calendar").click()

    await expect(page.getByRole("dialog", { name: "Editează Contract" })).not.toBeVisible()
    await expect(page.getByText("Calendar — Mentenanță centrală Acme")).toBeVisible()
    await expect(page.getByTestId("contract-calendar-clear-filter")).toBeVisible()
    await expect(page.getByText("Nu există revizii programate")).not.toBeVisible()
  })

  test("elimină filtrul contract → revine la toate reviziile", async ({ page }) => {
    await openEditDialog(page, "sm-1")
    await page.getByTestId("contract-edit-view-calendar").click()
    await expect(page.getByTestId("contract-calendar-clear-filter")).toBeVisible()

    await page.getByTestId("contract-calendar-clear-filter").click()
    await expect(page.getByText("Calendar — Mentenanță centrală Acme")).not.toBeVisible()
    await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible()
  })

  test("contract fără recurență → toast calendar indisponibil", async ({ page }) => {
    await openEditDialog(page, "sm-5")

    await page.getByTestId("contract-edit-view-calendar").click()
    await expect(page.getByText("Calendar indisponibil")).toBeVisible()
    await expect(page.getByRole("dialog", { name: "Editează Contract" })).toBeVisible()
  })

  test("înapoi la listă resetează filtrul calendar", async ({ page }) => {
    await openEditDialog(page, "sm-1")
    await page.getByTestId("contract-edit-view-calendar").click()
    await expect(page.getByTestId("contract-calendar-clear-filter")).toBeVisible()

    await page.getByTestId("contract-calendar-back-to-list").click()
    await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate 5 din 5 contracte/)

    await page.getByRole("button", { name: "Calendar revizii" }).click()
    await expect(page.getByTestId("contract-calendar-clear-filter")).not.toBeVisible()
    await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible()
  })
})
