import { annotateBlocked, closeTopmostDialog, expect, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

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
})
