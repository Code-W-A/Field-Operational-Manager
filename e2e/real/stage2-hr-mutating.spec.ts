import { annotateBlocked, closeTopmostDialog, expect, test } from "./fixtures"
import { makeRunPrefix, requireMutatingEnabled, STORAGE_STATE } from "./env"

test.describe("Etapa 2 - admin HR mutating controlat", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test.beforeAll(() => {
    requireMutatingEnabled()
  })

  test("departament E2E: creare, editare, toggling status, refresh si cleanup", async ({ appPage: page }) => {
    const runPrefix = makeRunPrefix()
    const deptName = `${runPrefix} Departament`
    const editedDeptName = `${deptName} Editat`

    await page.goto("/dashboard/resurse-umane/departamente", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await page.getByLabel(/Nume/i).fill(deptName)
    await page.getByLabel(/Descriere/i).fill(`${runPrefix} creat de Playwright real DB`)
    await page.getByRole("button", { name: /Salvează/i }).click()

    await expect(page.getByText(deptName)).toBeVisible({ timeout: 20_000 })

    let deptRow = page.getByRole("row").filter({ hasText: deptName }).first()
    if (!(await deptRow.count())) {
      deptRow = page.locator("body").filter({ hasText: deptName }).first()
    }

    const editButton = deptRow.locator('button[title="Editează"], button[aria-label*="Editează"]').first()
    await expect(editButton).toBeVisible()
    await editButton.click()
    await expect(page.getByRole("dialog")).toContainText(/Editează departament|departament/i)
    await page.getByLabel(/Nume departament/i).fill(editedDeptName)
    await page.getByRole("button", { name: /Salvează/i }).click()
    await expect(page.getByText(editedDeptName)).toBeVisible({ timeout: 20_000 })

    deptRow = page.getByRole("row").filter({ hasText: editedDeptName }).first()
    const deactivateButton = deptRow.locator('button[title*="Dezactivează"], button[aria-label*="Dezactivează"]').first()
    if (await deactivateButton.count()) {
      await deactivateButton.click()
      await expect(deptRow).toContainText(/Inactiv|Dezactivat/i, { timeout: 20_000 })

      const activateButton = deptRow.locator('button[title*="Activează"], button[aria-label*="Activează"]').first()
      await expect(activateButton).toBeVisible()
      await activateButton.click()
      await expect(deptRow).toContainText(/Activ/i, { timeout: 20_000 })
    } else {
      annotateBlocked("Nu am gasit buton de activare/dezactivare pentru departamentul E2E creat.")
    }

    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(page.getByText(editedDeptName)).toBeVisible({ timeout: 20_000 })

    deptRow = page.getByRole("row").filter({ hasText: editedDeptName }).first()
    const deleteButton = deptRow.locator('button[title="Șterge"], button[aria-label*="Șterge"]').first()
    if (!(await deleteButton.count())) {
      annotateBlocked(`Cleanup manual necesar: ${editedDeptName}. Nu exista buton de stergere vizibil.`)
      return
    }

    await deleteButton.click()
    await expect(page.getByRole("dialog")).toContainText(/Confirmare ștergere|Confirmare stergere/i)
    await page.getByRole("button", { name: /^Șterge$|^Sterge$/i }).click()
    await expect(page.getByText(editedDeptName)).toHaveCount(0, { timeout: 20_000 })
  })

  test("documenteaza gap userUid la creare salariat", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/Adaugă salariat/i)
    await expect(page.getByRole("dialog")).not.toContainText(/Utilizator asociat/i)
    await closeTopmostDialog(page)
  })

  test("salariat E2E: formularul expune campurile necesare dar blocheaza asocierea userUid la creare", async ({ appPage: page }) => {
    const runPrefix = makeRunPrefix()

    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    const dialog = page.getByRole("dialog")

    await page.getByLabel(/Prenume/i).fill("E2E")
    await page.getByLabel(/^Nume/i).fill(`${runPrefix} Salariat`)
    await page.getByLabel(/Funcție|Functie|Titlu/i).fill("Test Playwright")
    await expect(dialog).toContainText(/Program|Pauză|Pauza|Departament|Manager/i)

    const hasUserAssociationControl = await dialog.getByText(/Utilizator asociat|Asociază utilizator|userUid/i).count()
    expect(hasUserAssociationControl, "La creare salariat trebuie sa existe control de asociere userUid.").toBeGreaterThan(0)
  })
})
