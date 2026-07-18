import path from "node:path"

import { expect, test, type Browser, type Locator, type Page } from "@playwright/test"

import { resetPontajMutations, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"

type Viewport = { name: string; width: number; height: number }
type RouteContract = {
  route: string
  role: "admin" | "technician" | "kiosk"
  name: string
  expectedUrl: RegExp
  redirectOnly?: boolean
  primary: (page: Page) => Locator
}

const viewports: Viewport[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "mobile-portrait", width: 390, height: 844 },
  { name: "mobile-landscape", width: 844, height: 390 },
]

const employeeRoute = "/dashboard/resurse-umane/salariati/emp_e2e_pontaj_stage5?month=2026-07"

const routes: RouteContract[] = [
  {
    name: "pontaj-alias",
    route: "/dashboard/resurse-umane/pontaj?month=2026-07",
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/condica-prezenta/,
    primary: (page) => page.getByRole("button", { name: "Grid", exact: true }),
  },
  {
    name: "dashboard-pontaj",
    route: "/dashboard/resurse-umane/pontaj/dashboard",
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/pontaj\/dashboard$/,
    primary: (page) => page.locator("main button").first(),
  },
  {
    name: "sync-pontaj",
    route: "/dashboard/resurse-umane/pontaj/sync",
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/pontaj\/sync$/,
    primary: (page) => page.getByRole("button", { name: "Verifică Status", exact: true }),
  },
  {
    name: "condica",
    route: "/dashboard/resurse-umane/condica-prezenta?month=2026-07",
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/condica-prezenta/,
    primary: (page) => page.getByRole("button", { name: "Grid", exact: true }),
  },
  {
    name: "salariati",
    route: "/dashboard/resurse-umane/salariati",
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/salariati$/,
    primary: (page) => page.getByRole("button", { name: "Adaugă", exact: true }),
  },
  {
    name: "fisa-salariat",
    route: employeeRoute,
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/salariati\/emp_e2e_pontaj_stage5/,
    primary: (page) => page.locator("main button").first(),
  },
  {
    name: "departamente",
    route: "/dashboard/resurse-umane/departamente",
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/departamente$/,
    primary: (page) => page.getByRole("button", { name: "Adaugă departament", exact: true }),
  },
  {
    name: "rapoarte",
    route: "/dashboard/resurse-umane/rapoarte",
    role: "admin",
    expectedUrl: /\/dashboard\/resurse-umane\/rapoarte$/,
    primary: (page) => page.getByRole("tab", { name: "Pontaj HR", exact: true }),
  },
  {
    name: "dashboard-kiosk",
    route: "/dashboard/kiosk",
    role: "kiosk",
    expectedUrl: /\/kiosk$/,
    redirectOnly: true,
    primary: (page) => page.getByTestId("kiosk-start"),
  },
  {
    name: "kiosk",
    route: "/kiosk",
    role: "kiosk",
    expectedUrl: /\/kiosk$/,
    primary: (page) => page.getByTestId("kiosk-start"),
  },
  {
    name: "lucrari",
    route: "/dashboard/lucrari",
    role: "technician",
    expectedUrl: /\/dashboard\/lucrari$/,
    primary: (page) => page.getByRole("button", { name: /Mă pontez acum/i }),
  },
]

function authState(role: RouteContract["role"]) {
  return path.resolve(`tests/e2e/.auth/${role === "technician" ? "technician" : role}.json`)
}

async function openRolePage(browser: Browser, role: RouteContract["role"], viewport: Viewport) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    storageState: authState(role),
    viewport: { width: viewport.width, height: viewport.height },
    permissions: ["geolocation"],
    geolocation: { latitude: 44.4268, longitude: 26.1025 },
  })
  return { context, page: await context.newPage() }
}

async function assertPrimaryInViewport(page: Page, primary: Locator, route: string, viewport: Viewport) {
  await expect(primary, `${route} ${viewport.name}: controlul principal trebuie sa fie vizibil`).toBeVisible()
  await primary.scrollIntoViewIfNeeded()
  const box = await primary.boundingBox()
  expect(box, `${route} ${viewport.name}: controlul principal nu are bounding box`).not.toBeNull()
  expect(box!.x + box!.width, `${route} ${viewport.name}: controlul principal iese la dreapta`).toBeLessThanOrEqual(viewport.width + 1)
  expect(box!.y + box!.height, `${route} ${viewport.name}: controlul principal iese sub viewport`).toBeLessThanOrEqual(viewport.height + 1)
}

