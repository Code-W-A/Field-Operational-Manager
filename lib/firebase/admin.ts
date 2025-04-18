import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

// Verificăm dacă aplicația Firebase Admin este deja inițializată
const apps = getApps()

// Configurația pentru Firebase Admin SDK
const firebaseAdminConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ? process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
}

// Inițializăm Firebase Admin SDK doar dacă nu a fost deja inițializat
export const adminApp =
  apps.length === 0
    ? initializeApp({
        credential: cert(firebaseAdminConfig),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      })
    : apps[0]

// Exportăm serviciile Firebase Admin
export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
