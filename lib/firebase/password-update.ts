import { getAuth, signInWithCustomToken, updatePassword } from "firebase/auth"
import { collection, addDoc } from "firebase/firestore"
import { db } from "./config"

export async function updateUserPassword(userId: string, newPassword: string) {
  try {
    // Step 1: Get a custom token from our API
    const tokenResponse = await fetch("/api/auth/custom-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uid: userId }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      throw new Error(errorData.error || `Server error: ${tokenResponse.status}`)
    }

    const { token } = await tokenResponse.json()
    if (!token) {
      throw new Error("No token received from server")
    }

    // Step 2: Sign in with the custom token
    const auth = getAuth()
    const userCredential = await signInWithCustomToken(auth, token)
    const user = userCredential.user

    // Step 3: Update the password
    await updatePassword(user, newPassword)

    // Step 4: Log the action
    await addDoc(collection(db, "logs"), {
      timestamp: new Date(),
      action: "Resetare parolă",
      details: `Parola utilizatorului cu ID ${userId} a fost resetată`,
      user: "Administrator",
      userId: "system",
      type: "Informație",
      category: "Autentificare",
    })

    return { success: true, message: "Parola a fost actualizată cu succes" }
  } catch (error: any) {
    console.error("Error updating password:", error)
    throw new Error(error.message || "A apărut o eroare la actualizarea parolei")
  }
}