async function assertNoGlobalHorizontalOverflow(page: Page, route: string, viewport: Viewport) {
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(metrics.scrollWidth, `${route} ${viewport.name}: overflow orizontal global ${metrics.scrollWidth}/${metrics.clientWidth}`).toBeLessThanOrEqual(metrics.clientWidth + 1)
}

async function expectFocusToReachInteractiveControl(page: Page) {
  await page.keyboard.press("Tab")
  await expect(page.locator(":focus")).toHaveCount(1)
  await expect(page.locator(":focus")).not.toHaveJSProperty("tagName", "BODY")
}

test.describe("RES-008 responsive and semantic route contracts", () => {
  test.beforeEach(async () => {
    await seedMinimalPontajFixture({ auth: false })
    await resetPontajMutations()
  })

  for (const contract of routes) {
    test(`RES-008 ${contract.name} ramane utilizabila pe toate viewporturile`, async ({ browser }) => {
      for (const viewport of viewports) {
        const { context, page } = await openRolePage(browser, contract.role, viewport)
        const pageErrors: string[] = []
        page.on("pageerror", (error) => pageErrors.push(error.message))
        try {
          await page.goto(contract.route)
          await expect(page, `${contract.name} ${viewport.name}: redirect neasteptat`).toHaveURL(contract.expectedUrl)
          if (contract.redirectOnly) {
            expect(pageErrors, `${contract.name} ${viewport.name}: pageerror`).toEqual([])
            continue
          }
          const primary = contract.primary(page)
          await assertPrimaryInViewport(page, primary, contract.name, viewport)
          await expect(page.locator("main").first(), `${contract.name} ${viewport.name}: landmark principal lipsa`).toBeVisible()
          await assertNoGlobalHorizontalOverflow(page, contract.name, viewport)

          await primary.focus()
          await expect(primary).toBeFocused()
          await page.keyboard.press("Tab")
          await page.keyboard.press("Shift+Tab")

          await page.reload()
          await expect(page).toHaveURL(contract.expectedUrl)
          await assertPrimaryInViewport(page, contract.primary(page), contract.name, viewport)
          expect(pageErrors, `${contract.name} ${viewport.name}: pageerror`).toEqual([])
        } finally {
          await context.close()
        }
      }
    })
  }

  test("RES-008 dialogurile reprezentative au focus, labels si Escape fara mutatii", async ({ browser }) => {
    const admin = await openRolePage(browser, "admin", viewports[3])
    try {
      await admin.page.goto("/dashboard/resurse-umane/salariati")
      const addEmployee = admin.page.getByRole("button", { name: "Adaugă", exact: true })
      await addEmployee.click()
      const employeeDialog = admin.page.getByRole("dialog", { name: "Adaugă salariat" })
      await expect(employeeDialog).toBeVisible()
      await expect(employeeDialog.getByLabel("Prenume *")).toBeVisible()
      await employeeDialog.press("Escape")
      await expect(employeeDialog).toHaveCount(0)
      await expectFocusToReachInteractiveControl(admin.page)

      await admin.page.goto("/dashboard/resurse-umane/departamente")
      const addDepartment = admin.page.getByRole("button", { name: "Adaugă departament", exact: true })
      await addDepartment.click()
      const departmentDialog = admin.page.getByRole("dialog", { name: "Departament nou" })
      await expect(departmentDialog.getByLabel("Nume departament *")).toBeVisible()
      await departmentDialog.press("Escape")
      await expectFocusToReachInteractiveControl(admin.page)
    } finally {
      await admin.context.close()
    }

    const technician = await openRolePage(browser, "technician", viewports[3])
    try {
      await technician.page.goto("/dashboard/cereri")
      const createRequest = technician.page.getByRole("button", { name: "Cerere", exact: true })
      await createRequest.click()
      const requestDialog = technician.page.getByRole("dialog", { name: "Cerere nouă" })
      await expect(requestDialog.getByLabel("De la *")).toBeVisible()
      await expect(requestDialog.getByLabel("Până la *")).toBeVisible()
      await requestDialog.press("Escape")
      await expectFocusToReachInteractiveControl(technician.page)
    } finally {
      await technician.context.close()
    }

    const kiosk = await openRolePage(browser, "kiosk", viewports[4])
    try {
      await kiosk.page.goto("/kiosk")
      const logout = kiosk.page.getByLabel("Deconectare")
      await logout.click()
      const logoutDialog = kiosk.page.getByRole("dialog", { name: "Deconectare Kiosk" })
      await expect(logoutDialog).toBeVisible()
      await logoutDialog.press("Escape")
      await expectFocusToReachInteractiveControl(kiosk.page)
    } finally {
      await kiosk.context.close()
    }
  })
})
