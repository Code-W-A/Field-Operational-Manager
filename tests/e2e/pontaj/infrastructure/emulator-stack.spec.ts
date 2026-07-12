import { expect, test } from "@playwright/test"

import { assertSafeFirebaseEmulatorProject, LIVE_FIREBASE_PROJECT_ID } from "../../../../lib/firebase/emulator-safety"
import { deleteCollection, e2eDb, emulatorHealthCheck } from "../../fixtures/firebase-admin"

test("stack-ul minimal Auth/Firestore/Functions/Storage este disponibil", async () => {
  await emulatorHealthCheck()
})

test("guard-ul refuză proiectul Firebase live și cleanup-ul este idempotent", async () => {
  expect(() => assertSafeFirebaseEmulatorProject(LIVE_FIREBASE_PROJECT_ID)).toThrow(/production Firebase project detected/)
  expect(assertSafeFirebaseEmulatorProject("demo-fom-pontaj-e2e")).toBe("demo-fom-pontaj-e2e")

  await e2eDb.collection("e2eCleanupCanary").doc("one").set({ ok: true })
  await deleteCollection("e2eCleanupCanary")
  await deleteCollection("e2eCleanupCanary")
  expect((await e2eDb.collection("e2eCleanupCanary").get()).empty).toBe(true)
})
