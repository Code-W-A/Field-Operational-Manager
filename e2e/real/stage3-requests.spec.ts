import {
  annotateBlocked,
  closeTopmostDialog,
  expect,
  expectButtonDisabled,
  openLastComboboxOption,
  test,
} from "./fixtures"
import { STORAGE_STATE } from "./env"

test.describe("Etapa 3 - tehnician cereri", () => {
  test.use({ storageState: STORAGE_STATE.tech })

  async function openCreateRequestDialog(page: import("@playwright/test").Page) {
    await page.goto("/dashboard/cereri", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/Cererile mele/i)

    const createButton = page.getByRole("button", { name: /Cerere/i }).first()
    await expect(createButton).toBeVisible()
    await createButton.click()

    if (await page.getByText(/Contul tău nu este asociat|nu este asociat cu un salariat/i).count()) {
      annotateBlocked("Contul tehnician nu are hrEmployees.userUid asociat; cererile necesita fix/date dedicate.")
      return false
    }

    await expect(page.getByRole("dialog")).toContainText(/Cerere nouă/i)
    return true
  }

  test("pagina cereri: dialog cerere noua expune toate tipurile principale", async ({ appPage: page }) => {
    if (!(await openCreateRequestDialog(page))) return

    const dialog = page.getByRole("dialog")
    const comboboxes = dialog.getByRole("combobox")
    await comboboxes.nth((await comboboxes.count()) - 1).click()

    await expect(page.getByRole("option", { name: /Concediu de odihnă|Concediu de odihna/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Concediu fără plată|Concediu fara plata/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Concediu medical/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Învoire|Invoire/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Delegație|Delegatie/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Corectare ore|Corecție pontaj|Corectie pontaj/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Ore suplimentare/i })).toBeVisible()
    await page.keyboard.press("Escape")
    await closeTopmostDialog(page)
  })

  test("cereri: CO/CFP/CM/DEL expun campurile si blocheaza submit incomplet", async ({ appPage: page }) => {
    const variants: Array<{ option: RegExp; expected: RegExp }> = [
      { option: /Concediu de odihnă|Concediu de odihna/i, expected: /De la|Până la|Pana la/i },
      { option: /Concediu fără plată|Concediu fara plata/i, expected: /De la|Până la|Pana la/i },
      { option: /Concediu medical/i, expected: /document medical|Atașează|Ataseaza/i },
      { option: /Delegație|Delegatie/i, expected: /Nume client|delegație|delegatie/i },
    ]

    for (const variant of variants) {
      if (!(await openCreateRequestDialog(page))) return
      await openLastComboboxOption(page, variant.option)
      await expect(page.getByRole("dialog")).toContainText(variant.expected)
      await expectButtonDisabled(page, /Trimite cererea/i)
      await closeTopmostDialog(page)
    }
  })

  test("cereri: IN, corectare pontaj si overtime expun validarile specifice", async ({ appPage: page }) => {
    const variants: Array<{ option: RegExp; expected: RegExp }> = [
      { option: /Învoire|Invoire/i, expected: /Data|Ora start|Ora end/i },
      { option: /Corectare ore|Corecție pontaj|Corectie pontaj/i, expected: /Intervale de lucru|Adaugă interval|Adauga interval|Pauze/i },
      { option: /Ore suplimentare/i, expected: /Durată ore suplimentare|Durata ore suplimentare/i },
    ]

    for (const variant of variants) {
      if (!(await openCreateRequestDialog(page))) return
      await openLastComboboxOption(page, variant.option)
      await expect(page.getByRole("dialog")).toContainText(variant.expected)
      await expectButtonDisabled(page, /Trimite cererea/i)
      await closeTopmostDialog(page)
    }
  })

  test("cereri: corectare pontaj permite intervale/pauze dinamice fara submit", async ({ appPage: page }) => {
    if (!(await openCreateRequestDialog(page))) return
    await openLastComboboxOption(page, /Corectare ore|Corecție pontaj|Corectie pontaj/i)

    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(/Intervale de lucru|Pauze/i)
    await expect(dialog.getByRole("button", { name: /Șterge interval|Sterge interval/i }).first()).toBeDisabled()

    await dialog.getByRole("button", { name: /Adaugă interval|Adauga interval/i }).click()
    await expect(dialog.getByRole("button", { name: /Șterge interval|Sterge interval/i }).last()).toBeEnabled()

    await dialog.getByRole("button", { name: /Adaugă pauză|Adauga pauza/i }).click()
    await expect(dialog.getByRole("button", { name: /Șterge pauză|Sterge pauza/i }).last()).toBeEnabled()
    await expectButtonDisabled(page, /Trimite cererea/i)
    await closeTopmostDialog(page)
  })

  test("cereri: overtime expune granularitate ore/minute si preview durata", async ({ appPage: page }) => {
    if (!(await openCreateRequestDialog(page))) return
    await openLastComboboxOption(page, /Ore suplimentare/i)

    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(/Durată ore suplimentare|Durata ore suplimentare|Durată totală|Durata totala/i)
    await expect(dialog.getByText(/^Ore$/i)).toBeVisible()
    await expect(dialog.getByText(/^Minute$/i)).toBeVisible()

    const durationComboboxes = dialog.getByRole("combobox")
    const count = await durationComboboxes.count()
    expect(count).toBeGreaterThanOrEqual(3)
    await durationComboboxes.nth(count - 1).click()
    await expect(page.getByRole("option", { name: /^00$/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /^30$/i })).toBeVisible()
    await page.keyboard.press("Escape")
    await closeTopmostDialog(page)
  })

  test("cereri: lista, filtre/tabs si detalii cerere existenta daca exista fixture", async ({ appPage: page }) => {
    await page.goto("/dashboard/cereri", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/Cererile mele/i)
    await expect(page.locator("body")).toContainText(/Pending|În așteptare|In asteptare|Aprobate|Aprobat|Respins|Toate|Nu există|Nu ai cereri/i)

    const existingCardOrRow = page.locator("tr, article, [role='row'], .cursor-pointer").filter({
      hasText: /CO|CFP|CM|IN|DEL|Ore suplimentare|Adăugare ore suplimentare|Adaugare ore suplimentare|Pending|În așteptare|In asteptare|Aprobat|Respins|Concediu|Delegație|Delegatie/i,
    }).first()

    if (!(await existingCardOrRow.count())) {
      annotateBlocked("Nu exista cerere tehnician vizibila pentru test de detalii/descarcare document.")
      return
    }

    await existingCardOrRow.click()
    await expect(page.getByRole("dialog")).toContainText(/Detalii|Cerere|Status|Aprobat|Pending|În așteptare|In asteptare|Respins/i)
    await closeTopmostDialog(page)
  })
})
