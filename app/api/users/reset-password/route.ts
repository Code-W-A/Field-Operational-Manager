import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { initializeFirebaseAdminApp } from "@/lib/firebase/admin"
import { collection, addDoc } from "firebase/firestore"
import { db } from "@/lib/firebase/config"

// Initialize Firebase Admin if not already initialized
initializeFirebaseAdminApp()

export async function POST(request: Request) {
  console.log("Password reset API called")

  try {
    // Parse the request body
    let body
    try {
      body = await request.json()
      console.log("Request body parsed successfully")
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { userId, newPassword } = body

    if (!userId || !newPassword) {
      console.error("Missing required fields:", { userId: !!userId, newPassword: !!newPassword })
      return NextResponse.json({ error: "ID-ul utilizatorului și noua parolă sunt obligatorii" }, { status: 400 })
    }

    console.log(`Attempting to reset password for user ID: ${userId}`)

    try {
      // First verify the user exists
      try {
        const userRecord = await getAuth().getUser(userId)
        console.log(`User found: ${userRecord.uid}`)
      } catch (userError) {
        console.error("User not found:", userError)
        return NextResponse.json({ error: "Utilizatorul nu a fost găsit" }, { status: 404 })
      }

      // Update the user's password
      await getAuth().updateUser(userId, {
        password: newPassword,
      })

      console.log("Password updated successfully")

      // Log the password reset action
      try {
        await addDoc(collection(db, "logs"), {
          timestamp: new Date(),
          action: "Resetare parolă",
          details: `Parola utilizatorului cu ID ${userId} a fost resetată`,
          user: "Administrator",
          userId: "system",
          type: "Informație",
          category: "Autentificare",
        })
        console.log("Password reset logged successfully")
      } catch (logError) {
        console.error("Error logging password reset:", logError)
        // Continue even if logging fails
      }

      return NextResponse.json({ success: true, message: "Parola a fost actualizată cu succes" }, { status: 200 })
    } catch (firebaseError: any) {
      console.error("Firebase Auth error:", firebaseError)

      // Handle specific Firebase errors
      if (firebaseError.code === "auth/user-not-found") {
        return NextResponse.json({ error: "Utilizatorul nu a fost găsit" }, { status: 404 })
      }

      if (firebaseError.code === "auth/invalid-password") {
        return NextResponse.json({ error: "Parola nu îndeplinește cerințele minime de securitate" }, { status: 400 })
      }

      return NextResponse.json(
        {
          error: "Eroare la actualizarea parolei",
          details: firebaseError.message,
          code: firebaseError.code,
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Unexpected error in reset-password route:", error)

    return NextResponse.json(
      {
        error: "A apărut o eroare neașteptată",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
