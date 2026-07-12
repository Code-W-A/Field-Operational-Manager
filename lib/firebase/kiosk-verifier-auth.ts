"use client"

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app"
import {
  connectAuthEmulator,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from "firebase/auth"
import { assertSafeFirebaseEmulatorProject, shouldUseFirebaseEmulators } from "./emulator-safety"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const SECONDARY_APP_NAME = "kioskVerifier"

function getSecondaryApp(): FirebaseApp {
  // firebase/app doesn't expose "getApp(name)" typing reliably across versions, so guard manually.
  const existing = getApps().find((a) => a.name === SECONDARY_APP_NAME)
  return existing ?? initializeApp(firebaseConfig, SECONDARY_APP_NAME)
}

let authSecondary: Auth | null = null
let persistenceReady: Promise<void> | null = null

function getSecondaryAuth(): Auth {
  if (authSecondary) return authSecondary
  // Ensure the app exists (either by name or default getApp path).
  const app = (() => {
    try {
      return getApp(SECONDARY_APP_NAME)
    } catch {
      return getSecondaryApp()
    }
  })()
  authSecondary = getAuth(app)
  if (shouldUseFirebaseEmulators()) {
    assertSafeFirebaseEmulatorProject(firebaseConfig.projectId)
    const host = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "127.0.0.1"
    connectAuthEmulator(
      authSecondary,
      `http://${host}:${Number(process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT || 9099)}`,
      { disableWarnings: true },
    )
  }
  return authSecondary
}

async function ensureInMemoryPersistence() {
  if (persistenceReady) return persistenceReady
  const auth = getSecondaryAuth()
  persistenceReady = setPersistence(auth, inMemoryPersistence).then(() => undefined)
  return persistenceReady
}

/**
 * Verify that the provided email+password are valid, without affecting the main app auth session.
 * Throws on failure.
 */
export async function verifyUserPassword(email: string, password: string): Promise<void> {
  if (!email) throw new Error("Email lipsă pentru utilizator.")
  if (!password) throw new Error("Parola este obligatorie.")

  const auth = getSecondaryAuth()
  await ensureInMemoryPersistence()

  try {
    await signInWithEmailAndPassword(auth, email, password)
  } finally {
    // Always sign out secondary auth to avoid leaving a shadow session around.
    try {
      await signOut(auth)
    } catch {
      // ignore
    }
  }
}
