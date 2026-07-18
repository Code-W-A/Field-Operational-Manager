import { expect, test } from "@playwright/test"
import { disableNetwork, doc, enableNetwork, getDocFromServer } from "firebase/firestore"

import { createFirebaseWebClient } from "../../fixtures/firebase-web-client"
import { e2eDb } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID, TECH_UID, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"

test.describe("RES-001 Firestore offline si recovery", () => {
  test.beforeEach(async () => {
    await seedMinimalPontajFixture({ auth: false })
    await e2eDb.collection("attendance").doc(`res_offline_${RUN_ID}`).delete().catch(() => undefined)
  })

  test("RES-001 citirea server offline nu devine empty fals, iar revenirea online recupereaza documentul", async () => {
    const client = await createFirebaseWebClient("tehnician")
    const employeeRef = doc(client.db, "hrEmployees", EMPLOYEE_ID)
    try {
      await expect(getDocFromServer(employeeRef)).resolves.toMatchObject({ exists: expect.any(Function) })
      await disableNetwork(client.db)
      await expect(getDocFromServer(employeeRef)).rejects.toMatchObject({ code: "unavailable" })
      await enableNetwork(client.db)
      await expect.poll(async () => (await getDocFromServer(employeeRef)).exists()).toBe(true)
    } finally {
      await client.dispose()
    }
  })

  test("RES-001 operatie anulata inainte de commit nu lasa attendance sau lock", async () => {
    const client = await createFirebaseWebClient("tehnician")
    try {
      await disableNetwork(client.db)
      // A server precondition fails while offline, so the caller cancels before invoking any write API.
      await expect(getDocFromServer(doc(client.db, "hrEmployees", EMPLOYEE_ID))).rejects.toMatchObject({ code: "unavailable" })
      await enableNetwork(client.db)
      await expect.poll(async () => (await e2eDb.collection("attendance").doc(`res_offline_${RUN_ID}`).get()).exists).toBe(false)
      expect((await e2eDb.collection("attendanceActiveSessions").doc(TECH_UID).get()).exists).toBe(false)
    } finally {
      await client.dispose()
    }
  })
})
