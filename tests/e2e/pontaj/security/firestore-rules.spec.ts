import { expect, test } from "@playwright/test"
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore"

import { createFirebaseWebClient, type E2ERole } from "../../fixtures/firebase-web-client"
import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import {
  ADMIN_UID,
  DEPARTMENT_ID,
  EMPLOYEE_ID,
  RUN_ID,
  SECOND_TECH_EMPLOYEE_ID,
  TECH_UID,
  TIMESHEET_ID,
  resetPontajMutations,
  seedMinimalPontajFixture,
} from "../../fixtures/pontaj-minimal"

async function expectDenied(operation: Promise<unknown>) {
  await expect(operation).rejects.toMatchObject({ code: "permission-denied" })
}

async function withWebClient<T>(role: E2ERole, action: (client: Awaited<ReturnType<typeof createFirebaseWebClient>>) => Promise<T>) {
  const client = await createFirebaseWebClient(role)
  try {
    return await action(client)
  } finally {
    await client.dispose()
  }
}

test.describe("@security-hardening RES-005 Firestore Rules directe prin Firebase Web SDK", () => {
  test.skip(process.env.PONTAJ_SECURITY_HARDENING !== "true", "SECURITY_HARDENING_DEFERRED_BY_OWNER")

  test.beforeEach(async () => {
    await seedMinimalPontajFixture()
    await resetPontajMutations()
    await e2eDb.collection("hrEmployees").doc(SECOND_TECH_EMPLOYEE_ID).set({
      fullName: `Al doilea ${RUN_ID}`,
      active: true,
      userUid: ADMIN_UID,
      ownerRunId: RUN_ID,
    })
    await e2eDb.collection("hrTimesheets").doc(TIMESHEET_ID).set({
      employeeId: EMPLOYEE_ID,
      monthKey: "2026-07",
      days: {},
      ownerRunId: RUN_ID,
    })
    await e2eDb.collection("hrTimesheets").doc(`${SECOND_TECH_EMPLOYEE_ID}_2026-07`).set({
      employeeId: SECOND_TECH_EMPLOYEE_ID,
      monthKey: "2026-07",
      days: {},
      ownerRunId: RUN_ID,
    })
    await e2eDb.collection("logs").doc(`log_${RUN_ID}`).set({
      utilizatorId: TECH_UID,
      actiune: "seed",
      ownerRunId: RUN_ID,
      timestamp: FieldValue.serverTimestamp(),
    })
    await e2eDb.collection("hrCounters").doc("leaveRequestSerial").set({ last: 0, ownerRunId: RUN_ID })
  })

  test("RES-005 neautentificat, client si rol necunoscut nu pot citi sau modifica HR", async () => {
    for (const role of ["neautentificat", "client", "rol-necunoscut"] as const) {
      await withWebClient(role, async ({ db }) => {
        await expectDenied(getDoc(doc(db, "hrEmployees", EMPLOYEE_ID)))
        await expectDenied(getDocs(collection(db, "hrTimesheets")))
        await expectDenied(setDoc(doc(db, "hrDepartments", `forbidden_${role}`), { name: "forbidden" }))
        await expectDenied(setDoc(doc(db, "attendance", `forbidden_${role}`), { userId: TECH_UID, status: "active" }))
      })
    }
    expect((await e2eDb.collection("hrDepartments").doc("forbidden_client").get()).exists).toBe(false)
    expect((await e2eDb.collection("attendance").get()).empty).toBe(true)
  })

  test("RES-005 tehnicianul isi poate citi datele, dar nu poate modifica timesheet-ul altuia, rolul sau counter-ul", async () => {
    await withWebClient("tehnician", async ({ db }) => {
      await expect(getDoc(doc(db, "hrEmployees", EMPLOYEE_ID))).resolves.toMatchObject({ exists: expect.any(Function) })
      await expectDenied(updateDoc(doc(db, "hrTimesheets", `${SECOND_TECH_EMPLOYEE_ID}_2026-07`), { days: { 8: { code: "WORK" } } }))
      await expectDenied(updateDoc(doc(db, "users", TECH_UID), { role: "admin" }))
      await expectDenied(updateDoc(doc(db, "hrCounters", "leaveRequestSerial"), { last: 9999 }))
    })
    expect((await e2eDb.collection("users").doc(TECH_UID).get()).get("role")).toBe("tehnician")
    expect((await e2eDb.collection("hrCounters").doc("leaveRequestSerial").get()).get("last")).toBe(0)
  })

  test("RES-005 logurile sunt append-only, iar adminul are contractele HR confirmate", async () => {
    await withWebClient("tehnician", async ({ db }) => {
      await expectDenied(updateDoc(doc(db, "logs", `log_${RUN_ID}`), { actiune: "rescris" }))
      await expectDenied(deleteDoc(doc(db, "logs", `log_${RUN_ID}`)))
    })
    await withWebClient("admin", async ({ db }) => {
      await expect(getDocs(collection(db, "hrEmployees"))).resolves.toBeTruthy()
      await expect(setDoc(doc(db, "hrDepartments", `admin_${RUN_ID}`), { name: "Administrare", active: true })).resolves.toBeUndefined()
      await expect(updateDoc(doc(db, "hrSettings", "defaults"), { programLucruStart: "08:00" })).resolves.toBeUndefined()
    })
  })

  test("RES-005 matrice actuala pentru dispecer este caracterizata, nu ridicata la regula business", async () => {
    await withWebClient("dispecer", async ({ db }) => {
      await expect(getDocs(collection(db, "hrEmployees"))).resolves.toBeTruthy()
      await expect(setDoc(doc(db, "hrDepartments", `dispatcher_${RUN_ID}`), { name: "Caracterizare", active: true })).resolves.toBeUndefined()
    })
  })
})
