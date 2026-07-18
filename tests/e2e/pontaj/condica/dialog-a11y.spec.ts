import { expect, test, type Locator, type Page } from "@playwright/test"

import {
  EMPLOYEE_ID,
  condicaContext,
  insertRequest,
  openCondica,
  resetCondicaFixture,
  seedCondicaDays,
} from "./condica.helpers"

const REQUEST_ID = "condica-a11y-co"

async function expectDialogKeyboardContract(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute("role", "dialog")
  await page.keyboard.press("Tab")
  const focused = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)
  expect(focused).toBe(true)
  await page.keyboard.press("Shift+Tab")
  const reverseFocused = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)
  expect(reverseFocused).toBe(true)
  await dialog.press("Escape")
  await expect(dialog).toHaveCount(0)
}

test.describe("Condica dialog accessibility and responsive contracts", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-021 dialogurile Condicii au nume accesibile, Escape și focus containment", async ({ browser }) => {
    await insertRequest({
      id: REQUEST_ID,
      kind: "CO",
      payload: { startDate: "2026-07-08", endDate: "2026-07-09" },
    })
    await seedCondicaDays({
      "8": {
        code: "CO",
        sourceRequestId: REQUEST_ID,
        sourceRequestKind: "CO",
        entries: [{ start: "08:00", end: "16:00", selfieStartUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" }],
      },
    })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)

    const detail = page.getByTestId("condica-day-detail")
    const openDetail = async () => {
      if (!(await detail.isVisible())) {
        await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
      }
      await expect(detail).toBeVisible()
    }
    await openDetail()
    await expect(detail.getByRole("button", { name: "Verificări pontaj" })).toBeVisible()

    await detail.getByRole("button", { name: "Verificări pontaj" }).click()
    await expectDialogKeyboardContract(page, page.getByRole("dialog", { name: "Verificări pontaj" }))

    await openDetail()
    await detail.getByTitle("Editează intervalul").click()
    await expectDialogKeyboardContract(page, page.getByRole("dialog", { name: /Editează interval/ }))

    await openDetail()
    await detail.getByRole("button", { name: "Start", exact: true }).click()
    await expectDialogKeyboardContract(page, page.getByRole("dialog", { name: /Selfie Start/ }))

    await openDetail()
    await detail.getByRole("button", { name: "Editează", exact: true }).click()
    await expectDialogKeyboardContract(page, page.getByRole("dialog", { name: "Editează cererea aprobată" }))

    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    await expectDialogKeyboardContract(page, page.getByRole("dialog", { name: "Adaugă condică" }))
    await page.getByRole("button", { name: "Șterge", exact: true }).click()
    await expectDialogKeyboardContract(page, page.getByRole("dialog", { name: "Șterge pontajul" }))
    await page.getByRole("button", { name: "Sărbători legale" }).click()
    await expectDialogKeyboardContract(page, page.getByRole("dialog", { name: /Sărbători legale/ }))
    await context.close()
  })

  test("CON-021 dialogurile Add și Delete rămân vizibile și modal pe mobil portrait/landscape", async ({ browser }) => {
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await openCondica(page)
    for (const buttonName of ["Adaugă", "Șterge"]) {
      await page.getByRole("button", { name: buttonName, exact: true }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      const portrait = await dialog.boundingBox()
      expect(portrait).not.toBeNull()
      expect((portrait?.width ?? 0) <= 390).toBe(true)
      expect((portrait?.height ?? 0) <= 844).toBe(true)
      await page.mouse.click(4, 4)
      await expect(dialog).toBeVisible()
      await dialog.press("Escape")
    }
    await page.setViewportSize({ width: 844, height: 390 })
    await page.getByRole("button", { name: "Adaugă", exact: true }).click()
    const landscape = page.getByRole("dialog", { name: "Adaugă condică" })
    await expect(landscape).toBeVisible()
    const box = await landscape.boundingBox()
    expect((box?.height ?? 0) <= 390).toBe(true)
    await landscape.press("Escape")
    await context.close()
  })
})
