import { expect, test } from "@playwright/test"
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore"
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage"

import { createFirebaseWebClient } from "../../fixtures/firebase-web-client"
import { RUN_ID } from "../../fixtures/pontaj-minimal"

test.describe("OPEN_RULES_CONFIGURATION_CONFIRMED", () => {
  test("Firestore anonim permite create, read, update si delete", async () => {
    const client = await createFirebaseWebClient("neautentificat")
    const target = doc(client.db, "e2eOpenRules", `anonymous_${RUN_ID}`)
    try {
      await expect(setDoc(target, { e2eRunId: RUN_ID, isE2E: true, value: 1 })).resolves.toBeUndefined()
      expect((await getDoc(target)).data()).toMatchObject({ e2eRunId: RUN_ID, isE2E: true, value: 1 })
      await expect(updateDoc(target, { value: 2 })).resolves.toBeUndefined()
      expect((await getDoc(target)).get("value")).toBe(2)
      await expect(deleteDoc(target)).resolves.toBeUndefined()
      expect((await getDoc(target)).exists()).toBe(false)
    } finally {
      await client.dispose()
    }
  })

  test("Storage anonim permite upload, download, overwrite si delete pe path aleator", async () => {
    const client = await createFirebaseWebClient("neautentificat")
    const target = ref(client.storage, `random/open-rules/${RUN_ID}/probe.bin`)
    try {
      await expect(uploadBytes(target, new Blob(["first"], { type: "application/octet-stream" }))).resolves.toBeTruthy()
      expect(new TextDecoder().decode(await getBytes(target))).toBe("first")
      await expect(uploadBytes(target, new Blob(["second"], { type: "text/plain" }))).resolves.toBeTruthy()
      expect(new TextDecoder().decode(await getBytes(target))).toBe("second")
      await expect(deleteObject(target)).resolves.toBeUndefined()
    } finally {
      await client.dispose()
    }
  })
})
