import { expect, test } from "@playwright/test"
import { disableNetwork, doc, enableNetwork, onSnapshot, updateDoc } from "firebase/firestore"

import { createFirebaseWebClient } from "../../fixtures/firebase-web-client"
import { e2eDb } from "../../fixtures/firebase-admin"
import { seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"

test.describe("RES-004 onSnapshot recovery", () => {
  test("RES-004 listenerul tehnicianului converge dupa offline, update extern si reconnect", async () => {
    await seedMinimalPontajFixture({ auth: false })
    const reader = await createFirebaseWebClient("tehnician")
    const writer = await createFirebaseWebClient("admin")
    const defaultsRef = doc(reader.db, "hrSettings", "defaults")
    let latest: string | null = null
    let initialSeen = false
    const unsubscribe = onSnapshot(defaultsRef, (snapshot) => {
      initialSeen = true
      latest = snapshot.data()?.programLucruStart ?? null
    })
    try {
      await expect.poll(() => initialSeen).toBe(true)
      await disableNetwork(reader.db)
      await updateDoc(doc(writer.db, "hrSettings", "defaults"), { programLucruStart: "09:00" })
      expect(latest).not.toBe("09:00")
      await enableNetwork(reader.db)
      await expect.poll(() => latest).toBe("09:00")
    } finally {
      unsubscribe()
      await reader.dispose()
      await writer.dispose()
    }
  })
})
