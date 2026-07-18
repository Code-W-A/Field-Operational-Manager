import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { openApproval, requestsContext, resetRequestsFixture, seedRequest } from "./requests.helpers"

test.describe("HR-015 seriale si concurenta", () => {
  test.beforeEach(async () => resetRequestsFixture())

  test("HR-015 doua taburi aloca seriale unice si monotone", async ({ browser }) => {
    const first = await requestsContext(browser, "technician")
    const second = await requestsContext(browser, "technician")
    const firstPage = await first.newPage()
    const secondPage = await second.newPage()
    await Promise.all([firstPage.goto("/dashboard/cereri"), secondPage.goto("/dashboard/cereri")])
    await Promise.all([
      firstPage.getByRole("button", { name: "Cerere" }).click(),
      secondPage.getByRole("button", { name: "Cerere" }).click(),
    ])
    const firstDialog = firstPage.getByRole("dialog", { name: "Cerere nouă" })
    const secondDialog = secondPage.getByRole("dialog", { name: "Cerere nouă" })
    for (const [dialog, date] of [[firstDialog, "2026-07-10"], [secondDialog, "2026-07-11"]] as const) {
      await dialog.getByPlaceholder("dd MMM yyyy").nth(0).fill(date)
      await dialog.getByPlaceholder("dd MMM yyyy").nth(0).blur()
      await dialog.getByPlaceholder("dd MMM yyyy").nth(1).fill(date)
      await dialog.getByPlaceholder("dd MMM yyyy").nth(1).blur()
    }
    await Promise.all([
      firstDialog.getByRole("button", { name: "Trimite cererea" }).click(),
      secondDialog.getByRole("button", { name: "Trimite cererea" }).click(),
    ])
    await expect.poll(async () => (await e2eDb.collection("hrRequests").get()).size).toBe(2)
    const serials = (await e2eDb.collection("hrRequests").get()).docs.map((request) => request.get("documentSerial")).sort((a, b) => a - b)
    expect(serials).toEqual([1, 2])
    expect((await e2eDb.collection("hrCounters").doc("leaveRequestSerial").get()).get("last")).toBe(2)
    await first.close()
    await second.close()
  })

  test("HR-015 doua taburi nu pot rescrie aceeasi decizie", async ({ browser }) => {
    const requestId = "req_concurrent_decision"
    await seedRequest({ id: requestId, kind: "CO", serial: 800 })
    const first = await requestsContext(browser, "admin")
    const second = await requestsContext(browser, "admin")
    const firstPage = await first.newPage()
    const secondPage = await second.newPage()
    await Promise.all([openApproval(firstPage, requestId), openApproval(secondPage, requestId)])
    await Promise.allSettled([
      firstPage.getByRole("button", { name: "Aprobă" }).click(),
      secondPage.getByRole("button", { name: "Aprobă" }).click(),
    ])
    await expect.poll(async () => (await e2eDb.collection("hrRequests").doc(requestId).get()).get("status")).toBe("approved")
    await expect.poll(async () => {
      const [firstText, secondText] = await Promise.all([firstPage.locator("body").innerText(), secondPage.locator("body").innerText()])
      return `${firstText}\n${secondText}`
    }).toContain("Cererea a fost deja soluționată.")
    const request = await e2eDb.collection("hrRequests").doc(requestId).get()
    expect(request.get("status")).toBe("approved")
    await first.close()
    await second.close()
  })
})
