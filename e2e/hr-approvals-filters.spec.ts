import { test, expect, type Page } from "@playwright/test"

import {
  E2E_HR_EMPLOYEE_DANIEL_NAME,
  E2E_HR_EMPLOYEE_MIHAI_NAME,
} from "../lib/hr/e2e-fixtures"

const PAGE_URL = "/dashboard/cereri-aprobari"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement("style")
    style.textContent = '[data-testid="preview-mode-banner"] { display: none !important; }'
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style))
  })
})

async function openApprovals(page: Page) {
  await page.goto(PAGE_URL)
  await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 3 din 6", { timeout: 60_000 })
}

async function selectFilter(page: Page, triggerId: string, optionName: string) {
  await page.locator(`#${triggerId}`).click()
  await page.getByRole("option", { name: optionName, exact: true }).click()
}

test.describe("HR — filtre Concedii și evenimente", () => {
  test("default: inbox pending, Afișate 3 din 6", async ({ page }) => {
    await openApprovals(page)

    await expect(page.locator("#hr-filter-status")).toContainText("În așteptare")
    await expect(page.getByText("#0040", { exact: true })).toBeVisible()
    await expect(page.getByText("#0039", { exact: true })).toBeVisible()
    await expect(page.getByText("#0038", { exact: true })).toBeVisible()
    await expect(page.getByText("#0037", { exact: true })).toHaveCount(0)
    await expect(page.getByText("#0036", { exact: true })).toHaveCount(0)
    await expect(page.getByText("#0035", { exact: true })).toHaveCount(0)
  })

  test("Status → Toate statusurile: Afișate 6 din 6", async ({ page }) => {
    await openApprovals(page)
    await selectFilter(page, "hr-filter-status", "Toate statusurile")

    await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 6 din 6")
    await expect(page.getByText("#0040", { exact: true })).toBeVisible()
    await expect(page.getByText("#0035", { exact: true })).toBeVisible()
  })

  test("Tip → Adăugare ore suplimentare: rămân doar overtime", async ({ page }) => {
    await openApprovals(page)
    await selectFilter(page, "hr-filter-status", "Toate statusurile")
    await selectFilter(page, "hr-filter-kind", "Adăugare ore suplimentare")

    await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 3 din 6")
    await expect(page.getByText("#0040", { exact: true })).toBeVisible()
    await expect(page.getByText("#0039", { exact: true })).toBeVisible()
    await expect(page.getByText("#0037", { exact: true })).toBeVisible()
    await expect(page.getByText("#0038", { exact: true })).toHaveCount(0)
    await expect(page.getByText("#0036", { exact: true })).toHaveCount(0)
    await expect(page.getByText("#0035", { exact: true })).toHaveCount(0)
  })

  test("Angajat → un nume îngustează lista", async ({ page }) => {
    await openApprovals(page)
    await selectFilter(page, "hr-filter-status", "Toate statusurile")
    await selectFilter(page, "hr-filter-employee", E2E_HR_EMPLOYEE_MIHAI_NAME)

    await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 3 din 6")
    await expect(page.getByText(E2E_HR_EMPLOYEE_MIHAI_NAME).first()).toBeVisible()
    await expect(page.getByText(E2E_HR_EMPLOYEE_DANIEL_NAME)).toHaveCount(0)
  })

  test("AND: overtime + angajat + În așteptare → 1", async ({ page }) => {
    await openApprovals(page)
    await selectFilter(page, "hr-filter-kind", "Adăugare ore suplimentare")
    await selectFilter(page, "hr-filter-employee", E2E_HR_EMPLOYEE_MIHAI_NAME)
    await expect(page.locator("#hr-filter-status")).toContainText("În așteptare")

    await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 1 din 6")
    await expect(page.getByText("#0040", { exact: true })).toBeVisible()
    await expect(page.getByText("#0039", { exact: true })).toHaveCount(0)
  })

  test("combinație fără rezultat → empty filtrat", async ({ page }) => {
    await openApprovals(page)
    await selectFilter(page, "hr-filter-kind", "Învoire")
    await selectFilter(page, "hr-filter-employee", E2E_HR_EMPLOYEE_DANIEL_NAME)

    await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 0 din 6")
    await expect(page.getByTestId("hr-approvals-empty-filtered")).toBeVisible()
    await expect(page.getByTestId("hr-approvals-empty-filtered")).toHaveText("Nicio cerere nu corespunde filtrelor.")
  })

  test("Resetează revine la 3 din 6", async ({ page }) => {
    await openApprovals(page)
    await selectFilter(page, "hr-filter-status", "Toate statusurile")
    await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 6 din 6")

    await page.getByRole("button", { name: "Resetează" }).click()
    await expect(page.locator("#hr-filter-status")).toContainText("În așteptare")
    await expect(page.getByTestId("hr-approvals-count")).toHaveText("Afișate 3 din 6")
    await expect(page.getByRole("button", { name: "Resetează" })).toHaveCount(0)
  })
})
