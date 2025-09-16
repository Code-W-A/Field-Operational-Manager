import { type NextRequest, NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export async function POST(request: NextRequest) {
  try {
    const { userId } = await request.json()

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "ID-ul utilizatorului este obligatoriu" }, { status: 400 })
    }

    // Încercăm să ștergem utilizatorul din Authentication și Firestore
    const results = await Promise.allSettled([
      adminAuth.deleteUser(userId),
      adminDb.collection("users").doc(userId).delete(),
    ])

    const authResult = results[0]
    const fsResult = results[1]

    // Log detaliat
    await adminDb.collection("logs").add({
      timestamp: new Date(),
      utilizator: "Admin",
      utilizatorId: "system",
      actiune: "Ștergere utilizator",
      detalii: `Ștergere cont UID=${userId} → auth: ${authResult.status}${authResult.status === "rejected" ? ` (${(authResult as PromiseRejectedResult).reason?.message || "error"})` : ""}, firestore: ${fsResult.status}${fsResult.status === "rejected" ? ` (${(fsResult as PromiseRejectedResult).reason?.message || "error"})` : ""}`,
      tip: "Informație",
      categorie: "Utilizatori",
    })

    // Dacă ambele au eșuat, returnăm 500; dacă cel puțin una a reușit, raportăm success parțial/total
    const bothFailed = results.every((r) => r.status === "rejected")
    if (bothFailed) {
      return NextResponse.json({ error: "Ștergerea utilizatorului a eșuat în totalitate" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Eroare la ștergerea utilizatorului:", error)
    return NextResponse.json({ error: "A apărut o eroare la ștergerea utilizatorului" }, { status: 500 })
  }
}
