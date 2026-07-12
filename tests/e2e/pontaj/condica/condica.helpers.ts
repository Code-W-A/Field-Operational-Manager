import path from "node:path"

import { expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import {
  EMPLOYEE_ID,
  MONTH_KEY,
  RUN_ID,
  TIMESHEET_ID,
  resetPontajMutations,
  seedMinimalPontajFixture,
} from "../../fixtures/pontaj-minimal"

export const CONDICA_STATE = path.resolve("tests/e2e/.auth/admin.json")

export function condicaContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    storageState: CONDICA_STATE,
  })
}

export async function resetCondicaFixture() {
  await seedMinimalPontajFixture({ auth: false })
  await resetPontajMutations()
  await Promise.all([
    e2eDb.collection("hrRequests").get().then(async (snapshot) => {
      const batch = e2eDb.batch()
      snapshot.docs.forEach((document) => batch.delete(document.ref))
      await batch.commit()
    }),
    e2eDb.collection("hrHolidays").get().then(async (snapshot) => {
      const batch = e2eDb.batch()
      snapshot.docs.forEach((document) => batch.delete(document.ref))
      await batch.commit()
    }),
  ])
}

export async function seedCondicaDays(days: Record<string, unknown>, employeeId = EMPLOYEE_ID, monthKey = MONTH_KEY) {
  await e2eDb.collection("hrTimesheets").doc(`${employeeId}_${monthKey}`).set({
    employeeId,
    monthKey,
    days,
    ownerRunId: RUN_ID,
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function getCondicaTimesheet(employeeId = EMPLOYEE_ID, monthKey = MONTH_KEY) {
  const snapshot = await e2eDb.collection("hrTimesheets").doc(`${employeeId}_${monthKey}`).get()
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } as any : null
}

export async function openCondica(page: Page, options: { monthKey?: string; employeeId?: string } = {}) {
  const monthKey = options.monthKey ?? MONTH_KEY
  const employeeId = options.employeeId ?? EMPLOYEE_ID
  await page.goto(`/dashboard/resurse-umane/condica-prezenta?month=${monthKey}&employeeId=${employeeId}`)
  await expect(page.getByRole("button", { name: "Adaugă" })).toBeVisible()
  await expect(page.getByTestId("condica-loading")).toHaveCount(0)
}

export async function setRomanianDate(input: Locator, value: string) {
  await input.fill(value)
  await input.press("Tab")
}

export async function insertRequest(params: {
  id: string
  kind: string
  payload: Record<string, unknown>
  status?: "approved" | "pending" | "rejected"
}) {
  await e2eDb.collection("hrRequests").doc(params.id).set({
    employeeId: EMPLOYEE_ID,
    employeeName: `Tehnician ${RUN_ID}`,
    requesterUid: "requester-e2e",
    sectorId: "sector-e2e",
    managerUid: "admin_e2e",
    kind: params.kind,
    status: params.status ?? "approved",
    payload: params.payload,
    ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export { EMPLOYEE_ID, MONTH_KEY, TIMESHEET_ID }
