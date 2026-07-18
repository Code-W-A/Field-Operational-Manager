import { expect, test } from "@playwright/test"

import {
  EMPLOYEE_ID,
  condicaContext,
  getCondicaTimesheet,
  insertRequest,
  openCondica,
  resetCondicaFixture,
  seedCondicaDays,
} from "./condica.helpers"
import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { updateAndSyncCondicaRequestForTest } from "./condica-fault-adapter"

const REQUEST_ID = "condica-approved-co"

test.describe("Condica approved-request contracts", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-020 editează o cerere CO aprobată, resincronizează zilele și păstrează auditul", async ({ browser }) => {
    await insertRequest({
      id: REQUEST_ID,
      kind: "CO",
      payload: { startDate: "2026-07-08", endDate: "2026-07-09", reason: "Inițial" },
    })
    await e2eDb.collection("hrRequests").doc(REQUEST_ID).update({ documentSerial: 73 })
    await seedCondicaDays({
      "8": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
      "9": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
    })

    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    const detail = page.getByTestId("condica-day-detail")
    await expect(detail).toContainText("Cerere aprobată")
    await detail.getByRole("button", { name: "Editează" }).click()
    const dialog = page.getByRole("dialog", { name: "Editează cererea aprobată" })
    const dates = dialog.locator('input[type="date"]')
    await dates.nth(0).fill("2026-07-09")
    await dates.nth(1).fill("2026-07-10")
    await dialog.getByRole("button", { name: "Salvează" }).click()

    await expect.poll(async () => (await e2eDb.collection("hrRequests").doc(REQUEST_ID).get()).get("payload")?.startDate).toBe("2026-07-09")
    const request = await e2eDb.collection("hrRequests").doc(REQUEST_ID).get()
    expect(request.get("payload")).toMatchObject({ startDate: "2026-07-09", endDate: "2026-07-10", reason: "Inițial" })
    expect(request.get("documentSerial")).toBe(73)
    expect(request.get("editedByUid")).toBeTruthy()
    expect(request.get("editedAt")).toBeTruthy()

    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]).toBeUndefined()
    const timesheet = await getCondicaTimesheet() as any
    expect(timesheet.days["9"]).toMatchObject({ code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" })
    expect(timesheet.days["10"]).toMatchObject({ code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" })
    await context.close()
  })

  test("CON-020 clear CO cere confirmare, auditează cererea și nu afectează alte zile", async ({ browser }) => {
    await insertRequest({
      id: REQUEST_ID,
      kind: "CO",
      payload: { startDate: "2026-07-08", endDate: "2026-07-09" },
    })
    await seedCondicaDays({
      "8": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO", hours: 8 },
      "9": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
    })

    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    const detail = page.getByTestId("condica-day-detail")
    await expect(detail.getByRole("button", { name: "Elimină CO" })).toBeVisible()

    page.once("dialog", (dialog) => dialog.dismiss())
    await detail.getByRole("button", { name: "Elimină CO" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]?.code).toBe("CO")

    page.once("dialog", (dialog) => dialog.accept())
    await detail.getByRole("button", { name: "Elimină CO" }).click()
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["8"]?.code).toBe("EMPTY")
    const after = await getCondicaTimesheet() as any
    expect(after.days["8"]).not.toHaveProperty("sourceRequestId")
    expect(after.days["8"]).not.toHaveProperty("hours")
    expect(after.days["9"]).toMatchObject({ code: "CO", sourceRequestId: REQUEST_ID })
    const request = await e2eDb.collection("hrRequests").doc(REQUEST_ID).get()
    expect(request.get("timesheetClearedByUid")).toBeTruthy()
    expect(request.get("timesheetClearedDateISO")).toBe("2026-07-08")
    expect(request.get("timesheetClearedAt")).toBeTruthy()
    await context.close()
  })

  test("CON-020 refuză editarea conflictuală fără fals succes și permite retry după eliminarea conflictului", async ({ browser }) => {
    const conflictId = `${REQUEST_ID}-conflict`
    await insertRequest({
      id: REQUEST_ID,
      kind: "CO",
      payload: { startDate: "2026-07-08", endDate: "2026-07-09" },
    })
    await insertRequest({
      id: conflictId,
      kind: "CO",
      payload: { startDate: "2026-07-10", endDate: "2026-07-10" },
    })
    await seedCondicaDays({
      "8": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
      "9": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
    })

    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    await page.getByTestId("condica-day-detail").getByRole("button", { name: "Editează", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "Editează cererea aprobată" })
    const dates = dialog.locator('input[type="date"]')
    await dates.nth(0).fill("2026-07-09")
    await dates.nth(1).fill("2026-07-10")
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect(page.getByText("Eroare", { exact: true })).toBeVisible()
    await expect(dialog).toBeVisible()
    expect((await e2eDb.collection("hrRequests").doc(REQUEST_ID).get()).get("payload")).toMatchObject({
      startDate: "2026-07-08",
      endDate: "2026-07-09",
    })
    expect((await getCondicaTimesheet() as any).days["8"].sourceRequestId).toBe(REQUEST_ID)

    await e2eDb.collection("hrRequests").doc(conflictId).delete()
    await dialog.getByRole("button", { name: "Salvează" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrRequests").doc(REQUEST_ID).get()).get("payload")?.endDate).toBe("2026-07-10")
    await expect.poll(async () => (await getCondicaTimesheet() as any)?.days?.["10"]?.sourceRequestId).toBe(REQUEST_ID)
    await context.close()
  })

  test("CON-020 caracterizează resync-ul eșuat: update-ul și auditul rămân comise, retry-ul scrie o singură proiecție", async () => {
    await insertRequest({
      id: REQUEST_ID,
      kind: "CO",
      payload: { startDate: "2026-07-08", endDate: "2026-07-08" },
    })
    await seedCondicaDays({ "8": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" } })
    const requestRef = e2eDb.collection("hrRequests").doc(REQUEST_ID)
    const timesheetRef = e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`)
    const updateRequest = async () => {
      await requestRef.update({
        payload: { startDate: "2026-07-09", endDate: "2026-07-10" },
        editedByUid: "admin_e2e",
      })
    }
    await expect(updateAndSyncCondicaRequestForTest({ updateRequest, syncTimesheet: async () => {}, failBeforeSync: true })).rejects.toThrow("Injected Condica request resync failure")
    const afterFailure = await getCondicaTimesheet() as any
    expect((await requestRef.get()).get("payload")).toMatchObject({ startDate: "2026-07-09", endDate: "2026-07-10" })
    expect((await requestRef.get()).get("editedByUid")).toBe("admin_e2e")
    expect(afterFailure.days["8"].sourceRequestId).toBe(REQUEST_ID)
    expect(afterFailure.days["9"]).toBeUndefined()

    await updateAndSyncCondicaRequestForTest({
      updateRequest: async () => {},
      syncTimesheet: async () => {
        await timesheetRef.update({
          "days.8": FieldValue.delete(),
          "days.9": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
          "days.10": { code: "CO", sourceRequestId: REQUEST_ID, sourceRequestKind: "CO" },
        })
      },
    })
    const afterRetry = await getCondicaTimesheet() as any
    expect(afterRetry.days["8"]).toBeUndefined()
    expect(afterRetry.days["9"].sourceRequestId).toBe(REQUEST_ID)
    expect(afterRetry.days["10"].sourceRequestId).toBe(REQUEST_ID)
  })
})
