import { getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore"
import { getStorage } from "firebase-admin/storage"

import { assertSafeFirebaseEmulatorProject } from "../../../lib/firebase/emulator-safety"

export const E2E_PROJECT_ID = assertSafeFirebaseEmulatorProject(
  process.env.E2E_PONTAJ_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
)

for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
  if (!process.env[key]) throw new Error(`E2E_ABORT: missing ${key}`)
}

const appName = "pontaj-stage5-admin"
const adminApp = getApps().find((candidate) => candidate.name === appName) ??
  initializeApp({ projectId: E2E_PROJECT_ID, storageBucket: `${E2E_PROJECT_ID}.appspot.com` }, appName)

export const e2eAuth = getAuth(adminApp)
export const e2eDb = getFirestore(adminApp)
export const e2eStorage = getStorage(adminApp)
export { FieldValue, Timestamp }

export async function deleteCollection(collectionName: string) {
  while (true) {
    const snapshot = await e2eDb.collection(collectionName).limit(200).get()
    if (snapshot.empty) return
    const batch = e2eDb.batch()
    snapshot.docs.forEach((document) => batch.delete(document.ref))
    await batch.commit()
  }
}

export async function readDocument(collectionName: string, id: string) {
  const snapshot = await e2eDb.collection(collectionName).doc(id).get()
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null
}

export async function listDocuments(collectionName: string) {
  const snapshot = await e2eDb.collection(collectionName).get()
  return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
}

export async function emulatorHealthCheck() {
  const canaryId = `health_${Date.now()}`
  const ref = e2eDb.collection("e2eHealth").doc(canaryId)
  await ref.set({ projectId: E2E_PROJECT_ID, at: FieldValue.serverTimestamp() })
  const snapshot = await ref.get()
  await ref.delete()
  if (!snapshot.exists || snapshot.get("projectId") !== E2E_PROJECT_ID) {
    throw new Error("E2E_ABORT: Firestore emulator canary failed")
  }

  const authConfig = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${E2E_PROJECT_ID}/config`)
  if (!authConfig.ok) throw new Error("E2E_ABORT: Auth emulator health check failed")
  const storageRoot = await fetch(
    `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${E2E_PROJECT_ID}.appspot.com/o`,
  )
  if (storageRoot.status >= 500) throw new Error(`E2E_ABORT: Storage emulator health check failed (${storageRoot.status})`)
  const functionsRoot = await fetch("http://127.0.0.1:5001")
  if (functionsRoot.status >= 500) throw new Error("E2E_ABORT: Functions emulator health check failed")
}
