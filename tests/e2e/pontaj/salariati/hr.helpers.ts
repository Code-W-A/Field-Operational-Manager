import path from "node:path"

import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { deleteCollection, e2eDb, e2eStorage, FieldValue } from "../../fixtures/firebase-admin"
import {
  ADMIN_UID,
  DEPARTMENT_ID,
  EMPLOYEE_ID,
  MONTH_KEY,
  RUN_ID,
  seedMinimalPontajFixture,
  TECH_UID,
} from "../../fixtures/pontaj-minimal"

export const HR_AUTH_DIR = path.resolve("tests/e2e/.auth")
export const HR_EMPLOYEE_ID = EMPLOYEE_ID
export const HR_DEPARTMENT_ID = DEPARTMENT_ID
export const HR_MONTH_KEY = MONTH_KEY

export function employeeId(suffix: string) {
  return `emp_${RUN_ID.toLowerCase()}_${suffix}`
}

export function departmentId(suffix: string) {
  return `dept_${RUN_ID.toLowerCase()}_${suffix}`
}

export function makeEmployee(id: string, overrides: Record<string, unknown> = {}) {
  return {
    prenume: "E2E",
    nume: id,
    fullName: `E2E ${id}`,
    active: true,
    ownerRunId: RUN_ID,
    ...overrides,
  }
}

export async function resetHrFixture() {
  for (const collectionName of ["hrEmployees", "hrDepartments", "hrSettings", "hrRequests", "hrCounters", "hrTimesheets"]) {
    await deleteCollection(collectionName)
  }
  await seedMinimalPontajFixture({ auth: false })
  await e2eStorage.bucket().deleteFiles({ prefix: "hr/" }).catch(() => undefined)
  await e2eStorage.bucket().deleteFiles({ prefix: "hrEmployees/" }).catch(() => undefined)
}

export function hrContext(browser: Browser, role: "admin" | "dispatcher" = "admin"): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    storageState: path.join(HR_AUTH_DIR, `${role}.json`),
  })
}

export async function openEmployees(page: Page) {
  await page.goto("/dashboard/resurse-umane/salariati")
  await expect(page.getByRole("heading", { name: "Salariați" })).toBeVisible()
  await expect(page.getByLabel("Caută în tabel")).toBeVisible()
}

export async function openEmployeeProfile(page: Page, id = HR_EMPLOYEE_ID, monthKey = HR_MONTH_KEY) {
  await page.goto(`/dashboard/resurse-umane/salariati/${id}?month=${monthKey}`)
  await expect(page.getByRole("heading", { name: /Fișa salariat/ })).toBeVisible()
}

export async function openDepartments(page: Page) {
  await page.goto("/dashboard/resurse-umane/departamente")
  await expect(page.getByRole("heading", { name: "Departamente" })).toBeVisible()
}

export async function seedDepartment(id: string, overrides: Record<string, unknown> = {}) {
  await e2eDb.collection("hrDepartments").doc(id).set({
    name: id,
    active: true,
    ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...overrides,
  })
}

export async function employeeDocument(id: string) {
  const snapshot = await e2eDb.collection("hrEmployees").doc(id).get()
  return snapshot.exists ? snapshot.data() ?? null : null
}

export async function hrSnapshot(collectionName: string) {
  const snapshot = await e2eDb.collection(collectionName).get()
  return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }))
}

export { ADMIN_UID, TECH_UID }
