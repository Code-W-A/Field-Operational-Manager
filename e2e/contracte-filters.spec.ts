import { test, expect } from "@playwright/test"

async function gotoContracteList(page: import("@playwright/test").Page) {
  await page.goto("/dashboard/contracte")
  await page.evaluate(() => {
    localStorage.removeItem("table-settings-contracte")
    localStorage.setItem("table-settings-contracte", JSON.stringify({ searchText: "", activeFilters: [] }))
  })
  await page.goto("/dashboard/contracte")
  await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate 5 din 5 contracte/, {
    timeout: 60_000,
  })
}

async function openFilterModal(page: import("@playwright/test").Page) {
  await page.getByTestId("contract-filter-button").click()
  await expect(page.getByRole("dialog", { name: "Filtrare contracte" })).toBeVisible()
}

async function selectEquipmentFilter(
  page: import("@playwright/test").Page,
  dialog: ReturnType<import("@playwright/test").Page["getByRole"]>,
  label: string,
) {
  await dialog.getByText("Selectează echipamente", { exact: true }).click()
  await page.locator("[data-radix-popper-content-wrapper]").getByText(label, { exact: true }).click()
}

test.describe("Contracte — filtrare E2E", () => {
  test.beforeEach(async ({ page }) => {
    await gotoContracteList(page)
  })

  test("afișează toate contractele fixture la încărcare", async ({ page }) => {
    await expect(page.getByTestId("contract-table")).toBeVisible()
    await expect(page.getByText("MNT-2026-001")).toBeVisible()
    await expect(page.getByText("MNT-2026-005")).toBeVisible()
  })

  test("filtru client + fără echipamente + search depozit → 1 contract", async ({ page }) => {
    await openFilterModal(page)
    const dialog = page.getByRole("dialog", { name: "Filtrare contracte" })

    await dialog.getByRole("checkbox", { name: "Acme SRL" }).check()
    await selectEquipmentFilter(page, dialog, "Fără echipamente")
    await dialog.getByRole("button", { name: "Aplică filtrele" }).click()

    await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate [1-5] din 5 contracte/)

    await page.getByTestId("contract-search").fill("depozit")
    await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate 1 din 5 contracte/, {
      timeout: 5_000,
    })
    await expect(page.getByText("MNT-2026-002")).toBeVisible()
    await expect(page.getByText("MNT-2026-001")).not.toBeVisible()
  })

  test("resetează tot revine la 5 contracte", async ({ page }) => {
    await page.getByTestId("contract-search").fill("gamma")
    await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate 1 din 5 contracte/, {
      timeout: 5_000,
    })

    await page.getByTestId("contract-reset-all").click()
    await expect(page.getByTestId("contract-search")).toHaveValue("")
    await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate 5 din 5 contracte/)
  })

  test("filtre fără rezultat → empty state", async ({ page }) => {
    await openFilterModal(page)
    const dialog = page.getByRole("dialog", { name: "Filtrare contracte" })

    await dialog.getByRole("checkbox", { name: "Gamma Service" }).check()
    await selectEquipmentFilter(page, dialog, "Fără echipamente")
    await dialog.getByRole("button", { name: "Aplică filtrele" }).click()

    await expect(page.getByTestId("contract-empty-filtered")).toBeVisible()
    await expect(page.getByTestId("contract-results-count")).toHaveText(/Afișate 0 din 5 contracte/)
    await expect(page.getByRole("button", { name: "Resetează filtrele și căutarea" })).toBeVisible()
  })
})
