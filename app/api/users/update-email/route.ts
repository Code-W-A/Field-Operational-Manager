import { type NextRequest, NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export async function POST(request: NextRequest) {
  try {
    // Obținem datele din cerere
    const { userId, newEmail } = await request.json()

    if (!userId || !newEmail) {
      return NextResponse.json({ error: "ID-ul utilizatorului și email-ul nou sunt obligatorii" }, { status: 400 })
    }

    // Verificăm dacă email-ul nou este deja utilizat
    try {
      const userByEmail = await adminAuth.getUserByEmail(newEmail)
      if (userByEmail && userByEmail.uid !== userId) {
        return NextResponse.json({ error: "Acest email este deja utilizat de alt cont" }, { status: 400 })
      }
    } catch (error: any) {
      // Dacă eroarea este auth/user-not-found, înseamnă că email-ul nu este utilizat
      if (error.code !== "auth/user-not-found") {
        throw error
      }
    }

    // Actualizăm email-ul în Firebase Authentication
    await adminAuth.updateUser(userId, {
      email: newEmail,
    })

    // Actualizăm email-ul în Firestore folosind Admin SDK
    const userRef = adminDb.collection("users").doc(userId)
    await userRef.update({
      email: newEmail,
      updatedAt: new Date(),
    })

    // Adăugăm un log pentru actualizarea email-ului
    const logRef = adminDb.collection("logs").doc(`email_update_${Date.now()}`)
    await logRef.set({
      timestamp: new Date(),
      utilizator: "Admin",
      utilizatorId: "system",
      actiune: "Actualizare email",
      detalii: `Email-ul utilizatorului cu ID ${userId} a fost actualizat la ${newEmail}`,
      tip: "Informație",
      categorie: "Utilizatori",
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Eroare la actualizarea email-ului:", error)

    // Returnăm un mesaj de eroare specific
    if (error.code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Acest email este deja utilizat de alt cont" }, { status: 400 })
    }

    return NextResponse.json({ error: "A apărut o eroare la actualizarea email-ului" }, { status: 500 })
  }
}
