import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type User,
} from "firebase/auth"
import { reportToSentry } from "@/lib/sentry/report-error"
import { auth, db } from "./config"
import { doc, setDoc, serverTimestamp } from "firebase/firestore"

// Tipuri pentru autentificare
export type UserRole = "admin" | "dispecer" | "tehnician" | "client" | "kiosk"

export interface OfficeLocation {
  lat: number
  lng: number
  address: string
}

export interface UserData {
  uid: string
  email: string | null
  displayName: string | null
  role: UserRole
  phoneNumber?: string
  telefon?: string
  notes?: string
  // Client access: multiple clients with multiple locations
  clientAccess?: Array<{ clientId: string; locationNames: string[] }>
  // Kiosk mode - prevents auto-logout
  isKioskMode?: boolean
  /** 4-digit PIN used at kiosk check-in/out identity verification */
  kioskPin?: string
  // Office location for GPS verification
  officeLocation?: OfficeLocation
  createdAt?: Date
  lastLogin?: Date
  updatedAt?: Date
  /** ID-uri documente din colecția technician_groups (doar rol tehnician) */
  technicianGroupIds?: string[]
}

// Înregistrare utilizator nou
export const registerUser = async (
  email: string,
  password: string,
  displayName: string,
  role: UserRole,
  phoneNumber?: string,
  clientAccess?: Array<{ clientId: string; locationNames: string[] }>,
  technicianGroupIds?: string[],
  kioskPin?: string,
): Promise<UserData> => {
  try {
    // Creare cont prin API server-side (Admin SDK), pentru a evita conturi orfane în Auth.
    const response = await fetch("/api/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        displayName,
        role,
        phoneNumber,
        clientAccess: clientAccess || [],
        technicianGroupIds: Array.isArray(technicianGroupIds) ? technicianGroupIds : [],
        ...(typeof kioskPin === "string" && kioskPin.trim() ? { kioskPin: kioskPin.trim() } : {}),
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      const error = new Error(data?.error || "A apărut o eroare la înregistrarea utilizatorului")
      ;(error as any).code = data?.code
      throw error
    }

    return data?.user as UserData
  } catch (error) {
    console.error("Eroare la înregistrarea utilizatorului:", error)
    reportToSentry(error, { tags: { area: "firebase-auth", op: "register-user" } })
    throw error
  }
}

// Autentificare utilizator
export const signIn = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)

    // Adăugăm un log pentru autentificare
    await addAuthLog("Autentificare", "Autentificare reușită", userCredential.user)

    return userCredential.user
  } catch (error) {
    console.error("Eroare la autentificare:", error)
    reportToSentry(error, {
      tags: { area: "firebase-auth", op: "sign-in" },
      extra: { code: (error as { code?: string })?.code },
    })
    throw error
  }
}

// Deconectare utilizator
export const signOut = async (): Promise<void> => {
  try {
    const user = auth.currentUser
    if (user) {
      await addAuthLog("Deconectare", "Deconectare reușită", user)
    }
    return firebaseSignOut(auth)
  } catch (error) {
    console.error("Eroare la deconectare:", error)
    reportToSentry(error, { tags: { area: "firebase-auth", op: "sign-out" } })
    throw error
  }
}

// Resetare parolă
export const resetPassword = async (email: string): Promise<void> => {
  try {
    return sendPasswordResetEmail(auth, email)
  } catch (error) {
    console.error("Eroare la resetarea parolei:", error)
    reportToSentry(error, { tags: { area: "firebase-auth", op: "reset-password" } })
    throw error
  }
}

// Ștergere utilizator
export const deleteUserAccount = async (userId: string): Promise<void> => {
  try {
    // Folosim endpoint-ul server pentru a șterge din Authentication și Firestore
    const response = await fetch("/api/users/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data?.error || "Ștergerea utilizatorului a eșuat")
    }

    // Adăugăm un log client-side best-effort (server-ul deja loghează)
    await addAuthLog("Ștergere utilizator", `Utilizatorul cu ID ${userId} a fost șters (via API)`, null)

    return Promise.resolve()
  } catch (error) {
    console.error("Eroare la ștergerea utilizatorului:", error)
    reportToSentry(error, { tags: { area: "firebase-auth", op: "delete-user" } })
    throw error
  }
}

// Actualizare email utilizator - versiune actualizată care folosește API-ul
export const updateUserEmail = async (userId: string, newEmail: string): Promise<void> => {
  try {
    // Apelăm API-ul pentru a actualiza email-ul
    const response = await fetch("/api/users/update-email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, newEmail }),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "A apărut o eroare la actualizarea email-ului")
    }

    return Promise.resolve()
  } catch (error) {
    console.error("Eroare la actualizarea email-ului utilizatorului:", error)
    reportToSentry(error, { tags: { area: "firebase-auth", op: "update-user-email" } })
    throw error
  }
}

// Modificăm funcția addAuthLog pentru a elimina câmpul ip
const addAuthLog = async (actiune: string, detalii: string, user: User | null): Promise<void> => {
  try {
    const logRef = doc(db, "logs", `auth_${Date.now()}`)
    await setDoc(logRef, {
      timestamp: serverTimestamp(),
      utilizator: user?.displayName || user?.email || "Sistem",
      utilizatorId: user?.uid || "system",
      actiune,
      detalii,
      tip: "Informație",
      categorie: "Autentificare",
    })
  } catch (error) {
    console.error("Eroare la adăugarea logului:", error)
    reportToSentry(error, { tags: { area: "firebase-auth", op: "add-auth-log" } })
  }
}
