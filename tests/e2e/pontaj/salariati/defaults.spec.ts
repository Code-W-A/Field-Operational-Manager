import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { RUN_ID } from "../../fixtures/pontaj-minimal"
import { employeeId, hrContext, makeEmployee, openEmployees, resetHrFixture } from "./hr.helpers"

test.describe("HR-008/009 program implicit", () => {
  test.beforeEach(resetHrFixture)
  test.afterEach(resetHrFixture)

  test("HR-008 normalizeaza si salveaza singleton-ul, iar HR-009 completeaza numai lipsurile", async ({ browser }) => {
    const missing = employeeId("defaults_missing")
    const individual = employeeId("defaults_individual")
    await e2eDb.collection("hrEmployees").doc(missing).set(makeEmployee(missing, {
      programLucruStart: null,
      programLucruEnd: null,
      pauzaStart: null,
      pauzaEnd: null,
    }))
    await e2eDb.collection("hrEmployees").doc(individual).set(makeEmployee(individual, {
      programLucruStart: "07:00",
      programLucruEnd: "15:00",
      pauzaStart: "11:00",
      pauzaEnd: "11:20",
    }))

    const context = await hrContext(browser)
    const page = await context.newPage()
    await openEmployees(page)
    await page.getByLabel("Program start").fill("9")
    await page.getByLabel("Program end").fill("17")
    await page.getByLabel("Pauză start").fill("12")
    await page.getByLabel("Pauză end").fill("1230")
    await page.getByRole("button", { name: "Salvează", exact: true }).click()
    const confirmation = page.getByRole("alertdialog", { name: "Aplicăm programul la toți salariații?" })
    await confirmation.getByRole("button", { name: "Doar program standard" }).click()

    await expect.poll(async () => (await e2eDb.collection("hrSettings").doc("defaults").get()).get("programLucruStart")).toBe("09:00")
    const defaults = await e2eDb.collection("hrSettings").doc("defaults").get()
    expect(defaults.get("programLucruEnd")).toBe("17:00")
    expect(defaults.get("pauzaStart")).toBe("12:00")
    expect(defaults.get("pauzaEnd")).toBe("12:30")
    expect(defaults.get("updatedAt")).toBeTruthy()

    await expect.poll(async () => (await e2eDb.collection("hrEmployees").doc(missing).get()).get("programLucruStart")).toBe("09:00")
    const filled = await e2eDb.collection("hrEmployees").doc(missing).get()
    expect(filled.get("programLucruEnd")).toBe("17:00")
    expect(filled.get("pauzaStart")).toBe("12:00")
    expect(filled.get("pauzaEnd")).toBe("12:30")
    const untouched = await e2eDb.collection("hrEmployees").doc(individual).get()
    expect(untouched.get("programLucruStart")).toBe("07:00")
    expect(untouched.get("pauzaEnd")).toBe("11:20")
    await page.reload()
    await expect(page.getByLabel("Program start")).toHaveValue("09:00")
    await context.close()
  })
})
