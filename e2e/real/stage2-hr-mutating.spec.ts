import { expect, test } from "./fixtures"
import { makeRunPrefix, requireMutatingEnabled, STORAGE_STATE } from "./env"

test.describe("Etapa 2 - admin HR mutating controlat", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test.beforeAll(() => {
    requireMutatingEnabled()
  })

  test("creeaza departament E2E si verifica persistenta minima", async ({ appPage: page }) => {
    const runPrefix = makeRunPrefix()
    const deptName = `${runPrefix} Departament`

    await page.goto("/dashboard/resurse-umane/departamente", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await page.getByLabel(/Nume/i).fill(deptName)
    await page.getByLabel(/Descriere/i).fill(`${runPrefix} creat de Playwright real DB`)
    await page.getByRole("button", { name: /Salvează/i }).click()

    await expect(page.getByText(deptName)).toBeVisible({ timeout: 20_000 })
  })

  test("documenteaza gap userUid la creare salariat", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/Adaugă salariat/i)
    await expect(page.getByRole("dialog")).not.toContainText(/Utilizator asociat/i)
  })
})
