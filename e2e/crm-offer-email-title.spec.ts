import { test, expect } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style")
      style.textContent = '[data-testid="preview-mode-banner"] { display:none !important; }'
      document.head.appendChild(style)
    })
  })
  await page.route("**/api/crm/offers/issue", (route) => route.abort())
  await page.route("https://firebasestorage.googleapis.com/**", (route) => route.abort())
})

for (const [id, name] of [
  ["e2e-opp-offers", "OP.E2E.001 — Barieră acces parcare"],
  ["e2e-opp-without-display-title", "OP.E2E.002 - Înlocuire rulou Equilibrium 1"],
]) {
  test(`email defaults use the full opportunity name: ${id}`, async ({ page }) => {
    await page.goto(`/crm/opportunities/${id}/offers`)
    await page.getByRole("button", { name: "Ofertă nouă", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Editor ofertă", exact: true })
    await expect(dialog.locator("#offer-email-subject")).toHaveValue(`Ofertă ${name}`)
    await expect(dialog.locator("#offer-email-body")).toHaveValue(
      `Bună ziua,\n\nVă transmitem oferta comercială pentru oportunitatea ${name} — Acme Access SRL.\n\nPuteți accepta sau refuza oferta din acest email, folosind butoanele incluse în mesaj.\n\nCu stimă,`,
    )
    await dialog.locator("#offer-email-subject").fill("Subiect personalizat")
    await dialog.locator("#offer-email-body").fill("Mesaj personalizat")
    await dialog.getByRole("button", { name: "Close", exact: true }).click()
    page.once("dialog", (confirmation) => confirmation.dismiss())
    await page.getByRole("button", { name: "Ofertă nouă", exact: true }).click()
    await expect(dialog.locator("#offer-email-subject")).toHaveValue("Subiect personalizat")
    await expect(dialog.locator("#offer-email-body")).toHaveValue("Mesaj personalizat")
    await dialog.getByRole("button", { name: "Close", exact: true }).click()
    page.once("dialog", (confirmation) => confirmation.accept())
    await page.getByRole("button", { name: "Ofertă nouă", exact: true }).click()
    await expect(dialog.locator("#offer-email-subject")).toHaveValue(`Ofertă ${name}`)
    await expect(dialog.locator("#offer-email-body")).not.toHaveValue("Mesaj personalizat")
  })
}

test("loading a saved draft preserves its subject and message", async ({ page }) => {
  await page.goto("/crm/opportunities/e2e-opp-offers/offers")
  await page.getByTestId("offer-load-draft-e2e-offer-draft").click()
  const dialog = page.getByRole("dialog", { name: "Editor ofertă", exact: true })
  await expect(dialog.locator("#offer-email-subject")).toHaveValue("Ofertă OP.E2E.001")
  await expect(dialog.locator("#offer-email-body")).toHaveValue("Bună ziua,")
  await dialog.getByRole("button", { name: "Close", exact: true }).click()
  await page.getByTestId("offer-load-draft-e2e-offer-draft").click()
  await expect(dialog.locator("#offer-email-subject")).toHaveValue("Ofertă OP.E2E.001")
  await expect(dialog.locator("#offer-email-body")).toHaveValue("Bună ziua,")
})
