import { test, expect, type Page } from "@playwright/test"
import { mkdirSync, writeFileSync } from "node:fs"

async function openDraft(page: Page, mobile = false) {
  if (mobile) await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style")
      style.textContent = '[data-testid="preview-mode-banner"] { display:none !important; }'
      document.head.appendChild(style)
    })
  })
  // Any unexpected upload is blocked; valid-flow test replaces this with an in-memory adapter.
  await page.route("https://firebasestorage.googleapis.com/**", (route) => route.abort())
  await page.goto("/crm/opportunities/e2e-opp-offers/offers")
  await page.getByTestId("offer-load-draft-e2e-offer-draft").click()
  return page.getByRole("dialog", { name: "Editor ofertă", exact: true })
}
async function completeText(page: Page) {
  await page.locator("#offer-validity").fill("30 de zile de la emitere")
  await page.locator("#offer-comments").fill("Comentariu intern secret")
}

test("all text fields are required, whitespace is rejected, and clearing defaults is preserved", async ({ page }) => {
  let issued = 0
  await page.route("**/api/crm/offers/issue", (route) => { issued++; return route.abort() })
  const dialog = await openDraft(page)
  await completeText(page)
  for (const id of ["offer-email-subject", "offer-email-body", "offer-validity", "offer-conditions", "offer-comments", "offer-adjustment"]) {
    const input = dialog.locator(`#${id}`)
    const original = await input.inputValue()
    await input.fill("  ")
    await dialog.getByRole("button", { name: "Emite ofertă" }).click()
    await expect(input).toHaveValue("  ")
    await expect(input).toHaveAttribute("aria-invalid", "true")
    await expect(input).toBeFocused()
    await input.fill(original)
  }
  expect(issued).toBe(0)
  await dialog.locator("#offer-validity").fill("")
  await dialog.getByRole("button", { name: "Emite ofertă" }).click()
  await page.screenshot({ path: "test-results/crm-offer-validation-desktop.png", fullPage: true, animations: "disabled" })
})

test("incomplete draft retains validity and an explicitly cleared price after reloading", async ({ page }) => {
  const dialog = await openDraft(page)
  await dialog.locator("#offer-validity").fill("15 zile lucrătoare")
  await dialog.locator("#price-p1").fill("")
  await dialog.getByRole("button", { name: "Salvează draft" }).click()
  await expect(page.getByText("Draft salvat", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByTestId("offer-load-draft-e2e-offer-draft").click()
  await expect(dialog.locator("#offer-validity")).toHaveValue("15 zile lucrătoare")
  await expect(dialog.locator("#price-p1")).toHaveValue("")
  await dialog.locator("#offer-comments").fill("Intern")
  await dialog.getByRole("button", { name: "Emite ofertă" }).click()
  await expect(dialog.locator("#price-p1")).toBeFocused()
})

test("every added optional must be completed or removed; zero price remains visible", async ({ page }) => {
  const dialog = await openDraft(page)
  await completeText(page)
  const optionals = dialog.getByTestId("offer-optionals-section")
  await optionals.getByRole("button", { name: "Adaugă produs" }).click()
  const name = optionals.locator("textarea[id^='name-']").last()
  const price = optionals.locator("input[id^='price-']").last()
  await expect(price).toHaveValue("0")
  await dialog.getByRole("button", { name: "Emite ofertă" }).click()
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute("aria-invalid", "true")
  await name.fill("Senzor")
  await price.fill("")
  await price.blur()
  await expect(price).toHaveValue("")
  await dialog.getByRole("button", { name: "Emite ofertă" }).click()
  await expect(price).toBeFocused()
  await price.fill("0")
  await price.blur()
  await expect(price).toHaveValue("0")
  await expect(dialog.getByTestId("offer-total")).toHaveText("5000.00 lei")
})

test("mobile product errors open the row editor and focus the missing field", async ({ page }) => {
  const dialog = await openDraft(page, true)
  await completeText(page)
  await dialog.getByTestId("offer-products-section").getByRole("button", { name: "Editează" }).first().click()
  const rowEditor = page.getByRole("dialog", { name: "Editează produs", exact: true })
  await rowEditor.getByRole("textbox", { name: "Denumire 1", exact: true }).fill("")
  await rowEditor.getByRole("button", { name: "Salvează", exact: true }).click()
  await dialog.getByRole("button", { name: "Emite ofertă" }).click()
  await expect(rowEditor).toBeVisible()
  await expect(rowEditor.getByRole("textbox", { name: "Denumire 1", exact: true })).toBeFocused()
  await rowEditor.getByRole("textbox", { name: "Denumire 1", exact: true }).fill("Montaj")
  await rowEditor.getByRole("textbox", { name: "PU (lei) 1", exact: true }).fill("")
  await rowEditor.getByRole("button", { name: "Salvează", exact: true }).click()
  await dialog.getByRole("button", { name: "Emite ofertă" }).click()
  await expect(rowEditor.getByRole("textbox", { name: "PU (lei) 1", exact: true })).toBeFocused()
  await page.screenshot({ path: "test-results/crm-offer-validation-mobile.png", fullPage: true, animations: "disabled" })
})

test("complete offer generates a PDF and passes validity to the issue API with simulated storage and email", async ({ page }) => {
  const dialog = await openDraft(page)
  await completeText(page)
  await page.unroute("https://firebasestorage.googleapis.com/**")
  let uploads = 0
  await page.route("https://firebasestorage.googleapis.com/**", async (route) => {
    if (route.request().method() === "POST") uploads++
    const url = new URL(route.request().url())
    const bucket = url.pathname.split("/")[3]
    const name = url.searchParams.get("name") || decodeURIComponent(url.pathname.split("/o/")[1] || "test/offer.pdf")
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bucket, name, size: "1000", generation: "1", metageneration: "1", contentType: "application/pdf", downloadTokens: "simulated" }) })
  })
  let payload: any
  await page.route("**/api/crm/offers/issue", async (route) => {
    payload = route.request().postDataJSON()
    mkdirSync("test-results", { recursive: true })
    writeFileSync("test-results/crm-offer-validity-browser.pdf", Buffer.from(payload.attachmentBase64, "base64"))
    await route.fulfill({ status: 200, json: { ok: true, offerId: "simulated-offer", version: 3 } })
  })
  await dialog.getByRole("button", { name: "Emite ofertă" }).click()
  await expect(page.getByText("Ofertă emisă", { exact: true })).toBeVisible({ timeout: 30_000 })
  expect(payload.snapshot.validityText).toBe("30 de zile de la emitere")
  expect(payload.snapshot.comments).toBe("Comentariu intern secret")
  expect(payload.snapshot.total).toBe(5000)
  expect(payload.snapshot.optionalProducts).toHaveLength(2)
  expect(uploads).toBeGreaterThan(0)
  expect(Buffer.from(payload.attachmentBase64, "base64").subarray(0, 4).toString()).toBe("%PDF")
})
