import { NextResponse, type NextRequest } from "next/server"
import { FieldValue, Timestamp } from "firebase-admin/firestore"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { resolveKioskPinForSave } from "@/lib/attendance/kiosk-pin"

const ALLOWED_ROLES = new Set(["admin", "dispecer", "tehnician", "client", "kiosk"])

export async function POST(request: NextRequest) {
  let createdUid: string | null = null

  try {
    const body = await request.json()
    const rawEmail = typeof body?.email === "string" ? body.email.trim() : ""
    const rawPassword = typeof body?.password === "string" ? body.password : ""
    const rawDisplayName = typeof body?.displayName === "string" ? body.displayName.trim() : ""
    const rawRole = typeof body?.role === "string" ? body.role : ""
    const rawPhoneNumber = typeof body?.phoneNumber === "string" ? body.phoneNumber.trim() : ""
    const rawNotes = typeof body?.notes === "string" ? body.notes : ""
    const rawClientAccess = Array.isArray(body?.clientAccess) ? body.clientAccess : []
    const rawTechnicianGroupIds = Array.isArray(body?.technicianGroupIds)
      ? body.technicianGroupIds.map((id: unknown) => String(id || "").trim()).filter(Boolean)
      : []
    const rawKioskPin = typeof body?.kioskPin === "string" ? body.kioskPin.trim() : ""

    if (!rawEmail || !rawPassword || !rawDisplayName || !rawRole) {
      return NextResponse.json({ error: "Date obligatorii lipsă" }, { status: 400 })
    }

    if (!ALLOWED_ROLES.has(rawRole)) {
      return NextResponse.json({ error: "Rol invalid" }, { status: 400 })
    }

    if (rawPassword.length < 6) {
      return NextResponse.json({ error: "Parola trebuie să aibă cel puțin 6 caractere" }, { status: 400 })
    }

    let kioskPin: string | null = null
    try {
      kioskPin = resolveKioskPinForSave({ role: rawRole, kioskPin: rawKioskPin })
    } catch (pinError) {
      return NextResponse.json(
        { error: pinError instanceof Error ? pinError.message : "PIN kiosk invalid" },
        { status: 400 },
      )
    }

    const authUser = await adminAuth.createUser({
      email: rawEmail,
      password: rawPassword,
      displayName: rawDisplayName,
    })
    createdUid = authUser.uid

    const now = Timestamp.now()
    const userDoc: Record<string, unknown> = {
      uid: authUser.uid,
      email: authUser.email ?? rawEmail,
      displayName: authUser.displayName ?? rawDisplayName,
      role: rawRole,
      phoneNumber: rawPhoneNumber,
      telefon: rawPhoneNumber,
      notes: rawNotes,
      clientAccess: rawRole === "client" ? rawClientAccess : [],
      ...(rawRole === "kiosk" ? { isKioskMode: true } : {}),
      ...(rawRole === "tehnician" && rawTechnicianGroupIds.length > 0
        ? { technicianGroupIds: rawTechnicianGroupIds }
        : {}),
      ...(kioskPin ? { kioskPin } : {}),
      createdAt: FieldValue.serverTimestamp(),
      lastLogin: FieldValue.serverTimestamp(),
    }

    await adminDb.collection("users").doc(authUser.uid).set(userDoc)

    try {
      await adminDb.collection("logs").doc(`auth_create_${Date.now()}`).set({
        timestamp: now,
        utilizator: "Admin",
        utilizatorId: "system",
        actiune: "Creare utilizator",
        detalii: `Utilizatorul ${userDoc.displayName} (${userDoc.email}) a fost creat.`,
        tip: "Informație",
        categorie: "Utilizatori",
      })
    } catch (logError) {
      console.error("Eroare la logarea creării utilizatorului:", logError)
    }

    const responseUser = {
      uid: userDoc.uid,
      email: userDoc.email,
      displayName: userDoc.displayName,
      role: userDoc.role,
      phoneNumber: rawPhoneNumber,
      telefon: rawPhoneNumber,
      notes: rawNotes,
      clientAccess: userDoc.clientAccess,
      ...(rawRole === "kiosk" ? { isKioskMode: true } : {}),
      ...(rawRole === "tehnician" && rawTechnicianGroupIds.length > 0
        ? { technicianGroupIds: rawTechnicianGroupIds }
        : {}),
      ...(kioskPin ? { kioskPin } : {}),
    }

    return NextResponse.json({ success: true, user: responseUser })
  } catch (error: any) {
    console.error("Eroare la crearea utilizatorului:", error)

    // Rollback pentru a evita conturi orfane în Authentication când Firestore eșuează.
    if (createdUid) {
      try {
        await adminDb.collection("users").doc(createdUid).delete()
      } catch (firestoreCleanupError) {
        console.error("Eroare la cleanup Firestore:", firestoreCleanupError)
      }

      try {
        await adminAuth.deleteUser(createdUid)
      } catch (authCleanupError) {
        console.error("Eroare la cleanup Auth:", authCleanupError)
      }
    }

    const code = typeof error?.code === "string" ? error.code : undefined
    const status = code?.startsWith("auth/") ? 400 : 500
    return NextResponse.json(
      {
        error: "A apărut o eroare la crearea utilizatorului",
        code,
        details: error?.message || "unknown",
      },
      { status },
    )
  }
}
