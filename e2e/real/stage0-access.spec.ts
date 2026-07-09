import { expect, expectAppShell, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

const adminPages = [
  "/dashboard/resurse-umane/salariati",
  "/dashboard/resurse-umane/salariati/emp_822f426c1f484a599e0dd46e68dd733a",
  "/dashboard/resurse-umane/departamente",
  "/dashboard/resurse-umane/condica-prezenta",
  "/dashboard/cereri-aprobari",
  "/dashboard/resurse-umane/rapoarte",
]

test.describe("Etapa 0 - remote auth si acces admin", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  for (const url of adminPages) {
    test(`admin incarca ${url}`, async ({ appPage: page }) => {
      await page.goto(url, { waitUntil: "domcontentloaded" })
      await expect(page).toHaveURL(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      await expectAppShell(page)
    })
  }
})

test.describe("Etapa 0 - remote auth si acces tehnician", () => {
  test.use({ storageState: STORAGE_STATE.tech })

  for (const url of ["/dashboard/cereri", "/dashboard/lucrari"]) {
    test(`tehnician incarca ${url}`, async ({ appPage: page }) => {
      await page.goto(url, { waitUntil: "domcontentloaded" })
      await expect(page).toHaveURL(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
      await expectAppShell(page)
    })
  }
})

test.describe("Etapa 0 - remote auth si acces kiosk", () => {
  test.use({ storageState: STORAGE_STATE.kiosk })

  test("kiosk incarca /kiosk", async ({ appPage: page }) => {
    await page.goto("/kiosk", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/kiosk(?:$|[/?#])/)
    await expectAppShell(page)
    await expect(page.locator("body")).toContainText(/Sistem Pontaj|Nu sunt utilizatori eligibili/i)
  })
})
