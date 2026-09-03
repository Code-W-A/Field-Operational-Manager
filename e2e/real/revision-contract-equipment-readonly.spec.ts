import { expect, expectAppShell, test } from "./fixtures"
import { STORAGE_STATE } from "./env"

const REPORTED_WORK_ID = "bV5NZJd4Jcyu6z8itnhg"

test.describe("Revizie automată — echipamentele bifate în contract", () => {
  test.use({ storageState: STORAGE_STATE.admin })

  test("READ-ONLY: ticketul raportat afișează doar echipamentul bifat", async ({ appPage: page }) => {
    await page.goto(`/dashboard/lucrari/${REPORTED_WORK_ID}`, { waitUntil: "domcontentloaded" })
    await expectAppShell(page)

    const heading = page.getByRole("heading", { name: "Echipamente în revizie" })
    await expect(heading).toBeVisible()
    await expect(page.getByText("1 / 1 completate", { exact: true })).toBeVisible()
    await expect(page.getByText("Bariera Intrare R", { exact: true })).toBeVisible()
    await expect(page.getByText("Ușă secțională Bl.1", { exact: true })).toHaveCount(0)
  })
})
