import { expect, test } from "@playwright/test"

import { deleteCollection, e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { createFirebaseWebClient } from "../../fixtures/firebase-web-client"
import { ADMIN_UID, DEPARTMENT_ID, EMPLOYEE_ID, RUN_ID, TECH_UID } from "../../fixtures/pontaj-minimal"

test("disabled mail transport returns 503 without dispatch or email writes", async ({ request }) => {
  test.skip(process.env.MAIL_TRANSPORT_MODE !== "disabled", "Run separately with MAIL_TRANSPORT_MODE=disabled")
  await Promise.all([
    deleteCollection("hrRequests"),
    deleteCollection("hrNotificationDispatches"),
    deleteCollection("emailEvents"),
  ])
  await e2eDb.collection("hrRequests").doc("notify_disabled").set({
    employeeId: EMPLOYEE_ID,
    employeeName: `Tehnician ${RUN_ID}`,
    requesterUid: TECH_UID,
    managerUid: ADMIN_UID,
    sectorId: DEPARTMENT_ID,
    kind: "CO",
    status: "pending",
    payload: { startDate: "2026-07-20", endDate: "2026-07-20" },
    ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(),
  })
  const client = await createFirebaseWebClient("tehnician")
  const token = await client.auth.currentUser?.getIdToken()
  await client.dispose()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request.post("http://127.0.0.1:3100/api/notifications/hr-request", {
      data: { requestId: "notify_disabled", event: "created" },
      headers: { authorization: `Bearer ${token}` },
    })
    expect(response.status()).toBe(503)
  }
  expect((await e2eDb.collection("hrNotificationDispatches").get()).empty).toBe(true)
  expect((await e2eDb.collection("emailEvents").get()).empty).toBe(true)
  expect((await e2eDb.collection("hrRequests").doc("notify_disabled").get()).get("status")).toBe("pending")
})
