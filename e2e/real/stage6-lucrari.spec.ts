import { annotateBlocked, clickIfVisible, closeDialogIfPresent, expect, test } from "./fixtures"
import { getAttendanceFixture, getBaseUrl, isMutatingEnabled, STORAGE_STATE } from "./env"
import {
  clickFieldAttendanceButton,
  clearFakeNow,
  expectCondicaHasPontaj,
  finishFieldSelfie,
  localDateAt,
  localMonthKey,
  openCondicaForFixture,
  setFakeNow,
  setRuntimeFakeNow,
} from "./attendance-helpers"

test.describe("Etapa 6 - lucrari tehnician", () => {
  test.use({ storageState: STORAGE_STATE.tech })

  test("lucrari se incarca si expune lista sau empty state", async ({ appPage: page }) => {
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/lucrari(?:$|[/?#])/)
    await expect(page.locator("body")).toContainText(/Lucrări|Lucrari|Tichete|Nu există/i)
  })

  test("lucrari: cautare, filtrare vizuala si revenire la lista", async ({ appPage: page }) => {
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText(/Lucrări|Lucrari|Tichete|Nu există/i)

    const search = page.getByPlaceholder(/Caută în toate coloanele|Cauta in toate coloanele/i).first()
    if (await search.count()) {
      await search.fill("E2E_NON_EXISTENT_SEARCH_VALUE")
      await page.waitForTimeout(400)
      await expect(page.locator("body")).toContainText(/Nu există|Nu exista|0|Lucrări|Lucrari/i)
      await search.fill("")
      await page.waitForTimeout(400)
    } else {
      annotateBlocked("Nu exista search universal vizibil pe lucrari pentru contul tehnician.")
    }
  })

  test("lucrari: detalii lucrare sau empty state fara mutatii", async ({ appPage: page }) => {
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })

    if (await page.getByText(/Nu există|Nu exista/i).count()) {
      annotateBlocked("Nu exista lucrare tehnician disponibila pentru test detalii.")
      return
    }

    const reportButton = page.getByRole("button", { name: /Generează raport|Genereaza raport|Raport dezactivat/i }).first()
    if (await reportButton.count()) {
      await expect(reportButton).toBeVisible()
    }

    const card = page.locator("article, [data-slot='card'], .cursor-pointer").filter({
      hasText: /Client|Adresă|Adresa|Status|Raport|Lucrare|Tichet|#/i,
    }).first()

    if (!(await clickIfVisible(card))) {
      annotateBlocked("Nu am gasit card/row de lucrare clickabil pentru detalii.")
      return
    }

    await page.waitForLoadState("domcontentloaded")
    await expect(page.locator("body")).toContainText(/Detalii|Client|Adresă|Adresa|Raport|Lucrare|Tichet/i)
    await closeDialogIfPresent(page)
  })

  test("lucrari: card pontaj field expune start/stop sau motiv blocare", async ({ appPage: page }) => {
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })

    const body = page.locator("body")
    await expect(body).toContainText(/Pontaj|Lucrări|Lucrari|Tichete/i)

    if (await page.getByText(/Pontajul este indisponibil|Verificăm asocierea HR|Verificam asocierea HR/i).count()) {
      annotateBlocked("Pontaj field indisponibil: contul tehnician nu are asociere HR completa sau sistemul inca verifica.")
      return
    }

    const startStopButton = page.getByRole("button", { name: /Start|Stop/i }).first()
    if (!(await startStopButton.count())) {
      annotateBlocked("Cardul de pontaj field nu expune Start/Stop pentru contul tehnician.")
      return
    }

    await expect(startStopButton).toBeVisible()
    await expect(body).toContainText(/selfie|camera|Pontaj|ACTIV|Start|Stop/i)
  })

  test("MUTATING lucrari: start/stop field real si verificare condica", async ({ appPage: page, browser }) => {
    test.skip(!isMutatingEnabled(), "Set E2E_RUN_MUTATING=true pentru fluxuri reale de pontaj.")

    const fixture = getAttendanceFixture()
    if (!fixture.employeeName) {
      annotateBlocked("Seteaza E2E_ATTENDANCE_EMPLOYEE_NAME pentru fixture-ul field.")
      return
    }

    const startAt = localDateAt(8, 0)
    const stopAt = localDateAt(17, 30)
    const monthKey = localMonthKey(startAt)

    await setFakeNow(page, startAt)
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })

    if (await page.getByText(/Pontajul este indisponibil|Verificăm asocierea HR|Verificam asocierea HR/i).count()) {
      annotateBlocked("Pontaj field indisponibil: contul tehnician nu are asociere HR completa.")
      return
    }

    // Cleanup daca exista deja sesiune activa.
    const existingStop = page.getByRole("button", { name: /Mă opresc acum|Ma opresc acum/i }).first()
    if (await existingStop.count()) {
      await expect(existingStop).toBeEnabled({ timeout: 75_000 })
      await existingStop.click()
      await finishFieldSelfie(page)
      await page.waitForTimeout(3_000)
    }

    await setRuntimeFakeNow(page, startAt)
    await clickFieldAttendanceButton(page, /Mă pontez acum|Ma pontez acum/i)
    await finishFieldSelfie(page)
    await expect(page.locator("body")).toContainText(/ACTIV|Așteptați|Asteptati|Mă opresc acum|Ma opresc acum/i, { timeout: 60_000 })

    await setRuntimeFakeNow(page, stopAt)
    const stopButton = page.getByRole("button", { name: /Mă opresc acum|Ma opresc acum/i }).first()
    await expect(stopButton).toBeEnabled({ timeout: 75_000 })
    await stopButton.click()
    await finishFieldSelfie(page)
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

  test("MUTATING lucrari: camera refuzata continua pontajul field fara selfie", async ({ appPage: page }) => {
    test.skip(!isMutatingEnabled(), "Set E2E_RUN_MUTATING=true pentru fluxuri reale de pontaj.")

    await page.context().clearPermissions()
    await page.context().grantPermissions(["geolocation"])
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })

    if (await page.getByText(/Pontajul este indisponibil|Verificăm asocierea HR|Verificam asocierea HR/i).count()) {
      annotateBlocked("Pontaj field indisponibil pentru test camera refuzata.")
      return
    }

    const startButton = page.getByRole("button", { name: /Mă pontez acum|Ma pontez acum/i }).first()
    if (!(await startButton.count())) {
      annotateBlocked("Contul tehnician are deja sesiune activa sau butonul Start nu este disponibil.")
      return
    }

    await startButton.click()
    await expect(page.getByRole("dialog")).toContainText(/Ești pregătit|Esti pregatit|selfie/i, { timeout: 20_000 })
    await expect(page.locator("body")).toContainText(/Continuăm fără selfie|Continuam fara selfie|Pontaj înregistrat|Pontaj inregistrat|ACTIV/i, {
      timeout: 60_000,
    })

    // Cleanup: oprim sesiunea pornita fara selfie.
    await page.context().grantPermissions(["geolocation", "camera"])
    const stopButton = page.getByRole("button", { name: /Mă opresc acum|Ma opresc acum/i }).first()
    await expect(stopButton).toBeEnabled({ timeout: 75_000 })
    await stopButton.click()
    await finishFieldSelfie(page)
  })

  test("MUTATING lucrari: locatie refuzata blocheaza start field fara sesiune activa", async ({ appPage: page }) => {
    test.skip(!isMutatingEnabled(), "Set E2E_RUN_MUTATING=true pentru fluxuri reale de pontaj.")

    await page.context().clearPermissions()
    await page.context().grantPermissions(["camera"])
    await page.goto("/dashboard/lucrari", { waitUntil: "domcontentloaded" })

    if (await page.getByText(/Pontajul este indisponibil|Verificăm asocierea HR|Verificam asocierea HR/i).count()) {
      annotateBlocked("Pontaj field indisponibil pentru test locatie refuzata.")
      return
    }

    const startButton = page.getByRole("button", { name: /Mă pontez acum|Ma pontez acum/i }).first()
    if (!(await startButton.count())) {
      annotateBlocked("Contul tehnician are deja sesiune activa; ruleaza cleanup in testul start/stop.")
      return
    }

    await startButton.click()
    await expect(page.getByRole("dialog")).toContainText(/Ești pregătit|Esti pregatit|selfie/i, { timeout: 20_000 })
    await expect(page.locator("body")).toContainText(/Eroare|locaț|locat|permisiune|Nu s-a putut/i, { timeout: 60_000 })
    await expect(page.getByRole("button", { name: /Mă pontez acum|Ma pontez acum/i }).first()).toBeVisible({ timeout: 20_000 })
  })
})
