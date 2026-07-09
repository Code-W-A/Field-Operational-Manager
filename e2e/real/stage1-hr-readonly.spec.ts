import { closeTopmostDialog, expect, expectAppShell, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

test.describe("Etapa 1 - admin HR read-only si dialog inventory", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test("salariati: lista, dialog adaugare si validare fara salvare", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.getByRole("heading", { name: /Salariați/i })).toBeVisible()

    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/Adaugă salariat/i)
    await page.getByRole("button", { name: /Salvează/i }).click()
    await expect(page.locator("body")).toContainText(/Numele și prenumele sunt obligatorii/i)
    await closeTopmostDialog(page)
  })

  test("profil salariat: taburi si card asociere utilizator", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati/emp_822f426c1f484a599e0dd46e68dd733a", {
      waitUntil: "domcontentloaded",
    })
    await expectAppShell(page)
    await expect(page.locator("body")).toContainText(/Fișa salariat|Salariat inexistent/i)

    if (await page.getByText(/Salariat inexistent/i).count()) {
      test.info().annotations.push({
        type: "blocked",
        description: "Fixture employee emp_822f426c1f484a599e0dd46e68dd733a nu exista in mediul remote.",
      })
      return
    }

    await expect(page.locator("body")).toContainText(/Asociere utilizator/i)
    await expect(page.getByRole("tab", { name: /Detalii/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Pontaj/i })).toBeVisible()
  })

  test("departamente: dialog creare si validare nume fara salvare", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/departamente", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.getByRole("heading", { name: /Departamente/i })).toBeVisible()

    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/departament/i)
    await page.getByRole("button", { name: /Salvează/i }).click()
    await expect(page.locator("body")).toContainText(/numele departamentului|Completează/i)
    await closeTopmostDialog(page)
  })

  test("condica: pagina si dialoguri principale se pot deschide fara mutatii", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/condica-prezenta", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.locator("body")).toContainText(/Condică|Export CSV/i)

    const exportButton = page.getByRole("button", { name: /Export CSV/i })
    await expect(exportButton).toBeVisible()

    const holidaysButton = page.getByRole("button", { name: /Sărbători|Sarbatori/i })
    if (await holidaysButton.count()) {
      await holidaysButton.first().click()
      await expect(page.getByRole("dialog")).toContainText(/Sărbători|Sarbatori/i)
      await closeTopmostDialog(page)
    }
  })

  test("rapoarte: tab pontaj si overtime", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/rapoarte", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.getByRole("heading", { name: /Rapoarte HR/i })).toBeVisible()

    await expect(page.getByRole("tab", { name: /Pontaj HR/i })).toBeVisible()
    await page.getByRole("tab", { name: /Ore Suplimentare/i }).click()
    await expect(page.getByRole("tab", { name: /Ore Suplimentare/i })).toHaveAttribute("data-state", "active")
  })
})
