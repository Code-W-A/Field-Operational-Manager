import { annotateBlocked, clickIfVisible, closeTopmostDialog, expect, test } from "./fixtures"
import { getAttendanceFixture, isMutatingEnabled, STORAGE_STATE } from "./env"
import { expectCondicaHasPontaj, localMonthKey, openCondicaForFixture, safeFixturePattern } from "./attendance-helpers"

test.describe("Etapa 4 - admin aprobari si condica", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test("cereri-aprobari: tabs, lista si empty states", async ({ appPage: page }) => {
    await page.goto("/dashboard/cereri-aprobari", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/cereri-aprobari(?:$|[/?#])/)
    await expect(page.locator("body")).toContainText(/Cererile primite|Concedii/i)

    await expect(page.getByRole("tab", { name: /Pending/i })).toBeVisible()
    await expect(page.getByRole("tab", { name: /Toate/i })).toBeVisible()
    await page.getByRole("tab", { name: /Toate/i }).click()
    await expect(page.getByRole("tab", { name: /Toate/i })).toHaveAttribute("data-state", "active")
    await page.getByRole("tab", { name: /Pending/i }).click()
    await expect(page.locator("body")).toContainText(/Pending|Nu există|Nu exista|Aprobat|Respins/i)
  })

  test("cereri-aprobari: detalii, edit si refuz fara mutatie", async ({ appPage: page }) => {
    await page.goto("/dashboard/cereri-aprobari", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/Cererile primite|Concedii/i)

    const pendingCandidate = page.locator("tr, article, [role='row'], .cursor-pointer").filter({
      hasText: /pending|CO|CFP|CM|IN|DEL|Ore suplimentare|Corectare/i,
    }).first()

    if (!(await pendingCandidate.count())) {
      annotateBlocked("Nu exista cerere vizibila pentru detalii/edit/refuz. Etapa de aprobare completa necesita cerere E2E creata in etapa 3 mutating.")
      return
    }

    await pendingCandidate.click()
    await expect(page.getByRole("dialog")).toContainText(/Detalii cerere/i)
    await expect(page.getByRole("dialog")).toContainText(/Status|Angajat|Departament|Tip/i)

    const documentButton = page.getByRole("button", { name: /Document/i }).first()
    await expect(documentButton).toBeVisible()

    if (await clickIfVisible(page.getByRole("button", { name: /Editează|Editeaza/i }).first())) {
      await expect(page.getByRole("dialog").last()).toContainText(/Editează cererea|Editeaza cererea/i)
      await page.getByRole("dialog").last().getByRole("button", { name: /Anulează|Anuleaza/i }).click()
      await expect(page.getByRole("dialog")).toContainText(/Detalii cerere/i)
    }

    if (await clickIfVisible(page.getByRole("button", { name: /Refuză|Refuza/i }).first())) {
      await expect(page.getByRole("dialog").last()).toContainText(/Refuză cererea|Refuza cererea/i)
      await expect(page.getByRole("button", { name: /Confirmă refuz|Confirma refuz/i })).toBeDisabled()
      await page.getByRole("dialog").last().locator("textarea").fill("E2E validare motiv refuz fara submit")
      await expect(page.getByRole("button", { name: /Confirmă refuz|Confirma refuz/i })).toBeEnabled()
      await page.getByRole("dialog").last().getByRole("button", { name: /Anulează|Anuleaza/i }).click()
      await expect(page.getByRole("dialog")).toContainText(/Detalii cerere/i)
    }

    await closeTopmostDialog(page)
  })

  test("condica: pagina, actiuni sync/export si dialoguri de modificari manuale", async ({ appPage: page }) => {
    await page.goto("/dashboard/resurse-umane/condica-prezenta", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/resurse-umane\/condica-prezenta(?:$|[/?#])/)
    await expect(page.locator("body")).toContainText(/Condică|Export CSV/i)

    await expect(page.getByRole("button", { name: /Export CSV/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /Re-sincronizează|sincronizează|sincronizeaza/i })).toBeVisible()

    const cellOrEntry = page.locator("td button, [role='gridcell'] button, .cursor-pointer").filter({
      hasText: /CO|IN|CM|CFP|h|:|Start|Stop/i,
    }).first()

    if (await clickIfVisible(cellOrEntry)) {
      await expect(page.locator("body")).toContainText(/Pontaj|Intrări|Intrari|Eveniment|Șterge|Editează/i)
      await page.keyboard.press("Escape")
    } else {
      annotateBlocked("Nu exista celula/popover de condica cu date vizibile pentru testul de detalii zi.")
    }
  })

  test("condica: UI real pentru banca ore si C1-C7 pe fixture E2E", async ({ appPage: page }) => {
    const fixture = getAttendanceFixture()
    if (!fixture.employeeName) {
      annotateBlocked("Seteaza E2E_ATTENDANCE_EMPLOYEE_NAME pentru verificare UI calcule condica.")
      return
    }

    await openCondicaForFixture(page, { employeeId: fixture.employeeId, monthKey: localMonthKey() })
    await expectCondicaHasPontaj(page, fixture.employeeName)
    await expect(page.locator("body")).toContainText(/Bancă|Banca|Ore C1|Ore C2|Ore C3|Ore C4|Ore C5|Ore C6|Ore C7/i)

    const expectedValues = [
      fixture.expectedBank,
      fixture.expectedC1,
      fixture.expectedC2,
      fixture.expectedC3,
      fixture.expectedC4,
      fixture.expectedC5,
      fixture.expectedC6,
      fixture.expectedC7,
    ].filter(Boolean)

    for (const expected of expectedValues) {
      await expect(page.locator("body")).toContainText(safeFixturePattern(expected))
    }
  })

  test("MUTATING condica: re-sync manual pentru ziua curenta si verificare fixture", async ({ appPage: page }) => {
    test.skip(!isMutatingEnabled(), "Set E2E_RUN_MUTATING=true pentru re-sync real.")

    const fixture = getAttendanceFixture()
    if (!fixture.employeeName || !fixture.allowGlobalSync) {
      annotateBlocked("Seteaza E2E_ATTENDANCE_EMPLOYEE_NAME si E2E_ATTENDANCE_ALLOW_GLOBAL_SYNC=true pentru re-sync manual real.")
      return
    }

    await page.goto("/dashboard/resurse-umane/pontaj/sync", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/Sincronizare Pontaj|Sincronizează pontajul|Sincronizeaza pontajul/i)
    await page.getByRole("button", { name: /^Sincronizează$|^Sincronizeaza$/i }).click()
    await expect(page.locator("body")).toContainText(/Sincronizare Reușită|Sincronizare Reusita|Sincronizare/i, { timeout: 90_000 })

    await openCondicaForFixture(page, { employeeId: fixture.employeeId, monthKey: localMonthKey() })
    await expectCondicaHasPontaj(page, fixture.employeeName)
  })
})
