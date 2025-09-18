import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  sendPasswordResetEmail,
  type User,
} from "firebase/auth"
import { auth, db } from "./config"
import { doc, setDoc, serverTimestamp, deleteDoc } from "firebase/firestore"

// Tipuri pentru autentificare
export type UserRole = "admin" | "dispecer" | "tehnician" | "client"

export interface UserData {
  uid: string
  email: string | null
  displayName: string | null
  role: UserRole
  phoneNumber?: string
  telefon?: string
  // Client access: multiple clients with multiple locations
  clientAccess?: Array<{ clientId: string; locationNames: string[] }>
  createdAt?: Date
  lastLogin?: Date
}

// Înregistrare utilizator nou
export const registerUser = async (
  email: string,
  password: string,
  displayName: string,
  role: UserRole,
  phoneNumber?: string,
  clientAccess?: Array<{ clientId: string; locationNames: string[] }>,
): Promise<UserData> => {
  try {
    // Creăm utilizatorul în Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    // Actualizăm profilul utilizatorului
    await updateProfile(user, { displayName })

    // Creăm documentul utilizatorului în Firestore
    const userData: UserData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      role,
      phoneNumber,
      // keep legacy field in Firestore for backward compatibility
      telefon: phoneNumber,
      clientAccess: clientAccess || [],
      createdAt: new Date(),
      lastLogin: new Date(),
    }

    await setDoc(doc(db, "users", user.uid), {
      ...userData,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
    })

    // Adăugăm un log pentru crearea utilizatorului
    await addAuthLog("Creare utilizator", `Utilizatorul ${displayName} a fost creat`, user)

    return userData
  } catch (error) {
    console.error("Eroare la înregistrarea utilizatorului:", error)
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
    throw error
  }
}

// Resetare parolă
export const resetPassword = async (email: string): Promise<void> => {
  try {
    return sendPasswordResetEmail(auth, email)
  } catch (error) {
    console.error("Eroare la resetarea parolei:", error)
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
  }
}
