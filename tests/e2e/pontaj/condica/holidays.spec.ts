import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import {
  condicaContext,
  openCondica,
  resetCondicaFixture,
  restoreHolidayYear,
  snapshotHolidayYear,
} from "./condica.helpers"

test.describe("Condica legal holidays", () => {
  test.describe.configure({ mode: "serial" })
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-019 editează doar draftul până la Save și persistă metadata singletonului", async ({ browser }) => {
    await e2eDb.collection("hrHolidays").doc("2026").set({ items: [{ date: "2026-07-13", label: "Inițial" }], ownerRunId: "E2E_PONTAJ_STAGE5", updatedAt: FieldValue.serverTimestamp() })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Sărbători legale" }).click()
    const dialog = page.getByRole("dialog", { name: /Sărbători legale/ })
    await dialog.getByPlaceholder("Denumire (opțional)").last().fill("Draft")
    await dialog.getByRole("button", { name: "Închide" }).click()
    expect((await e2eDb.collection("hrHolidays").doc("2026").get()).get("items")[0].label).toBe("Inițial")
    await page.getByRole("button", { name: "Sărbători legale" }).click()
    const reopened = page.getByRole("dialog", { name: /Sărbători legale/ })
    await reopened.getByPlaceholder("Denumire (opțional)").last().fill("Salvat")
    await reopened.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrHolidays").doc("2026").get()).get("items")[0].label).toBe("Salvat")
    const saved = await e2eDb.collection("hrHolidays").doc("2026").get()
    expect(saved.get("updatedByUid")).toBeTruthy()
    expect(saved.get("updatedAt")).toBeTruthy()
    await context.close()
  })

  test("CON-019 adaugă, ordonează, deduplică și reface draftul după închidere", async ({ browser }) => {
    await e2eDb.collection("hrHolidays").doc("2026").set({
      items: [{ date: "2026-07-15", label: "Ulterior" }],
      ownerRunId: "E2E_PONTAJ_STAGE5",
      updatedAt: FieldValue.serverTimestamp(),
    })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Sărbători legale" }).click()
    let dialog = page.getByRole("dialog", { name: /Sărbători legale/ })
    await dialog.getByRole("button", { name: "Deschide calendar" }).click()
    await page.getByRole("gridcell", { name: "14", exact: true }).click()
    await dialog.getByPlaceholder("Ex: Anul Nou").fill("Prima")
    await dialog.getByRole("button", { name: "Adaugă" }).click()
    await expect(dialog.getByPlaceholder("Denumire (opțional)").first()).toHaveValue("Prima")

    await dialog.getByRole("button", { name: "Deschide calendar" }).click()
    await page.getByRole("gridcell", { name: "14", exact: true }).click()
    await dialog.getByRole("button", { name: "Adaugă" }).click()
    await expect(page.getByText("Deja există", { exact: true })).toBeVisible()
    await dialog.getByRole("button", { name: "Închide" }).click()
    expect((await e2eDb.collection("hrHolidays").doc("2026").get()).get("items")).toEqual([{ date: "2026-07-15", label: "Ulterior" }])

    await page.getByRole("button", { name: "Sărbători legale" }).click()
    dialog = page.getByRole("dialog", { name: /Sărbători legale/ })
    await expect(dialog).not.toContainText("Prima")
    await dialog.getByRole("button", { name: "Deschide calendar" }).click()
    await page.getByRole("gridcell", { name: "14", exact: true }).click()
    await dialog.getByPlaceholder("Ex: Anul Nou").fill("Prima")
    await dialog.getByRole("button", { name: "Adaugă" }).click()
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrHolidays").doc("2026").get()).get("items")).toEqual([
      { date: "2026-07-14", label: "Prima" },
      { date: "2026-07-15", label: "Ulterior" },
    ])
    await context.close()
  })

  test("CON-019 restaurează exact singletonul după Save, inclusiv metadata și timestampuri", async ({ browser }) => {
    const ref = e2eDb.collection("hrHolidays").doc("2026")
    await ref.set({
      items: [{ date: "2026-07-14", label: "Snapshot" }],
      ownerRunId: "E2E_PONTAJ_STAGE5",
      nestedMetadata: { source: "before-test", revision: 3 },
      updatedAt: FieldValue.serverTimestamp(),
    })
    const before = await snapshotHolidayYear(2026)
    const context = await condicaContext(browser)
    const page = await context.newPage()

    try {
      await openCondica(page)
      await page.getByRole("button", { name: "Sărbători legale" }).click()
      const dialog = page.getByRole("dialog", { name: /Sărbători legale/ })
      await dialog.getByPlaceholder("Denumire (opțional)").fill("Modificat")
      const startedAt = Date.now()
      await dialog.getByRole("button", { name: "Salvează" }).click()
      await expect.poll(async () => (await ref.get()).get("items")[0].label).toBe("Modificat")
      const modified = await ref.get()
      expect(modified.get("updatedByUid")).toBeTruthy()
      expect(modified.get("updatedAt").toMillis()).toBeGreaterThanOrEqual(startedAt - 5_000)
      expect(modified.get("updatedAt").toMillis()).toBeLessThanOrEqual(Date.now() + 5_000)
    } finally {
      await context.close()
      await restoreHolidayYear(before)
    }

    const restored = await snapshotHolidayYear(2026)
    expect(restored).toEqual(before)
  })
})
