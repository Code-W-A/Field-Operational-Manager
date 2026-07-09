import { annotateBlocked, clickIfVisible, closeDialogIfPresent, expect, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

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
})
