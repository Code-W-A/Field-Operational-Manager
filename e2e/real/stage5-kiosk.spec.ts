import { annotateBlocked, closeTopmostDialog, expect, test } from "./fixtures"
import { getBaseUrl, isMutatingEnabled, STORAGE_STATE } from "./env"
import {
  clearFakeNow,
  ensureAttendanceFixture,
  expectCondicaHasPontaj,
  finishKioskConfirmAndSelfie,
  localDateAt,
  localMonthKey,
  openCondicaForFixture,
  selectKioskUser,
  setFakeNow,
  setRuntimeFakeNow,
} from "./attendance-helpers"

test.describe("Etapa 5 - kiosk si pontaj", () => {
  test.use({ storageState: STORAGE_STATE.kiosk })

  test("kiosk afiseaza start/stop sau starea fara utilizatori eligibili", async ({ appPage: page }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/kiosk(?:$|[/?#])/)

    const body = page.locator("body")
    await expect(body).toContainText(/Sistem Pontaj|Nu sunt utilizatori eligibili/i)

    if (await page.getByText(/Sistem Pontaj/i).count()) {
      await expect(page.getByRole("button", { name: /Start/i })).toBeVisible()
      await expect(page.getByRole("button", { name: /Stop/i })).toBeVisible()
    }
  })

  test("kiosk start: lista utilizatori eligibili, anulare si confirmare parola fara check-in", async ({ appPage: page }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/Sistem Pontaj|Nu sunt utilizatori eligibili/i)

    if (await page.getByText(/Nu sunt utilizatori eligibili/i).count()) {
      annotateBlocked("Kiosk nu are utilizatori eligibili. Verifica hrEmployees.userUid si rolurile userilor.")
      return
    }

    await page.getByRole("button", { name: /Start/i }).click()
    await expect(page.locator("body")).toContainText(/Selectează numele tău|Selecteaza numele tau/i)
    await expect(page.getByRole("button", { name: /Anulează|Anuleaza/i })).toBeVisible()

    const userButton = page.locator("button").filter({ hasText: /@|Tehnician|Test|Mobitools|E2E/i }).first()
    if (!(await userButton.count())) {
      annotateBlocked("Lista kiosk s-a deschis, dar nu exista user selectabil cu text recognoscibil.")
      await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()
      return
    }

    await userButton.click()
    await expect(page.getByRole("dialog")).toContainText(/Confirmare parolă|Confirmare parola/i)
    await expect(page.getByRole("button", { name: /Continuă|Continua/i })).toBeDisabled()
    await closeTopmostDialog(page)
    await expect(page.locator("body")).toContainText(/Selectează numele tău|Selecteaza numele tau/i)
    await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()
  })

  test("kiosk stop: nu porneste mutatii si gestioneaza lipsa sesiunii active", async ({ appPage: page }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })

    if (await page.getByText(/Nu sunt utilizatori eligibili/i).count()) {
      annotateBlocked("Kiosk nu are utilizatori eligibili pentru fluxul Stop.")
      return
    }

    await page.getByRole("button", { name: /Stop/i }).click()
    await expect(page.locator("body")).toContainText(/Selectează numele tău|Selecteaza numele tau/i)
    await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()
    await expect(page.locator("body")).toContainText(/Sistem Pontaj/i)
  })

  test("kiosk logout: cere parola si nu deconecteaza fara confirmare", async ({ appPage: page }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })

    await page.getByRole("button", { name: /Deconectare/i }).click()
    await expect(page.getByRole("dialog")).toContainText(/Deconectare Kiosk/i)
    await expect(page.getByPlaceholder(/Parola contului Kiosk/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /Continuă|Continua/i })).toBeDisabled()
    await closeTopmostDialog(page)
  })

  test("MUTATING kiosk: stop fara sesiune, start/stop real cu selfie si verificare condica", async ({ appPage: page, browser }) => {
    test.skip(!isMutatingEnabled(), "Set E2E_RUN_MUTATING=true pentru fluxuri reale de pontaj.")

    const fixture = await ensureAttendanceFixture(browser)

    const startAt = localDateAt(8, 0)
    const stopAt = localDateAt(17, 30)
    const monthKey = localMonthKey(startAt)

    await setFakeNow(page, startAt)
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })

    if (await page.getByText(/Nu sunt utilizatori eligibili/i).count()) {
      annotateBlocked("Kiosk nu are utilizatori eligibili; verifica salariatul E2E cu userUid asociat.")
      return
    }

    // Cleanup: daca fixture-ul are deja o sesiune activa, o oprim inainte de verificarea "stop fara sesiune".
    await page.getByRole("button", { name: /Stop/i }).click()
    await selectKioskUser(page, fixture.employeeName)
    if (await page.getByText(/Nu există tură activă|Nu exista tura activa/i).count()) {
      await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()
    } else {
      await finishKioskConfirmAndSelfie(page)
      await expect(page.locator("body")).toContainText(/Succes/i, { timeout: 60_000 })
      await page.waitForTimeout(3_500)
    }

    // Edge case cerut: stop fara sesiune activa.
    await page.getByRole("button", { name: /Stop/i }).click()
    await selectKioskUser(page, fixture.employeeName)
    await expect(page.getByRole("dialog")).toContainText(/Nu există tură activă|Nu exista tura activa/i, { timeout: 20_000 })
    await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()

    // Start real.
    await setRuntimeFakeNow(page, startAt)
    await page.getByRole("button", { name: /Start/i }).click()
    await selectKioskUser(page, fixture.employeeName)
    await finishKioskConfirmAndSelfie(page)
    await page.waitForTimeout(3_500)

    // Edge case cerut: dublu start.
    await page.getByRole("button", { name: /Start/i }).click()
    await selectKioskUser(page, fixture.employeeName)
    await expect(page.getByRole("dialog")).toContainText(/Pontaj deja pornit/i, { timeout: 20_000 })
    await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()

    // Stop real, apoi sync-ul checkout-ului trebuie sa ajunga in condica.
    await setRuntimeFakeNow(page, stopAt)
    await page.getByRole("button", { name: /Stop/i }).click()
    await selectKioskUser(page, fixture.employeeName)
    await finishKioskConfirmAndSelfie(page)
    await page.waitForTimeout(5_000)
    await clearFakeNow(page)

    const adminContext = await browser.newContext({
      baseURL: getBaseUrl(),
      storageState: STORAGE_STATE.admin,
      locale: "ro-RO",
      timezoneId: "Europe/Bucharest",
    })
    try {
      const adminPage = await adminContext.newPage()
      await openCondicaForFixture(adminPage, { employeeId: fixture.employeeId, monthKey })
      await expectCondicaHasPontaj(adminPage, fixture.employeeName, /Pontaj|9\.5|9,5|h/i)
    } finally {
      await adminContext.close()
    }
  })

  test("MUTATING kiosk: locatie refuzata foloseste fallback birou sau raporteaza blocaj clar", async ({ appPage: page, browser }) => {
    test.skip(!isMutatingEnabled(), "Set E2E_RUN_MUTATING=true pentru fluxuri reale de pontaj.")

    const fixture = await ensureAttendanceFixture(browser)

    await page.context().clearPermissions()
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })
    if (await page.getByText(/Nu sunt utilizatori eligibili/i).count()) {
      annotateBlocked("Kiosk nu are utilizatori eligibili pentru test locatie refuzata.")
      return
    }

    await page.getByRole("button", { name: /Start/i }).click()
    await selectKioskUser(page, fixture.employeeName)

    if (await page.getByText(/Pontaj deja pornit/i).count()) {
      await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()
      annotateBlocked("Fixture-ul are deja sesiune activa; ruleaza testul principal de cleanup inainte.")
      return
    }

    await finishKioskConfirmAndSelfie(page)
    await expect(page.locator("body")).toContainText(/Succes|Eroare|Nu s-a putut determina locația|Nu s-a putut determina locatia/i, {
      timeout: 60_000,
    })

    if (await page.getByText(/Succes/i).count()) {
      await page.waitForTimeout(3_500)
      await page.context().grantPermissions(["geolocation", "camera"])
      await page.getByRole("button", { name: /Stop/i }).click()
      await selectKioskUser(page, fixture.employeeName)
      await finishKioskConfirmAndSelfie(page)
    }
  })

  test("MUTATING kiosk: camera refuzata blocheaza selfie obligatoriu fara start", async ({ appPage: page, browser }) => {
    test.skip(!isMutatingEnabled(), "Set E2E_RUN_MUTATING=true pentru fluxuri reale de pontaj.")

    const fixture = await ensureAttendanceFixture(browser)

    await page.context().clearPermissions()
    await page.context().grantPermissions(["geolocation"])
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })
    if (await page.getByText(/Nu sunt utilizatori eligibili/i).count()) {
      annotateBlocked("Kiosk nu are utilizatori eligibili pentru test camera refuzata.")
      return
    }

    await page.getByRole("button", { name: /Start/i }).click()
    await selectKioskUser(page, fixture.employeeName)

    if (await page.getByText(/Pontaj deja pornit/i).count()) {
      await page.getByRole("button", { name: /Anulează|Anuleaza/i }).click()
      annotateBlocked("Fixture-ul are deja sesiune activa; ruleaza testul principal de cleanup inainte.")
      return
    }

    await page.getByRole("button", { name: /Da, mă pontez|Da, ma pontez|Da, continuă|Da, continua/i }).click()
    await expect(page.getByRole("dialog")).toContainText(/Selfie pontaj/i, { timeout: 20_000 })
    await expect(page.locator("body")).toContainText(/Selfie indisponibil|Permisiune cameră refuzată|Permisiune camera refuzata|Selfie obligatoriu/i, {
      timeout: 60_000,
    })
  })
})
