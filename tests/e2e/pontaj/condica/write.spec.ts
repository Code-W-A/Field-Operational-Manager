import { expect, test } from "@playwright/test"

import {
  EMPLOYEE_ID,
  condicaContext,
  getCondicaTimesheet,
  openCondica,
  resetCondicaFixture,
  seedCondicaDays,
  setRomanianDate,
} from "./condica.helpers"

test.describe("Condica write contracts", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-011 editează un interval din detaliul zilei și persistă orele calculate", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:30" }] } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    await page.getByTitle("Editează intervalul").click()
    const dialog = page.getByRole("dialog", { name: /Editează interval/ })
    await dialog.locator("input").nth(0).fill("08:15")
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]?.entries?.[0]?.start).toBe("08:15")
    await context.close()
  })

  test("CON-012 adaugă manual două zile într-un singur document lunar", async ({ browser }) => {
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Adaugă" }).click()
    const dialog = page.getByRole("dialog", { name: "Adaugă condică" })
    await setRomanianDate(dialog.getByTestId("condica-add-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-add-end-date"), "2026-07-09")
    await dialog.locator("#entry-start-0").fill("08:00")
    await dialog.locator("#entry-end-0").fill("16:30")
    await dialog.getByRole("button", { name: "Adaugă condică" }).click()
    await expect.poll(async () => Object.keys((await getCondicaTimesheet() as any)?.days ?? {}).sort()).toEqual(["8", "9"])
    const timesheet = await getCondicaTimesheet() as any
    expect(timesheet.days["8"].entries[0].methodStart).toBe("Introdus manual de către manager")
    await context.close()
  })

  test("CON-013 ștergerea intervalului elimină numai câmpurile selectate", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00" }], breaks: [{ start: "12:00", end: "12:30" }] } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Șterge" }).click()
    const dialog = page.getByRole("dialog", { name: "Șterge pontajul" })
    await setRomanianDate(dialog.getByTestId("condica-delete-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-delete-end-date"), "2026-07-08")
    await dialog.getByRole("button", { name: "Șterge pontajul" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]).toBeUndefined()
    await context.close()
  })

  test("CON-014 și CON-016 refuză date invalide, inversate sau din altă lună fără scrieri", async ({ browser }) => {
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Adaugă" }).click()
    const dialog = page.getByRole("dialog", { name: "Adaugă condică" })
    await setRomanianDate(dialog.getByTestId("condica-add-start-date"), "2026-07-31")
    await setRomanianDate(dialog.getByTestId("condica-add-end-date"), "2026-08-01")
    await dialog.getByRole("button", { name: "Adaugă condică" }).click()
    await expect(dialog.getByRole("alert")).toHaveText("Intervalul selectat trebuie să fie în aceeași lună.")
    expect(await getCondicaTimesheet()).toBeNull()
    await context.close()
  })

  test("CON-015 refuză overlap-ul și acceptă intervalele adiacente", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", entries: [{ start: "08:00", end: "12:00" }], hours: 4 } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Adaugă" }).click()
    const dialog = page.getByRole("dialog", { name: "Adaugă condică" })
    await setRomanianDate(dialog.getByTestId("condica-add-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-add-end-date"), "2026-07-08")
    await dialog.locator("#entry-start-0").fill("11:00")
    await dialog.locator("#entry-end-0").fill("13:00")
    await dialog.getByRole("button", { name: "Adaugă condică" }).click()
    await expect(page.getByText("Intervale suprapuse", { exact: true })).toBeVisible()
    expect((await getCondicaTimesheet() as any).days["8"].entries).toHaveLength(1)
    await dialog.locator("#entry-start-0").fill("12:00")
    await dialog.locator("#entry-end-0").fill("16:00")
    await dialog.getByRole("button", { name: "Adaugă condică" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]?.entries?.[0]?.start).toBe("12:00")
    await context.close()
  })

  test("CON-018 ștergerea selectivă păstrează câmpurile necerute", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00" }], breaks: [{ start: "12:00", end: "12:30" }] } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Șterge" }).click()
    const dialog = page.getByRole("dialog", { name: "Șterge pontajul" })
    await setRomanianDate(dialog.getByTestId("condica-delete-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-delete-end-date"), "2026-07-08")
    await dialog.getByLabel("Șterge intrările de pauză înregistrată").click()
    await dialog.getByRole("button", { name: "Șterge pontajul" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]?.entries).toBeUndefined()
    const next = await getCondicaTimesheet() as any
    expect(next.days["8"].breaks).toHaveLength(1)
    expect(next.days["8"].hours).toBe(8)
    await context.close()
  })

  test("CON-018 refuză ștergerea fără opțiuni sau cu interval inversat fără scrieri", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00" }] } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Șterge" }).click()
    const dialog = page.getByRole("dialog", { name: "Șterge pontajul" })
    await setRomanianDate(dialog.getByTestId("condica-delete-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-delete-end-date"), "2026-07-08")
    await dialog.getByLabel("Șterge intrările de timp înregistrat").click()
    await dialog.getByLabel("Șterge intrările de pauză înregistrată").click()
    await expect(dialog.getByRole("button", { name: "Șterge pontajul" })).toBeDisabled()
    expect((await getCondicaTimesheet() as any).days["8"].entries).toHaveLength(1)

    await dialog.getByLabel("Șterge intrările de timp înregistrat").click()
    await setRomanianDate(dialog.getByTestId("condica-delete-start-date"), "2026-07-09")
    await setRomanianDate(dialog.getByTestId("condica-delete-end-date"), "2026-07-08")
    await dialog.getByRole("button", { name: "Șterge pontajul" }).click()
    await expect(dialog).toContainText("Data de oprire trebuie să fie după data de început.")
    expect((await getCondicaTimesheet() as any).days["8"].entries).toHaveLength(1)
    await context.close()
  })

  test("CON-018 cancel, Escape și retry nu dublează sau nu pierd câmpuri", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00" }], breaks: [{ start: "12:00", end: "12:30" }] } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Șterge" }).click()
    let dialog = page.getByRole("dialog", { name: "Șterge pontajul" })
    await dialog.getByRole("button", { name: "Închide" }).click()
    expect((await getCondicaTimesheet() as any).days["8"].entries).toHaveLength(1)

    await page.getByRole("button", { name: "Șterge" }).click()
    dialog = page.getByRole("dialog", { name: "Șterge pontajul" })
    await dialog.press("Escape")
    await expect(dialog).toHaveCount(0)
    expect((await getCondicaTimesheet() as any).days["8"].breaks).toHaveLength(1)

    await page.getByRole("button", { name: "Șterge" }).click()
    dialog = page.getByRole("dialog", { name: "Șterge pontajul" })
    await setRomanianDate(dialog.getByTestId("condica-delete-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-delete-end-date"), "2026-07-08")
    await dialog.getByLabel("Șterge intrările de pauză înregistrată").click()
    await Promise.all([
      dialog.getByRole("button", { name: "Șterge pontajul" }).click(),
      dialog.getByRole("button", { name: "Șterge pontajul" }).click(),
    ])
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]?.entries).toBeUndefined()
    const afterFirst = await getCondicaTimesheet() as any
    expect(afterFirst.days["8"].breaks).toHaveLength(1)

    await page.reload()
    await expect(page.getByRole("button", { name: "Adaugă" })).toBeVisible()
    await page.getByRole("button", { name: "Șterge" }).click()
    dialog = page.getByRole("dialog", { name: "Șterge pontajul" })
    await setRomanianDate(dialog.getByTestId("condica-delete-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-delete-end-date"), "2026-07-08")
    await dialog.getByRole("button", { name: "Șterge pontajul" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]).toBeUndefined()
    await context.close()
  })
})
