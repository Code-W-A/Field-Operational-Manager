import path from "node:path"

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { ADMIN_UID, DEPARTMENT_ID, EMPLOYEE_ID, RUN_ID, TECH_UID } from "../../fixtures/pontaj-minimal"
import { resetHrFixture } from "../salariati/hr.helpers"

export { ADMIN_UID, DEPARTMENT_ID, EMPLOYEE_ID, TECH_UID }

export async function requestsContext(browser: Browser, role: "admin" | "technician") {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    storageState: path.resolve(`tests/e2e/.auth/${role}.json`),
  })
  await context.route("**/api/notifications/hr-request", (route) => route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ error: "E2E notification transport disabled" }),
  }))
  return context
}

export async function resetRequestsFixture() {
  await resetHrFixture()
  await e2eDb.collection("logs").get().then(async (snapshot) => {
    const batch = e2eDb.batch()
    snapshot.docs.forEach((document) => batch.delete(document.ref))
    if (!snapshot.empty) await batch.commit()
  })
}

export async function seedRequest(params: {
  id: string
  kind: "CO" | "CFP" | "CM" | "DEL" | "IN"
  status?: "pending" | "approved" | "rejected"
  payload?: Record<string, unknown>
  serial?: number
}) {
  const payload = params.payload ?? (params.kind === "IN"
    ? { kind: "IN", date: "2026-07-08", startTime: "10:00", endTime: "12:00", reason: "E2E" }
    : { kind: params.kind, startDate: "2026-07-08", endDate: "2026-07-08", reason: "E2E" })
  await e2eDb.collection("hrRequests").doc(params.id).set({
    employeeId: EMPLOYEE_ID,
    employeeName: `Tehnician ${RUN_ID}`,
    requesterUid: TECH_UID,
    sectorId: DEPARTMENT_ID,
    managerUid: ADMIN_UID,
    kind: params.kind,
    status: params.status ?? "pending",
    payload,
    documentSerial: params.serial ?? 500,
    emailChannel: "nextjs",
    ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function openApproval(page: Page, requestId: string) {
  await page.goto("/dashboard/cereri-aprobari")
  await expect(page.getByRole("heading", { name: /Concedii si evenimente/ })).toBeVisible()
  const request = await e2eDb.collection("hrRequests").doc(requestId).get()
  const serial = request.get("documentSerial")
  await page.getByText(`#${String(serial).padStart(4, "0")}`, { exact: true }).first().click()
  await expect(page.getByRole("dialog", { name: "Detalii cerere" })).toBeVisible()
}

export async function approveRequest(page: Page, requestId: string) {
  await openApproval(page, requestId)
  await page.getByRole("button", { name: "Aprobă" }).click()
  await expect.poll(async () => (await e2eDb.collection("hrRequests").doc(requestId).get()).get("status")).toBe("approved")
}

export async function requestTimesheetCell(day = "8") {
  const snapshot = await e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_2026-07`).get()
  return snapshot.get(`days.${day}`) as Record<string, unknown> | undefined
}
