import path from "node:path"
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { ADMIN_UID, EMPLOYEE_ID, snapshotFirebaseState } from "../../fixtures/pontaj-minimal"

const authDir = path.resolve("tests/e2e/.auth")
const hrHeading = /Condică prezență|Dashboard Pontaj|Sincronizare Pontaj|Salariați|Fișa salariat|Departamente|Rapoarte HR/

async function roleContext(browser: Browser, role: string): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: path.join(authDir, `${role}.json`),
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
  })
}

async function rolePage(browser: Browser, role: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await roleContext(browser, role)
  return { context, page: await context.newPage() }
}

async function expectNoHrFlash(page: Page) {
  await expect(page.getByRole("heading", { name: hrHeading })).toHaveCount(0)
}

async function expectNoAttendanceWrites(before: unknown) {
  const withoutAuditLogs = (state: unknown) => {
    const copy = structuredClone(state) as Record<string, unknown>
    delete copy.logs
    return copy
  }
  expect(withoutAuditLogs(await snapshotFirebaseState())).toEqual(withoutAuditLogs(before))
}

test("RT-001 aliasul pontaj păstrează query la condică", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "admin")
  await page.goto(`/dashboard/resurse-umane/pontaj?month=2026-07&employeeId=${EMPLOYEE_ID}`)
  await expect(page).toHaveURL(new RegExp(`/dashboard/resurse-umane/condica-prezenta\\?.*month=2026-07.*employeeId=${EMPLOYEE_ID}`))
  await context.close()
})

const authorizedRoutes = [
  ["RT-002", "/dashboard/resurse-umane/pontaj/dashboard", "Dashboard Pontaj"],
  ["RT-003", "/dashboard/resurse-umane/pontaj/sync", "Sincronizare Pontaj → Condică"],
  ["RT-004", "/dashboard/resurse-umane/condica-prezenta?month=2026-07", "Condică prezență"],
  ["RT-005", "/dashboard/resurse-umane/salariati", "Salariați"],
  ["RT-007", "/dashboard/resurse-umane/departamente", "Departamente"],
  ["RT-008", "/dashboard/resurse-umane/rapoarte", "Rapoarte HR"],
] as const

for (const [id, route, heading] of authorizedRoutes) {
  test(`${id} adminul accesează direct și după refresh`, async ({ browser }) => {
    const before = await snapshotFirebaseState()
    const { context, page } = await rolePage(browser, "admin")
    await page.goto(route)
    if (id === "RT-004") await expect(page.getByRole("button", { name: "Grid", exact: true })).toBeVisible()
    else await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
    await page.reload()
    if (id === "RT-004") await expect(page.getByRole("button", { name: "Grid", exact: true })).toBeVisible()
    else await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible()
    await expectNoAttendanceWrites(before)
    await context.close()
  })
}

test("RT-006 fișa salariatului păstrează luna la refresh și back/forward", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "admin")
  const route = `/dashboard/resurse-umane/salariati/${EMPLOYEE_ID}?month=2026-07`
  await page.goto(route)
  await expect(page.getByRole("heading", { name: /^Fișa salariat - / })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/month=2026-07/)
  await page.goto("/dashboard/resurse-umane/salariati")
  await page.goBack()
  await expect(page).toHaveURL(/month=2026-07/)
  await page.goForward()
  await context.close()
})

