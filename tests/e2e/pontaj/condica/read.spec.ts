import { expect, test } from "@playwright/test"

import { e2eDb, FieldValue, Timestamp } from "../../fixtures/firebase-admin"
import { RUN_ID, TECH_UID, seedActiveSession } from "../../fixtures/pontaj-minimal"
import { EMPLOYEE_ID, condicaContext, openCondica, resetCondicaFixture, seedCondicaDays } from "./condica.helpers"

test.describe("Condica read contracts", () => {
  test.beforeEach(resetCondicaFixture)
  test.afterEach(resetCondicaFixture)

  test("CON-001 ruta respectă luna din query și calendarul lunii", async ({ browser }) => {
    await seedCondicaDays({ "31": { code: "WORK", hours: 8 } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-31`)).toHaveAttribute("data-hours", "8")
    await context.close()
  })

  test("CON-002 filtrul păstrează grila și lista pentru salariatul ales", async ({ browser }) => {
    await seedCondicaDays({ "8": { code: "WORK", hours: 8 } })
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await expect(page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`)).toBeVisible()
    await page.getByRole("button", { name: "Grid" }).click()
    await expect(page.getByTestId(`timesheet-list-cell-${EMPLOYEE_ID}-8`)).toBeVisible()
    await context.close()
  })

  test("CON-003 modul compact persistă în localStorage și revine în mod detaliat", async ({ browser }) => {
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByRole("button", { name: "Compact" }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem("condica-compact-mode"))).toBe("true")
    await page.reload()
    await expect(page.getByRole("button", { name: "Detaliat" })).toBeVisible()
    await context.close()
  })

  test("CON-004 lista goală este explicită și nu scrie în Firestore", async ({ browser }) => {
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).delete()
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page, { employeeId: "all" })
    await expect(page.getByTestId("condica-empty")).toBeVisible()
    expect((await e2eDb.collection("hrTimesheets").get()).empty).toBe(true)
    await context.close()
  })

  test("CON-005 administratorul vede locațiile Start/Stop și linkurile exacte către hartă", async ({ browser }) => {
    const sessionId = `condica-location-${RUN_ID}`
    await e2eDb.collection("attendance").doc(sessionId).set({
      userId: TECH_UID,
      employeeId: EMPLOYEE_ID,
      sessionStart: Timestamp.fromDate(new Date("2026-07-08T05:00:00.000Z")),
      sessionEnd: Timestamp.fromDate(new Date("2026-07-08T13:30:00.000Z")),
      status: "completed",
      mode: "field",
      checkOutMode: "field",
      location: { lat: 44.4267674, lng: 26.1025384, address: "Piața Unirii, București" },
      checkOutLocation: { lat: 44.4378258, lng: 26.0946376 },
      deviceInfo: { type: "field", userAgent: "Playwright" },
      checkOutDeviceInfo: { type: "field", userAgent: "Playwright" },
      ownerRunId: RUN_ID,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await seedCondicaDays({
      "8": {
        code: "WORK",
        hours: 8,
        entries: [{ start: "08:00", end: "16:30", project: "Pontaj", attendanceSessionId: sessionId }],
      },
    })

    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()
    await page.getByRole("button", { name: "Locații pontaj 08:00–16:30" }).click()

    const dialog = page.getByRole("dialog", { name: "Locații pontaj" })
    await expect(dialog).toContainText("Piața Unirii, București")
    await expect(dialog).toContainText("44.426767, 26.102538")
    await expect(dialog).toContainText("44.437826, 26.094638")
    const mapLinks = dialog.getByRole("link", { name: /Deschide în Google Maps/ })
    await expect(mapLinks).toHaveCount(2)
    await expect(mapLinks.first()).toHaveAttribute("href", /query=44\.4267674%2C26\.1025384/)
    await context.close()
  })

  test("CON-006 sesiunea activă afișează locația de start și explică lipsa stopului", async ({ browser }) => {
    await seedActiveSession(new Date("2026-07-08T05:00:00.000Z").getTime())
    const context = await condicaContext(browser)
    const page = await context.newPage()
    await openCondica(page)
    await page.getByTestId(`timesheet-cell-${EMPLOYEE_ID}-8`).click()

    const detail = page.getByTestId("condica-day-detail")
    await expect(detail.getByRole("button", { name: "Locație start" })).toBeVisible()
    await detail.getByRole("button", { name: "Locație start" }).click()
    const dialog = page.getByRole("dialog", { name: "Locații pontaj" })
    await expect(dialog).toContainText("44.426800, 26.102500")
    await expect(dialog).toContainText("Sesiunea este încă activă")
    await expect(dialog.getByRole("link", { name: /Deschide în Google Maps/ })).toHaveCount(1)
    await context.close()
  })
})
