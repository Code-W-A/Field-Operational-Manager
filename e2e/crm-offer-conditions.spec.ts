import { test, expect } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style")
      style.textContent = '[data-testid="preview-mode-banner"] { display:none !important; }'
      document.head.appendChild(style)
    })
  })
  await page.route("https://firebasestorage.googleapis.com/**", (route) => route.abort())
  await page.goto("/crm/opportunities/e2e-opp-offers/offers")
})

test("new offers start with three empty commercial terms", async ({ page }) => {
  await page.getByRole("button", { name: "Ofertă nouă", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "Editor ofertă", exact: true })
  for (const label of ["Termen de plată", "Termen de livrare", "Termen de instalare"]) {
    await expect(dialog.getByRole("textbox", { name: label, exact: true })).toHaveValue("")
  }
})

test("incomplete legacy drafts remain saveable, retain custom conditions, and require all three terms before issue", async ({ page }) => {
  let issues = 0
  await page.route("**/api/crm/offers/issue", (route) => { issues++; return route.abort() })
  await page.getByTestId("offer-load-draft-e2e-offer-legacy").click()
  const dialog = page.getByRole("dialog", { name: "Editor ofertă", exact: true })
  await expect(dialog.locator("#offer-additional-conditions")).toHaveValue("Transport inclus")
  await dialog.locator("#offer-email-body").fill("Bună ziua,")
  await dialog.locator("#offer-validity").fill("30 zile")
  await dialog.getByRole("button", { name: "Salvează draft", exact: true }).click()
  await expect(page.getByText("Draft salvat", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByTestId("offer-load-draft-e2e-offer-legacy").click()
  await expect(dialog.locator("#offer-additional-conditions")).toHaveValue("Transport inclus")
  for (const [key, text] of [["payment", "100% în avans"], ["delivery", "10 zile lucrătoare"], ["installation", "Nu este inclusă"]]) {
    const input = dialog.locator(`#offer-terms-${key}`)
    await expect(input).toHaveValue("")
    await dialog.getByRole("button", { name: "Emite ofertă", exact: true }).click()
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(input).toBeFocused()
    await input.fill(text)
  }
  expect(issues).toBe(0)
  await dialog.getByRole("button", { name: "Salvează draft", exact: true }).click()
  await expect(page.getByText("Draft salvat", { exact: true }).last()).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByTestId("offer-load-draft-e2e-offer-legacy").click()
  await expect(dialog.locator("#offer-terms-payment")).toHaveValue("100% în avans")
  await expect(dialog.locator("#offer-terms-delivery")).toHaveValue("10 zile lucrătoare")
  await expect(dialog.locator("#offer-terms-installation")).toHaveValue("Nu este inclusă")
  await expect(dialog.locator("#offer-additional-conditions")).toHaveValue("Transport inclus")
})
