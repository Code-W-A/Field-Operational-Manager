import { test, expect, type Page } from "@playwright/test"

const OFFERS_URL = "/crm/opportunities/e2e-opp-offers/offers"

test.beforeEach(async ({ page }) => {
  // Bannerul „Mod Preview” e fixat în colț și interceptează clicurile din lista de oferte.
  await page.addInitScript(() => {
    const style = document.createElement("style")
    style.textContent = '[data-testid="preview-mode-banner"] { display: none !important; }'
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style))
  })
})

async function openOffersPage(page: Page) {
  await page.goto(OFFERS_URL)
  await expect(page.getByRole("button", { name: "Deschide editor" })).toBeEnabled({ timeout: 60_000 })
}

/** Încarcă un draft fără navigare, ca store-ul fixture din memorie să nu se reseteze. */
async function loadDraftFromList(page: Page, offerId: string) {
  await page.getByTestId(`offer-load-draft-${offerId}`).click()
  const dialog = page.getByRole("dialog", { name: "Editor ofertă" })
  await expect(dialog).toBeVisible()
  return dialog
}

async function openDraftInEditor(page: Page, offerId: string) {
  await openOffersPage(page)
  return loadDraftFromList(page, offerId)
}

/** Draftul fixture care are deja opționale salvate. */
async function openSeededDraft(page: Page) {
  return openDraftInEditor(page, "e2e-offer-draft")
}

test.describe("CRM — Opționale în editorul de ofertă", () => {
  test("editorul afișează secțiunea Opționale cu eticheta corectă de total", async ({ page }) => {
    const dialog = await openSeededDraft(page)
    const optionals = dialog.getByTestId("offer-optionals-section")

    await expect(optionals.getByRole("heading", { name: "Opționale" })).toBeVisible()
    await expect(optionals.getByText("Apar în PDF cu preț, dar nu se adaugă la totalul ofertei.")).toBeVisible()
    await expect(optionals.getByText("Total opționale (nu se adună la ofertă)")).toBeVisible()
  })

  test("opționalele salvate se reîncarcă în editor cu prețurile lor", async ({ page }) => {
    const dialog = await openSeededDraft(page)
    const optionals = dialog.getByTestId("offer-optionals-section")

    await expect(optionals.locator("#name-o1")).toHaveValue("Iluminat LED pe braț")
    await expect(optionals.locator("#price-o1")).toHaveValue("465")
    await expect(optionals.locator("#name-o2")).toHaveValue("Buclă inductivă")
    await expect(optionals.locator("#price-o2")).toHaveValue("320")
  })

  test("secțiunea Opționale apare sub tabelul de poziții și sub totaluri", async ({ page }) => {
    const dialog = await openSeededDraft(page)

    const totalsBox = await dialog.getByTestId("offer-subtotal").boundingBox()
    const optionalsBox = await dialog.getByTestId("offer-optionals-section").boundingBox()
    expect(totalsBox && optionalsBox).toBeTruthy()
    expect(optionalsBox!.y).toBeGreaterThan(totalsBox!.y)
  })

  test("opționalele nu intră în Total fără TVA și nici în Total ajustat", async ({ page }) => {
    const dialog = await openSeededDraft(page)

    // Pozițiile: 4200 + 2×400 = 5000. Opționalele însumează 1105 și nu se adună.
    await expect(dialog.getByTestId("offer-subtotal")).toHaveText("5000.00 lei")
    await expect(dialog.getByTestId("offer-total")).toHaveText("5000.00 lei")
  })

  test("adăugarea unui opțional nou lasă totalurile neschimbate", async ({ page }) => {
    const dialog = await openSeededDraft(page)
    const optionals = dialog.getByTestId("offer-optionals-section")

    await optionals.getByRole("button", { name: "Adaugă produs" }).click()
    const newRowName = optionals.locator("textarea[id^='name-']").last()
    await newRowName.fill("Senzor fotocelulă")
    const newRowPrice = optionals.locator("input[id^='price-']").last()
    await newRowPrice.fill("250")
    await newRowPrice.blur()

    await expect(dialog.getByTestId("offer-subtotal")).toHaveText("5000.00 lei")
    await expect(dialog.getByTestId("offer-total")).toHaveText("5000.00 lei")
  })

  test("control: adăugarea unei poziții facturabile modifică totalurile", async ({ page }) => {
    const dialog = await openSeededDraft(page)
    const products = dialog.getByTestId("offer-products-section")

    await products.getByRole("button", { name: "Adaugă produs" }).click()
    const newRowName = products.locator("textarea[id^='name-']").last()
    await newRowName.fill("Stâlp suport")
    const newRowPrice = products.locator("input[id^='price-']").last()
    await newRowPrice.fill("600")
    await newRowPrice.blur()

    await expect(dialog.getByTestId("offer-subtotal")).toHaveText("5600.00 lei")
  })

  test("discountul se aplică pozițiilor, nu opționalelor", async ({ page }) => {
    const dialog = await openSeededDraft(page)

    await dialog.locator("#offer-adjustment").fill("5")
    await expect(dialog.getByTestId("offer-subtotal")).toHaveText("5000.00 lei")
    await expect(dialog.getByTestId("offer-total")).toHaveText("4750.00 lei")
  })

  test("salvarea draftului păstrează opționalele la reîncărcare", async ({ page }) => {
    const dialog = await openSeededDraft(page)
    const optionals = dialog.getByTestId("offer-optionals-section")

    await optionals.getByRole("button", { name: "Adaugă produs" }).click()
    await optionals.locator("textarea[id^='name-']").last().fill("Braț articulat")
    const price = optionals.locator("input[id^='price-']").last()
    await price.fill("780")
    await price.blur()

    await dialog.getByRole("button", { name: "Salvează draft" }).click()
    await expect(page.getByText("Draft salvat", { exact: true })).toBeVisible()

    // Reîncărcăm din listă fără navigare: un page.reload() ar reseta store-ul fixture.
    await dialog.getByRole("button", { name: "Close" }).click()
    await expect(dialog).toBeHidden()
    const reopened = await loadDraftFromList(page, "e2e-offer-draft")
    const reloadedOptionals = reopened.getByTestId("offer-optionals-section")

    await expect(reloadedOptionals.locator("textarea[id^='name-']")).toHaveCount(3)
    await expect(reloadedOptionals.locator("textarea[id^='name-']").last()).toHaveValue("Braț articulat")
    await expect(reopened.getByTestId("offer-subtotal")).toHaveText("5000.00 lei")
  })

  test("oferta veche, fără opționale, se deschide cu secțiunea goală", async ({ page }) => {
    const dialog = await openDraftInEditor(page, "e2e-offer-legacy")
    const optionals = dialog.getByTestId("offer-optionals-section")

    await expect(optionals).toBeVisible()
    await expect(optionals.locator("textarea[id^='name-']")).toHaveCount(0)
    await expect(dialog.getByTestId("offer-subtotal")).toHaveText("300.00 lei")
  })

  test("cota TVA rămâne read-only, din Setări", async ({ page }) => {
    const dialog = await openSeededDraft(page)
    const vat = dialog.locator("#offer-vat")

    await expect(vat).toHaveValue("21")
    await expect(vat).toHaveAttribute("readonly", "")
  })
})
