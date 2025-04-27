import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"
import { adminAuth } from "@/lib/firebase/admin"

export async function POST(request: Request) {
  try {
    // Parse the request body
    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    }

    const { userId, newPassword } = body

    if (!userId || !newPassword) {
      return NextResponse.json({ error: "ID-ul utilizatorului și noua parolă sunt obligatorii" }, { status: 400 })
    }

    // Ensure Firebase Admin is initialized
    if (!adminAuth) {
      console.error("Firebase Admin is not initialized")
      return NextResponse.json({ error: "Serviciul de autentificare nu este disponibil" }, { status: 500 })
    }

    // Actualizăm parola utilizatorului în Firebase Auth
    try {
      await getAuth().updateUser(userId, {
        password: newPassword,
      })
    } catch (firebaseError: any) {
      console.error("Firebase Auth error:", firebaseError)

      // Handle specific Firebase errors
      if (firebaseError.code === "auth/user-not-found") {
        return NextResponse.json({ error: "Utilizatorul nu a fost găsit" }, { status: 404 })
      }

      if (firebaseError.code === "auth/invalid-password") {
        return NextResponse.json({ error: "Parola nu este validă" }, { status: 400 })
      }

      // Generic error
      return NextResponse.json(
        {
          error: "Eroare la actualizarea parolei",
          details: firebaseError.message,
        },
        { status: 500 },
      )
    }

    // Returnăm un răspuns de succes
    return NextResponse.json({ success: true, message: "Parola a fost actualizată cu succes" })
  } catch (error: any) {
    console.error("Unexpected error in update-password route:", error)
    return NextResponse.json(
      {
        error: "A apărut o eroare neașteptată",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
