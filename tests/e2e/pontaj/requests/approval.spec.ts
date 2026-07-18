import { expect, test } from "@playwright/test"

import { e2eDb } from "../../fixtures/firebase-admin"
import { approveRequest, requestTimesheetCell, requestsContext, resetRequestsFixture, seedRequest } from "./requests.helpers"

const cases = [
  ["CO", "CO"],
  ["CFP", "CFP"],
  ["CM", "CM"],
  ["DEL", "DEL"],
  ["IN", "IN"],
] as const

test.describe("HR-014 aprobarea si proiectia in condica", () => {
  test.beforeEach(async () => resetRequestsFixture())

  for (const [kind, code] of cases) {
    test(`HR-014 ${kind} aprobat se proiecteaza cu codul si sursa corecte`, async ({ browser }) => {
      const requestId = `req_approval_${kind.toLowerCase()}`
      await seedRequest({
        id: requestId,
        kind,
        serial: 610 + cases.findIndex(([candidate]) => candidate === kind),
        payload: kind === "CM"
          ? { kind, startDate: "2026-07-08", endDate: "2026-07-08", medicalDocumentUrl: "http://storage.invalid/cm.pdf", medicalDocumentName: "cm.pdf" }
          : undefined,
      })
      const context = await requestsContext(browser, "admin")
      const page = await context.newPage()
      await approveRequest(page, requestId)
      const request = await e2eDb.collection("hrRequests").doc(requestId).get()
      expect(request.get("decidedByUid")).toBeTruthy()
      expect(request.get("decidedAt")).toBeTruthy()
      await expect.poll(async () => requestTimesheetCell(), {
        message: `timesheet-ul trebuie proiectat pentru cererea ${requestId}`,
      }).toMatchObject({ code, sourceRequestId: requestId, sourceRequestKind: kind })
      await context.close()
    })
  }

  test("HR-014 respingerea necesita motiv si nu proiecteaza timesheet", async ({ browser }) => {
    const requestId = "req_rejected"
    await seedRequest({ id: requestId, kind: "CO", serial: 700 })
    const context = await requestsContext(browser, "admin")
    const page = await context.newPage()
    await (async () => {
      const { openApproval } = await import("./requests.helpers")
      await openApproval(page, requestId)
    })()
    await page.getByRole("button", { name: "Refuză" }).click()
    await expect(page.getByRole("button", { name: "Confirmă refuz" })).toBeDisabled()
    await page.getByRole("dialog", { name: "Refuză cererea" }).getByRole("textbox").fill("Document incomplet")
    await page.getByRole("button", { name: "Confirmă refuz" }).click()
    await expect.poll(async () => (await e2eDb.collection("hrRequests").doc(requestId).get()).get("status")).toBe("rejected")
    expect((await e2eDb.collection("hrRequests").doc(requestId).get()).get("rejectionReason")).toBe("Document incomplet")
    expect(await requestTimesheetCell()).toBeUndefined()
    await context.close()
  })
})
