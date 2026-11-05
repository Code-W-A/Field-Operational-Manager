import { test, expect, type Locator } from "@playwright/test"

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

async function expectFresh(editor: Locator) {
  const names = editor.getByTestId("offer-products-section").locator("textarea[id^='name-']")
  await expect(names).toHaveCount(1)
  await expect(names).toHaveValue("")
  await expect(editor.getByTestId("offer-optionals-section").locator("textarea[id^='name-']")).toHaveCount(0)
  for (const id of ["offer-validity", "offer-comments", "offer-terms-payment", "offer-terms-delivery", "offer-terms-installation"]) {
    await expect(editor.locator(`#${id}`)).toHaveValue("")
  }
  await expect(editor.locator("#offer-vat")).toHaveValue("21")
  await expect(editor.locator("#offer-adjustment")).toHaveValue("0")
  await expect(editor.locator("#offer-email-subject")).toHaveValue("Ofertă OP.E2E.001 — Barieră acces parcare")
  await expect(editor.locator("#offer-email-body")).toHaveValue(/oportunitatea OP.E2E.001 — Barieră acces parcare/)
  await expect(editor.getByTestId("offer-delete-current-draft")).toHaveCount(0)
  await expect(editor.getByText("Ofertă nouă pornind de la", { exact: false })).toHaveCount(0)
}

for (const source of ["offer-load-draft-e2e-offer-draft", "offer-reuse-e2e-offer-sent"]) {
  test(`new offer clears the loaded source and saves a separate draft: ${source}`, async ({ page }) => {
    await page.getByTestId(source).click()
    const editor = page.getByRole("dialog", { name: "Editor ofertă", exact: true })
    await expect(editor.locator("#name-p1")).toHaveValue("Barieră automată 6m")
    await editor.getByRole("button", { name: "Close", exact: true }).click()
    let confirmations = 0
    page.on("dialog", async (dialog) => { confirmations++; await dialog.dismiss() })
    await page.getByRole("button", { name: "Ofertă nouă", exact: true }).click()
    await expectFresh(editor)
    expect(confirmations).toBe(0)
    await editor.getByRole("button", { name: "Salvează draft", exact: true }).click()
    await expect(page.getByText("Draft salvat", { exact: true })).toBeVisible()
    await expect(editor.getByTestId("offer-delete-current-draft")).toBeVisible()
    await editor.getByRole("button", { name: "Close", exact: true }).click()
    await expect(page.getByTestId(source)).toBeVisible()
    await expect(page.getByTestId("offer-load-draft-e2e-offer-4")).toBeVisible()
  })
}

test("failed issue retains the form; successful issue resets it before the next offer", async ({ page }) => {
  await page.getByTestId("offer-load-draft-e2e-offer-draft").click()
  const editor = page.getByRole("dialog", { name: "Editor ofertă", exact: true })
  await editor.locator("#offer-validity").fill("Valabilă 20 zile")
  await editor.locator("#offer-comments").fill("Note pentru prima ofertă")
  await page.unroute("https://firebasestorage.googleapis.com/**")
  await page.route("https://firebasestorage.googleapis.com/**", async (route) => {
    const url = new URL(route.request().url())
    const bucket = url.pathname.split("/")[3]
    const name = url.searchParams.get("name") || decodeURIComponent(url.pathname.split("/o/")[1] || "test/offer.pdf")
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ bucket, name, size: "1000", generation: "1", metageneration: "1", contentType: "application/pdf", downloadTokens: "simulated" }) })
  })
  let attempts = 0
  await page.route("**/api/crm/offers/issue", async (route) => {
    attempts++
    expect(route.request().postDataJSON().draftOfferId).toBe("e2e-offer-draft")
    await route.fulfill(attempts === 1
      ? { status: 503, json: { error: "Eroare simulată de emitere" } }
      : { status: 200, json: { ok: true, offerId: "simulated-issued-offer", version: 1 } })
  })
  await editor.getByRole("button", { name: "Emite ofertă", exact: true }).click()
  await expect(page.getByText("Eroare simulată de emitere", { exact: true })).toBeVisible()
  await expect(editor).toBeVisible()
  await expect(editor.locator("#offer-validity")).toHaveValue("Valabilă 20 zile")
  await expect(editor.locator("#offer-comments")).toHaveValue("Note pentru prima ofertă")
  await expect(editor.locator("#name-p1")).toHaveValue("Barieră automată 6m")
  await editor.getByRole("button", { name: "Emite ofertă", exact: true }).click()
  await expect(page.getByText("Ofertă emisă", { exact: true })).toBeVisible()
  await expect(editor).not.toBeVisible()
  let confirmations = 0
  page.on("dialog", async (dialog) => { confirmations++; await dialog.dismiss() })
  await page.getByRole("button", { name: "Ofertă nouă", exact: true }).click()
  await expectFresh(editor)
  expect(confirmations).toBe(0)
  await editor.getByRole("button", { name: "Salvează draft", exact: true }).click()
  await expect(page.getByText("Draft salvat", { exact: true })).toBeVisible()
  await editor.getByRole("button", { name: "Close", exact: true }).click()
  await expect(page.getByTestId("offer-load-draft-e2e-offer-4")).toBeVisible()
  expect(attempts).toBe(2)
})
