import { getAuth } from "firebase-admin/auth"
import { db } from "@/lib/firebase/config"
import { collection, addDoc } from "firebase/firestore"

export async function POST(request: Request) {
  try {
    // Parse the request body
    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error("Failed to parse request body:", e)
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { userId, newPassword } = body

    if (!userId || !newPassword) {
      return new Response(JSON.stringify({ error: "ID-ul utilizatorului și noua parolă sunt obligatorii" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    try {
      // Use the Firebase Admin SDK to update the user's password
      await getAuth().updateUser(userId, {
        password: newPassword,
      })

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
      } catch (logError) {
        console.error("Error logging password reset:", logError)
        // Continue even if logging fails
      }

      return new Response(JSON.stringify({ success: true, message: "Parola a fost actualizată cu succes" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    } catch (firebaseError: any) {
      console.error("Firebase Auth error:", firebaseError)

      // Handle specific Firebase errors
      if (firebaseError.code === "auth/user-not-found") {
        return new Response(JSON.stringify({ error: "Utilizatorul nu a fost găsit" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response(
        JSON.stringify({
          error: "Eroare la actualizarea parolei",
          details: firebaseError.message,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      )
    }
  } catch (error: any) {
    console.error("Unexpected error in reset-password route:", error)

    return new Response(
      JSON.stringify({
        error: "A apărut o eroare neașteptată",
        details: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
}
