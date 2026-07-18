import { expect, test } from "@playwright/test"

import {
  EMPLOYEE_ID,
  condicaContext,
  getCondicaTimesheet,
  insertRequest,
  openCondica,
  resetCondicaFixture,
  seedCondicaDays,
  setRomanianDate,
} from "./condica.helpers"
import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"

const REQUEST_ID = "condica-convergence-co"

test.describe("Condica two-tab convergence", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-018 ștergerea multi-zi este atomică și converge în două taburi după refresh", async ({ browser }) => {
    await seedCondicaDays({
      "8": { code: "WORK", hours: 8, entries: [{ start: "08:00", end: "16:00" }], breaks: [{ start: "12:00", end: "12:30" }] },
      "9": { code: "WORK", hours: 7, entries: [{ start: "08:00", end: "15:00" }], breaks: [{ start: "12:00", end: "12:30" }] },
    })
    const context = await condicaContext(browser)
    const first = await context.newPage()
    const second = await context.newPage()
    await Promise.all([openCondica(first), openCondica(second)])

    await first.getByRole("button", { name: "Șterge" }).click()
    const dialog = first.getByRole("dialog", { name: "Șterge pontajul" })
    await setRomanianDate(dialog.getByTestId("condica-delete-start-date"), "2026-07-08")
    await setRomanianDate(dialog.getByTestId("condica-delete-end-date"), "2026-07-09")
    await dialog.getByRole("button", { name: "Șterge pontajul" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]).toBeUndefined()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["9"]).toBeUndefined()

    for (const page of [first, second]) {
      await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toHaveAttribute("data-hours", "")
      await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-9`)).toHaveAttribute("data-hours", "")
      await page.reload()
      await expect(page.getByRole("button", { name: "Adaugă" })).toBeVisible()
      await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toHaveAttribute("data-hours", "")
    }
    await context.close()
  })

  test("CON-019 Save la sărbători se propagă în al doilea tab și supraviețuiește refreshului", async ({ browser }) => {
    await e2eDb.collection("hrHolidays").doc("2026").set({
      items: [{ date: "2026-07-14", label: "Inițial" }],
      ownerRunId: "E2E_PONTAJ_STAGE5",
      updatedAt: FieldValue.serverTimestamp(),
    })
    const context = await condicaContext(browser)
    const first = await context.newPage()
    const second = await context.newPage()
    await Promise.all([openCondica(first), openCondica(second)])
    await Promise.all([
      first.getByRole("button", { name: "Sărbători legale" }).click(),
      second.getByRole("button", { name: "Sărbători legale" }).click(),
    ])
    const firstDialog = first.getByRole("dialog", { name: /Sărbători legale/ })
    const secondDialog = second.getByRole("dialog", { name: /Sărbători legale/ })
    await firstDialog.getByPlaceholder("Denumire (opțional)").fill("Actualizat")
    await firstDialog.getByRole("button", { name: "Salvează" }).click()
    await expect(secondDialog.getByPlaceholder("Denumire (opțional)")).toHaveValue("Actualizat")
    await second.reload()
    await second.getByRole("button", { name: "Sărbători legale" }).click()
    await expect(second.getByRole("dialog", { name: /Sărbători legale/ }).getByPlaceholder("Denumire (opțional)")).toHaveValue("Actualizat")
    await context.close()
  })

  test("CON-020 editarea și clear CO converg în două taburi", async ({ browser }) => {
    await insertRequest({
      id: REQUEST_ID,
      kind: "CO",
      payload: { startDate: "2026-07-08", endDate: "2026-07-09" },
    })
    await seedCondicaDays({
      "8": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
      "9": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
    })
    const context = await condicaContext(browser)
    const first = await context.newPage()
    const second = await context.newPage()
    await Promise.all([openCondica(first), openCondica(second)])

    await first.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    await first.getByTestId("condica-day-detail").getByRole("button", { name: "Editează" }).click()
    const edit = first.getByRole("dialog", { name: "Editează cererea aprobată" })
    await edit.locator('input[type="date"]').nth(0).fill("2026-07-09")
    await edit.locator('input[type="date"]').nth(1).fill("2026-07-10")
    await edit.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["10"]?.sourceRequestId).toBe(REQUEST_ID)

    await second.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-9`).click()
    await expect(second.getByTestId("condica-day-detail")).toContainText("2026-07-09 → 2026-07-10")
    second.once("dialog", (dialog) => dialog.accept())
    await second.getByTestId("condica-day-detail").getByRole("button", { name: "Elimină CO" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["9"]?.code).toBe("EMPTY")
    await first.reload()
    await expect(first.getByRole("button", { name: "Adaugă" })).toBeVisible()
    await expect(first.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-9`)).toHaveAttribute("data-hours", "")
    await context.close()
  })
})
