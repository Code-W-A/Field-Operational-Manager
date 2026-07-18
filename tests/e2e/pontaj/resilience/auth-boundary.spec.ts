import { expect, test } from "@playwright/test"
import { doc, setDoc } from "firebase/firestore"
import { signOut } from "firebase/auth"

import { createFirebaseWebClient } from "../../fixtures/firebase-web-client"
import { e2eDb } from "../../fixtures/firebase-admin"
import { EMPLOYEE_ID, RUN_ID, TECH_UID, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"

test.describe("RES-002 Auth boundary", () => {
  test.beforeEach(async () => {
    await seedMinimalPontajFixture({ auth: false })
    await e2eDb.collection("attendance").doc(`res_auth_${RUN_ID}`).delete().catch(() => undefined)
  })

  test("@security-hardening RES-002 logout inainte de commit refuza Start si lasa zero attendance/lock", async () => {
    test.skip(
      process.env.PONTAJ_SECURITY_HARDENING !== "true",
      "SECURITY_HARDENING_DEFERRED_BY_OWNER",
    )
    const client = await createFirebaseWebClient("tehnician")
    const id = `res_auth_${RUN_ID}`
    try {
      await signOut(client.auth)
      await expect(setDoc(doc(client.db, "attendance", id), {
        userId: TECH_UID,
        employeeId: EMPLOYEE_ID,
        status: "active",
      })).rejects.toMatchObject({ code: "permission-denied" })
      expect((await e2eDb.collection("attendance").doc(id).get()).exists).toBe(false)
      expect((await e2eDb.collection("attendanceActiveSessions").doc(TECH_UID).get()).exists).toBe(false)
    } finally {
      await client.dispose()
    }
  })

  test("RES-002 commitul finalizat ramane persistent dupa logout", async () => {
    const client = await createFirebaseWebClient("tehnician")
    const id = `res_auth_${RUN_ID}`
    try {
      await setDoc(doc(client.db, "attendance", id), {
        userId: TECH_UID,
        employeeId: EMPLOYEE_ID,
        status: "active",
        ownerRunId: RUN_ID,
      })
      await signOut(client.auth)
      await expect.poll(async () => (await e2eDb.collection("attendance").doc(id).get()).get("status")).toBe("active")
    } finally {
      await client.dispose()
    }
  })
})
