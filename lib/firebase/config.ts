import { initializeApp, getApps, getApp } from "firebase/app"
import { connectAuthEmulator, getAuth } from "firebase/auth"
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore"
import { connectStorageEmulator, getStorage } from "firebase/storage"
import { connectFunctionsEmulator, getFunctions } from "firebase/functions"
import { assertSafeFirebaseEmulatorProject, shouldUseFirebaseEmulators } from "./emulator-safety"

// Configurația Firebase
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

// Verificăm dacă toate variabilele de mediu sunt definite
if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId) {
  console.error("Variabilele de mediu Firebase nu sunt configurate corect. Verificați .env.local")
}

// Inițializăm Firebase doar dacă nu a fost deja inițializat
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp()

// Exportăm serviciile Firebase
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app, "europe-west1")

const emulatorState = globalThis as typeof globalThis & { __fomFirebaseEmulatorsConnected?: boolean }
if (shouldUseFirebaseEmulators() && !emulatorState.__fomFirebaseEmulatorsConnected) {
  assertSafeFirebaseEmulatorProject(firebaseConfig.projectId)
  const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1"
  connectAuthEmulator(auth, `http://${host}:${Number(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || 9099)}`, {
    disableWarnings: true,
  })
  connectFirestoreEmulator(db, host, Number(process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT || 8080))
  connectFunctionsEmulator(functions, host, Number(process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT || 5001))
  connectStorageEmulator(storage, host, Number(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT || 9199))
  emulatorState.__fomFirebaseEmulatorsConnected = true
}
export { app } // Adăugăm exportul explicit pentru app
export default app
