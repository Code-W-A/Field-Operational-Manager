import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { DEPARTMENT_ID, EMPLOYEE_ID, requestsContext, resetRequestsFixture, TECH_UID } from "./requests.helpers"

test.describe("HR-014 ciclul cererilor", () => {
  test.beforeEach(async () => resetRequestsFixture())

  test("HR-014 createaza CO din dialog cu serial, routing si zero duplicate la dublu submit", async ({ browser }) => {
    const context = await requestsContext(browser, "technician")
    const page = await context.newPage()
    await page.goto("/dashboard/cereri")
    await expect(page.getByRole("heading", { name: "Cererile mele" })).toBeVisible()
    await page.getByRole("button", { name: "Cerere" }).click()
    const dialog = page.getByRole("dialog", { name: "Cerere nouă" })
    await dialog.getByPlaceholder("dd MMM yyyy").nth(0).fill("2026-07-10")
    await dialog.getByPlaceholder("dd MMM yyyy").nth(0).blur()
    await dialog.getByPlaceholder("dd MMM yyyy").nth(1).fill("2026-07-10")
    await dialog.getByPlaceholder("dd MMM yyyy").nth(1).blur()
    await dialog.getByRole("button", { name: "Trimite cererea" }).dblclick()
    await expect.poll(async () => (await e2eDb.collection("hrRequests").get()).size).toBe(1)
    const request = (await e2eDb.collection("hrRequests").get()).docs[0]
    expect(request.get("status")).toBe("pending")
    expect(request.get("employeeId")).toBe(EMPLOYEE_ID)
    expect(request.get("requesterUid")).toBe(TECH_UID)
    expect(request.get("managerUid")).toBeTruthy()
    expect(request.get("sectorId")).toBe(DEPARTMENT_ID)
    expect(request.get("documentSerial")).toBe(1)
    expect(request.get("createdAt")).toBeTruthy()
    await context.close()
  })

  test("HR-014 refuza intervalul inversat fara scrieri", async ({ browser }) => {
    const context = await requestsContext(browser, "technician")
    const page = await context.newPage()
    await page.goto("/dashboard/cereri")
    await page.getByRole("button", { name: "Cerere" }).click()
    const dialog = page.getByRole("dialog", { name: "Cerere nouă" })
    await dialog.getByPlaceholder("dd MMM yyyy").nth(0).fill("2026-07-11")
    await dialog.getByPlaceholder("dd MMM yyyy").nth(0).blur()
    await dialog.getByPlaceholder("dd MMM yyyy").nth(1).fill("2026-07-10")
    await dialog.getByPlaceholder("dd MMM yyyy").nth(1).blur()
    await dialog.getByRole("button", { name: "Trimite cererea" }).click()
    await expect(page.getByText("Data de început nu poate fi după data de sfârșit.")).toBeVisible()
    expect((await e2eDb.collection("hrRequests").get()).empty).toBe(true)
    await context.close()
  })
})
