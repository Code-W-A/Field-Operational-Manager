import {
  annotateBlocked,
  clickIfVisible,
  closeDialogIfPresent,
  closeTopmostDialog,
  expect,
  expectAppShell,
  test,
  toggleCheckboxNearText,
} from "./fixtures"
import { STORAGE_STATE } from "./env"

test.describe("Etapa 1 - admin HR read-only si dialog inventory", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test("salariati: lista, dialog adaugare si validare fara salvare", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.getByRole("heading", { name: /Salariați/i })).toBeVisible()
    await expect(page.locator("body")).toContainText(/Caută|Filtrează|Adaugă/i)

    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/Adaugă salariat/i)
    await expect(page.getByLabel(/Prenume/i)).toBeVisible()
    await expect(page.getByLabel(/^Nume/i)).toBeVisible()
    await expect(page.getByLabel(/Funcție|Functie|Titlu/i)).toBeVisible()
    await expect(page.getByLabel(/Program.*start|Început program|Start/i).first()).toBeVisible()
    await expect(page.getByLabel(/Program.*end|Sfârșit program|End/i).first()).toBeVisible()
    await page.getByRole("button", { name: /Salvează/i }).click()
    await expect(page.locator("body")).toContainText(/Numele și prenumele sunt obligatorii/i)
    await closeTopmostDialog(page)
  })

  test("salariati: program standard normalizeaza ore si alertul global nu se executa accidental", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    await page.getByLabel(/Program start/i).fill("8")
    await page.getByLabel(/Program start/i).blur()
    await expect(page.getByLabel(/Program start/i)).toHaveValue("08:00")

    await page.getByLabel(/Pauză start|Pauza start/i).fill("12")
    await page.getByLabel(/Pauză start|Pauza start/i).blur()
    await expect(page.getByLabel(/Pauză start|Pauza start/i)).toHaveValue("12:00")

    await page.getByRole("button", { name: /^Salvează$|^Salveaza$/i }).click()
    await expect(page.getByRole("alertdialog")).toContainText(/Aplicăm programul la toți salariații|Aplicam programul la toti salariatii/i)
    await expect(page.getByRole("button", { name: /Doar program standard/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Aplică tuturor salariaților|Aplica tuturor salariatilor/i })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByRole("alertdialog")).toHaveCount(0)
  })

  test("salariati: dialog adaugare acopera switch activ, poza si checkbox departament", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    await page.getByRole("button", { name: /Adaugă|Adauga/i }).first().click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(/Status activ|Poză profil|Poza profil|Departamente/i)
    await expect(dialog.locator('input[type="file"]')).toBeVisible()

    const activeSwitch = dialog.getByRole("switch").first()
    await expect(activeSwitch).toBeVisible()
    await activeSwitch.click()
    await activeSwitch.click()

    const firstDepartmentCheckbox = dialog.getByRole("checkbox").first()
    if (await firstDepartmentCheckbox.count()) {
      await firstDepartmentCheckbox.click()
      await expect(dialog).toContainText(/Șef ierarhic pe departament|Sef ierarhic pe departament|Departament:/i)
      await firstDepartmentCheckbox.click()
    } else {
      annotateBlocked("Nu exista departament activ in dialogul salariat pentru test checkbox departament.")
    }

    await closeTopmostDialog(page)
  })

  test("salariati: cautare si dialog editare nu modifica date", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    const search = page.getByPlaceholder(/Caută|Cauta|Search/i).first()
    if (await search.count()) {
      await search.fill("E2E_NON_EXISTENT_SEARCH_VALUE")
      await expect(page.locator("body")).toContainText(/Nu există|Niciun|0 rezultate|Adaugă/i)
      await search.fill("")
    }

    const editButton = page.locator('button[title*="Editează"], button[aria-label*="Editează"]').first()
    if (!(await clickIfVisible(editButton))) {
      annotateBlocked("Nu exista salariat editabil vizibil in lista pentru inventar dialog editare.")
      return
    }

    await expect(page.getByRole("dialog")).toContainText(/Editează salariat|Salariat/i)
    await expect(page.getByRole("dialog")).toContainText(/Prenume|Nume|Program/i)
    await closeTopmostDialog(page)
  })

  test("profil salariat: taburi si card asociere utilizator", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati/emp_822f426c1f484a599e0dd46e68dd733a", {
      waitUntil: "domcontentloaded",
    })
    await expectAppShell(page)
    await expect(page.locator("body")).toContainText(/Fișa salariat|Salariat inexistent/i)

    if (await page.getByText(/Salariat inexistent/i).count()) {
      annotateBlocked("Fixture employee emp_822f426c1f484a599e0dd46e68dd733a nu exista in mediul remote.")
      return
    }

    await expect(page.locator("body")).toContainText(/Asociere utilizator/i)
    await expect(page.getByRole("tab", { name: /Detalii/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Pontaj/i })).toBeVisible()

    const tabNames = [/Cereri/i, /Documente|Poze|Profil/i]
    for (const tabName of tabNames) {
      const tab = page.getByRole("tab", { name: tabName })
      if (await tab.count()) {
        await tab.first().click()
        await expect(tab.first()).toHaveAttribute("data-state", "active")
      }
    }

    const associateButton = page.getByRole("button", { name: /Asociază|Schimbă|Dezasociază|Utilizator/i }).first()
    if (await associateButton.count()) {
      await associateButton.click()
      await expect(page.getByRole("dialog")).toContainText(/utilizator|asociere|dezasociere/i)
      await closeTopmostDialog(page)
    }
  })

  test("profil salariat: cerere concediu din tab concedii valideaza tipurile si campurile", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/salariati/emp_822f426c1f484a599e0dd46e68dd733a", {
      waitUntil: "domcontentloaded",
    })
    await expectAppShell(page)

    if (await page.getByText(/Salariat inexistent/i).count()) {
      annotateBlocked("Fixture employee emp_822f426c1f484a599e0dd46e68dd733a nu exista pentru dialog cerere concediu.")
      return
    }

    await page.getByRole("tab", { name: /Concedii/i }).click()
    await expect(page.locator("body")).toContainText(/Gestiune concedii|Istoric cereri concediu/i)
    await page.getByRole("button", { name: /Cerere nouă|Cerere noua/i }).click()

    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(/Cerere nouă de concediu|Cerere noua de concediu/i)
    await expect(dialog).toContainText(/Zile disponibile|Zile solicitate|Zile rămase|Zile ramase/i)
    await expect(dialog.getByRole("button", { name: /Creează cerere|Creeaza cerere/i })).toBeDisabled()

    const comboboxes = dialog.getByRole("combobox")
    await comboboxes.nth((await comboboxes.count()) - 1).click()
    await expect(page.getByRole("option", { name: /Concediu de odihnă|Concediu de odihna/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Concediu fără plată|Concediu fara plata/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Concediu medical/i })).toBeVisible()
    await expect(page.getByRole("option", { name: /Delegație|Delegatie/i })).toBeVisible()
    await page.getByRole("option", { name: /Concediu medical/i }).click()
    await expect(dialog).toContainText(/document medical|Atașează|Ataseaza/i)

    await comboboxes.nth((await comboboxes.count()) - 1).click()
    await page.getByRole("option", { name: /Delegație|Delegatie/i }).click()
    await expect(dialog).toContainText(/Nume client/i)
    await closeTopmostDialog(page)
  })

  test("departamente: dialog creare si validare nume fara salvare", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/departamente", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.getByRole("heading", { name: /Departamente/i })).toBeVisible()

    await page.getByRole("button", { name: /Adaugă/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/departament/i)
    await expect(page.getByLabel(/Nume departament/i)).toBeVisible()
    await expect(page.getByLabel(/Descriere/i)).toBeVisible()
    await expect(page.getByRole("dialog")).toContainText(/Șef departament|Sef departament|Status activ/i)
    await page.getByRole("button", { name: /Salvează/i }).click()
    await expect(page.locator("body")).toContainText(/numele departamentului|Completează/i)
    await closeTopmostDialog(page)
  })

  test("departamente: edit/delete dialog inventory fara confirmare", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/departamente", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    const editButton = page.locator('button[title="Editează"], button[aria-label*="Editează"]').first()
    if (await clickIfVisible(editButton)) {
      await expect(page.getByRole("dialog")).toContainText(/Editează departament|departament/i)
      await expect(page.getByLabel(/Nume departament/i)).toBeVisible()
      await closeTopmostDialog(page)
    } else {
      annotateBlocked("Nu exista departament editabil vizibil.")
    }

    const deleteButton = page.locator('button[title="Șterge"], button[aria-label*="Șterge"]').first()
    if (await clickIfVisible(deleteButton)) {
      await expect(page.getByRole("dialog")).toContainText(/Confirmare ștergere|Confirmare stergere/i)
      await expect(page.getByRole("button", { name: /^Șterge$|^Sterge$/i })).toBeVisible()
      await closeTopmostDialog(page)
    }
  })

  test("condica: pagina si dialoguri principale se pot deschide fara mutatii", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/condica-prezenta", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.locator("body")).toContainText(/Condică|Export CSV/i)

    const exportButton = page.getByRole("button", { name: /Export CSV/i })
    await expect(exportButton).toBeVisible()

    await clickIfVisible(page.getByRole("button", { name: /Vezi legendă|Vezi legenda/i }))
    if (await page.getByRole("dialog").count()) {
      await expect(page.getByRole("dialog")).toContainText(/Legendă|Legenda|Pontaj/i)
      await closeTopmostDialog(page)
    }

    await clickIfVisible(page.getByRole("button", { name: /Grid|Listă|Lista/i }).first())
    await clickIfVisible(page.getByRole("button", { name: /Compact|Detaliat/i }).first())

    const holidaysButton = page.getByRole("button", { name: /Sărbători|Sarbatori/i })
    if (await holidaysButton.count()) {
      await holidaysButton.first().click()
      await expect(page.getByRole("dialog")).toContainText(/Sărbători|Sarbatori/i)
      await closeTopmostDialog(page)
    }

    await page.getByRole("button", { name: /Adaugă|Adauga/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/Adaugă condică|Adauga condica/i)
    await expect(page.getByRole("dialog")).toContainText(/Angajați|Angajati|Data de început|Data de incepere/i)
    await page.getByRole("button", { name: /Adaugă condică|Adauga condica/i }).click()
    await page.waitForTimeout(250)
    await closeDialogIfPresent(page)

    await page.getByRole("button", { name: /^Șterge$|^Sterge$/i }).first().click()
    await expect(page.getByRole("dialog")).toContainText(/Șterge pontajul|Sterge pontajul/i)
    await expect(page.getByRole("dialog")).toContainText(/Angajați|Angajati|Data de începere|Data de incepere/i)
    await closeTopmostDialog(page)
  })

  test("condica: dialog adaugare acopera intervale, pauze si checkbox-uri de includere", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/condica-prezenta", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    await page.getByRole("button", { name: /Adaugă|Adauga/i }).first().click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(/Adaugă condică|Adauga condica/i)

    await expect(dialog.getByRole("button", { name: /Adaugă interval de lucru|Adauga interval de lucru/i })).toBeVisible()
    await dialog.getByRole("button", { name: /Adaugă interval de lucru|Adauga interval de lucru/i }).click()
    await expect(dialog.getByRole("button", { name: /Șterge interval|Sterge interval/i }).last()).toBeEnabled()

    await dialog.getByRole("button", { name: /Adaugă pauză|Adauga pauza/i }).click()
    await expect(dialog.getByRole("button", { name: /Șterge pauză|Sterge pauza/i }).last()).toBeEnabled()

    await toggleCheckboxNearText(dialog, /Traseu la client/i)
    await toggleCheckboxNearText(dialog, /zilele cu concediu/i)
    await toggleCheckboxNearText(dialog, /zilele cu evenimente/i)
    await toggleCheckboxNearText(dialog, /zilele libere legale/i)
    await toggleCheckboxNearText(dialog, /weekend/i)

    await closeTopmostDialog(page)
  })

  test("condica: dialog stergere acopera checkbox-uri timp/pauza si submit blocat", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/condica-prezenta", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    await page.getByRole("button", { name: /^Șterge$|^Sterge$/i }).first().click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(/Șterge pontajul|Sterge pontajul/i)

    const entriesCheckbox = await toggleCheckboxNearText(dialog, /timp înregistrat|timp inregistrat/i)
    await expect(entriesCheckbox).toBeVisible()
    const breaksCheckbox = await toggleCheckboxNearText(dialog, /pauză înregistrată|pauza inregistrata/i)
    await expect(breaksCheckbox).toBeVisible()
    await expect(dialog.getByRole("button", { name: /Șterge pontajul|Sterge pontajul/i })).toBeDisabled()

    await closeTopmostDialog(page)
  })

  test("condica: sarbatori legale expune add/list/delete draft fara salvare", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/condica-prezenta", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    await page.getByRole("button", { name: /Sărbători legale|Sarbatori legale/i }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toContainText(/Sărbători legale|Sarbatori legale/i)
    await expect(dialog).toContainText(/Data|Denumire|Lista/i)
    await expect(dialog.getByPlaceholder(/Anul Nou|Denumire/i).first()).toBeVisible()
    await expect(dialog.getByRole("button", { name: /Adaugă|Adauga/i })).toBeVisible()

    const deleteDraftButton = dialog.locator('button[title="Șterge"], button[title="Sterge"]').first()
    if (await deleteDraftButton.count()) {
      await expect(deleteDraftButton).toBeVisible()
    }

    await closeTopmostDialog(page)
  })

  test("rapoarte: tab pontaj si overtime", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/rapoarte", { waitUntil: "domcontentloaded" })
    await expectAppShell(page)
    await expect(page.getByRole("heading", { name: /Rapoarte HR/i })).toBeVisible()

    await expect(page.getByRole("tab", { name: /Pontaj HR/i })).toBeVisible()
    await expect(page.locator("body")).toContainText(/Luna|Departament|Export|Raport/i)
    await page.getByRole("tab", { name: /Ore Suplimentare/i }).click()
    await expect(page.getByRole("tab", { name: /Ore Suplimentare/i })).toHaveAttribute("data-state", "active")
    await expect(page.locator("body")).toContainText(/Ore suplimentare|overtime|Export|Nu există/i)
  })
})
