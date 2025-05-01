import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

// Configurația pentru Firebase Admin SDK
const firebaseAdminConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
}

// Funcție pentru inițializarea Firebase Admin SDK
export const initializeFirebaseAdminApp = () => {
  const apps = getApps()

  if (apps.length === 0) {
    return initializeApp({
      credential: cert(firebaseAdminConfig),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    })
  }

  return apps[0]
}

// Inițializăm Firebase Admin SDK
export const adminApp = initializeFirebaseAdminApp()

// Exportăm serviciile Firebase Admin
export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
