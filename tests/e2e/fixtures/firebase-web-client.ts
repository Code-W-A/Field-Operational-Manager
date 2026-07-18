import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app"
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth"
import { connectFirestoreEmulator, getFirestore, terminate, type Firestore } from "firebase/firestore"
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage"
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions"

import { E2E_PROJECT_ID } from "./firebase-admin"
import { E2E_USERS, PASSWORD } from "./pontaj-minimal"

export type E2ERole = "admin" | "tehnician" | "dispecer" | "kiosk" | "client" | "rol-necunoscut" | "fara-rol" | "neautentificat"

const roleUser = {
  admin: E2E_USERS.find((user) => "role" in user && user.role === "admin"),
  tehnician: E2E_USERS.find((user) => "role" in user && user.role === "tehnician"),
  dispecer: E2E_USERS.find((user) => "role" in user && user.role === "dispecer"),
  kiosk: E2E_USERS.find((user) => "role" in user && user.role === "kiosk"),
  client: E2E_USERS.find((user) => "role" in user && user.role === "client"),
  "rol-necunoscut": E2E_USERS.find((user) => "role" in user && user.role === "rol-necunoscut"),
  "fara-rol": E2E_USERS.find((user) => !("role" in user)),
} as const

export interface FirebaseWebClient {
  app: FirebaseApp
  auth: Auth
  db: Firestore
  storage: FirebaseStorage
  functions: Functions
  dispose(): Promise<void>
}

/**
 * Rule probes must use the Firebase Web SDK. Admin SDK remains arrange/inspect only.
 */
export async function createFirebaseWebClient(role: E2ERole): Promise<FirebaseWebClient> {
  const app = initializeApp({
    apiKey: "demo-api-key",
    authDomain: `${E2E_PROJECT_ID}.firebaseapp.com`,
    projectId: E2E_PROJECT_ID,
    storageBucket: `${E2E_PROJECT_ID}.appspot.com`,
    appId: "rules-probe",
  }, `rules-probe-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const auth = getAuth(app)
  const db = getFirestore(app)
  const storage = getStorage(app)
  const functions = getFunctions(app, "europe-west1")

  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true })
  connectFirestoreEmulator(db, "127.0.0.1", 8080)
  connectStorageEmulator(storage, "127.0.0.1", 9199)
  connectFunctionsEmulator(functions, "127.0.0.1", 5001)

  if (role !== "neautentificat") {
    const user = roleUser[role]
    if (!user) throw new Error(`Missing fixture user for ${role}`)
    await signInWithEmailAndPassword(auth, user.email, PASSWORD)
  }

  return {
    app,
    auth,
    db,
    storage,
    functions,
    async dispose() {
      await signOut(auth).catch(() => undefined)
      await terminate(db).catch(() => undefined)
      await deleteApp(app).catch(() => undefined)
    },
  }
}
