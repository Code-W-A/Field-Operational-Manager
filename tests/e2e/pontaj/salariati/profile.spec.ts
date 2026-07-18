import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID } from "../../fixtures/pontaj-minimal"
import { hrContext, hrSnapshot, openEmployeeProfile, resetHrFixture } from "./hr.helpers"

test.describe("HR-007 fisa salariat", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("incarca fisa, schimba luna si pastreaza navigarea catre condica si rapoarte", async ({ browser }) => {
    const months = [
      { monthKey: "2023-02", day: "28" },
      { monthKey: "2024-02", day: "29" },
      { monthKey: "2024-04", day: "30" },
      { monthKey: "2024-05", day: "31" },
    ] as const
    await Promise.all(months.map(({ monthKey, day }) =>
      e2eDb.collection("hrTimesheets").doc(`${EMPLOYEE_ID}_${monthKey}`).set({
        employeeId: EMPLOYEE_ID,
        monthKey,
        ownerRunId: RUN_ID,
        days: {
          [day]: {
            code: "WORK",
            entries: [
              { start: "07:30", end: "08:00", project: "Traseu catre client" },
              { start: "08:00", end: "16:30", source: "Pontaj" },
            ],
          },
        },
      }),
    ))
    const beforeEmployees = await hrSnapshot("hrEmployees")
    const beforeTimesheets = await hrSnapshot("hrTimesheets")
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployeeProfile(page)
    await expect(page.getByRole("heading", { name: new RegExp(`Fișa salariat - Tehnician ${RUN_ID}`) })).toBeVisible()

    await page.getByRole("tab", { name: "Pontaj" }).click()
    const month = page.locator('input[type="month"]')
    for (const { monthKey, day } of months) {
      await month.fill(monthKey)
      await expect(page).toHaveURL(new RegExp(`/salariati/${EMPLOYEE_ID}\\?month=${monthKey}`))
      await expect(page.getByTitle(`Ziua ${day}`)).toBeVisible()
      await expect(page.getByTestId("employee-kpi-work-hours")).toContainText("8h")
    }

    await page.reload()
    await page.getByRole("tab", { name: "Pontaj" }).click()
    await expect(page.locator('input[type="month"]')).toHaveValue("2024-05")
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/salariati/${EMPLOYEE_ID}\\?month=2024-04`))
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/salariati/${EMPLOYEE_ID}\\?month=2024-05`))
    await page.getByRole("tab", { name: "Pontaj" }).click()

    await page.getByRole("button", { name: "Deschide condica completă" }).click()
    await expect(page).toHaveURL(new RegExp(`condica-prezenta\\?employeeId=${EMPLOYEE_ID}&month=2024-05`))
    await page.goto(`/dashboard/resurse-umane/salariati/${EMPLOYEE_ID}?month=2024-05`)
    await page.getByRole("tab", { name: "Pontaj" }).click()
    await page.getByRole("button", { name: "Vezi rapoarte" }).click()
    await expect(page).toHaveURL(/rapoarte\?month=2024-05/)

    expect(await hrSnapshot("hrEmployees")).toEqual(beforeEmployees)
    expect(await hrSnapshot("hrTimesheets")).toEqual(beforeTimesheets)
    await context.close()
  })

  test("afiseaza salariat inexistent numai dupa finalizarea incarcarii si nu scrie", async ({ browser }) => {
    const beforeEmployees = await hrSnapshot("hrEmployees")
    const beforeTimesheets = await hrSnapshot("hrTimesheets")
    const context = await hrContext(browser)
    const page = await context.newPage()
    await page.goto(`/dashboard/resurse-umane/salariati/emp_${RUN_ID.toLowerCase()}_missing?month=2026-07`)
    await expect(page.getByText("Salariat inexistent.", { exact: true })).toBeVisible()
    expect(await hrSnapshot("hrEmployees")).toEqual(beforeEmployees)
    expect(await hrSnapshot("hrTimesheets")).toEqual(beforeTimesheets)
    await context.close()
  })

  test("afiseaza sigur datele partiale, asocierea lipsa si departamentul eliminat fara scrieri", async ({ browser }) => {
    await e2eDb.collection("hrEmployees").doc(EMPLOYEE_ID).update({
      active: false,
      userUid: null,
      sectorIds: [`dept_${RUN_ID.toLowerCase()}_eliminat`],
      programLucruStart: "07:00",
      programLucruEnd: "15:30",
      pauzaStart: "11:30",
      pauzaEnd: "11:45",
      photoURL: null,
    })
    const beforeEmployees = await hrSnapshot("hrEmployees")
    const beforeTimesheets = await hrSnapshot("hrTimesheets")
    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployeeProfile(page)

    await expect(page.getByText("Inactiv", { exact: true })).toBeVisible()
    await expect(page.getByText(new RegExp(`${RUN_ID.toLowerCase()}_eliminat \\(șters\\)`))).toBeVisible()
    await expect(page.getByText("07:00 - 15:30", { exact: true })).toBeVisible()
    await expect(page.getByText("11:30 - 11:45", { exact: true })).toBeVisible()
    await expect(page.getByText("Nicio informație de identificare", { exact: true })).toBeVisible()
    await expect(page.getByText("Fără asociere", { exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByRole("heading", { name: new RegExp(`Fișa salariat - Tehnician ${RUN_ID}`) })).toBeVisible()
    expect(await hrSnapshot("hrEmployees")).toEqual(beforeEmployees)
    expect(await hrSnapshot("hrTimesheets")).toEqual(beforeTimesheets)
    await context.close()
  })
})
