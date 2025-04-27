import { NextResponse } from "next/server"
import { getAuth } from "firebase-admin/auth"

export async function POST(request: Request) {
  try {
    const { userId, newPassword } = await request.json()

    if (!userId || !newPassword) {
      return NextResponse.json({ error: "ID-ul utilizatorului și noua parolă sunt obligatorii" }, { status: 400 })
    }

    // Validare parolă
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Parola trebuie să aibă minim 8 caractere" }, { status: 400 })
    }

    // Actualizăm parola utilizatorului în Firebase Auth
    await getAuth().updateUser(userId, {
      password: newPassword,
    })

    // Adăugăm un log pentru actualizarea parolei
    const timestamp = new Date().toISOString()
    const logData = {
      timestamp,
      actiune: "Resetare parolă",
      detalii: `Parola utilizatorului cu ID ${userId} a fost resetată`,
      utilizator: "Administrator",
      utilizatorId: "system",
      tip: "Informație",
      categorie: "Autentificare",
    }

    // Returnăm un răspuns de succes
    return NextResponse.json({ success: true, message: "Parola a fost actualizată cu succes" })
  } catch (error: any) {
    console.error("Eroare la actualizarea parolei:", error)

    // Gestionăm erorile specifice Firebase Auth
    if (error.code === "auth/user-not-found") {
      return NextResponse.json({ error: "Utilizatorul nu a fost găsit" }, { status: 404 })
    }

    if (error.code === "auth/invalid-password") {
      return NextResponse.json({ error: "Parola nu îndeplinește cerințele de securitate" }, { status: 400 })
    }

    return NextResponse.json({ error: "A apărut o eroare la actualizarea parolei" }, { status: 500 })
  }
}