test("RT-009 aliasul dashboard kiosk ajunge la kiosk", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "kiosk")
  await page.goto("/dashboard/kiosk")
  await expect(page).toHaveURL(/\/kiosk(?:$|[/?#])/)
  await context.close()
})

test("RT-010 kiosk vede fluxul dedicat fără flash dashboard", async ({ browser }) => {
  const { context, page } = await rolePage(browser, "kiosk")
  await page.goto("/kiosk")
  await expect(page).toHaveURL(/\/kiosk(?:$|[/?#])/)
  await expect(page.getByText(/Start|Stop|Selectează/i).first()).toBeVisible()
  await expectNoHrFlash(page)
  await context.close()
})

const deniedRoutes = [
  ["RT-011", "/dashboard/resurse-umane/pontaj"],
  ["RT-012", "/dashboard/resurse-umane/pontaj/dashboard"],
  ["RT-013", "/dashboard/resurse-umane/pontaj/sync"],
  ["RT-014", "/dashboard/resurse-umane/condica-prezenta"],
  ["RT-015", "/dashboard/resurse-umane/salariati"],
  ["RT-016", `/dashboard/resurse-umane/salariati/${EMPLOYEE_ID}?month=2026-07`],
  ["RT-018", "/dashboard/resurse-umane/rapoarte"],
] as const

for (const [id, route] of deniedRoutes) {
  test(`${id} rolurile interzise nu văd conținut HR și nu scriu`, async ({ browser }) => {
    const before = await snapshotFirebaseState()
    for (const role of ["technician", "client", "unknown", "no-role", "no-user-doc"]) {
      const { context, page } = await rolePage(browser, role)
      await page.goto(route)
      if (role === "technician") await expect(page).toHaveURL(/\/dashboard\/lucrari(?:$|[/?#])/)
      else if (role === "client") await expect(page).toHaveURL(/\/portal(?:$|[/?#])/)
      else if (role === "no-user-doc") await expect(page).toHaveURL(/\/login(?:$|[/?#])/)
      else await expect(page).toHaveURL(/\/dashboard(?:$|[/?#])/)
      await expectNoHrFlash(page)
      await context.close()
    }
    await expectNoAttendanceWrites(before)
  })
}

test("RT-017 dispecerul vede restricția departamentelor, celelalte roluri sunt redirecționate", async ({ browser }) => {
  const dispatcher = await rolePage(browser, "dispatcher")
  await dispatcher.page.goto("/dashboard/resurse-umane/departamente")
  await expect(dispatcher.page.getByText("Acces restricționat", { exact: true })).toBeVisible()
  await dispatcher.context.close()

  const technician = await rolePage(browser, "technician")
  await technician.page.goto("/dashboard/resurse-umane/departamente")
  await expect(technician.page).toHaveURL(/\/dashboard\/lucrari/)
  await expectNoHrFlash(technician.page)
  await technician.context.close()
})

test("RT-019 aliasul kiosk refuză toate rolurile non-kiosk și neautentificat", async ({ browser }) => {
  for (const role of ["admin", "dispatcher", "technician", "client", "unknown", "no-role"]) {
    const { context, page } = await rolePage(browser, role)
    await page.goto("/dashboard/kiosk")
    await expect(page).not.toHaveURL(/\/kiosk(?:$|[/?#])/)
    await context.close()
  }
  const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" })
  const page = await context.newPage()
  await page.goto("/dashboard/kiosk")
  await expect(page).toHaveURL(/\/login/)
  await context.close()
})

test("RT-020 schimbarea rolului elimină accesul după refresh și un context nou", async ({ browser }) => {
  const ref = e2eDb.collection("users").doc(ADMIN_UID)
  try {
    const first = await rolePage(browser, "admin")
    await first.page.goto("/dashboard/resurse-umane/condica-prezenta")
    await expect(first.page.getByRole("button", { name: "Grid", exact: true })).toBeVisible()
    await ref.update({ role: "tehnician" })
    await first.page.reload()
    await expect(first.page).toHaveURL(/\/dashboard\/lucrari/)
    await expectNoHrFlash(first.page)
    await first.context.close()

    const second = await rolePage(browser, "admin")
    await second.page.goto("/dashboard/resurse-umane/condica-prezenta")
    await expect(second.page).toHaveURL(/\/dashboard\/lucrari/)
    await second.context.close()
  } finally {
    await ref.update({ role: "admin" })
  }
})
