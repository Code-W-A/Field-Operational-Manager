import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

export async function POST(req: NextRequest) {
  try {
    const { lucrareId, token, email, code } = await req.json()
    if (!lucrareId || !token || !email || !code || !isValidEmail(String(email))) {
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau email invalid." }, { status: 400 })
    }

    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) {
      return NextResponse.json({ status: "invalid", message: "Lucrarea nu există." }, { status: 404 })
    }

    const data: any = workSnap.data()
    if (!data.offerActionToken || data.offerActionToken !== token) {
      return NextResponse.json({ status: "invalid", message: "Link invalid sau utilizat." }, { status: 400 })
    }
    if (data.offerActionUsedAt) {
      return NextResponse.json({ status: "used", message: "Oferta a fost deja acceptată sau refuzată." }, { status: 409 })
    }
    const exp = data.offerActionExpiresAt ? (
      typeof data.offerActionExpiresAt.toDate === "function" ? data.offerActionExpiresAt.toDate() : new Date(data.offerActionExpiresAt)
    ) : null
    if (exp && Date.now() > exp.getTime()) {
      return NextResponse.json({ status: "expired", message: "Link expirat." }, { status: 410 })
    }

    const verification = data.offerActionVerification || {}
    const cleanEmail = String(email).trim().toLowerCase()
    if (!verification?.codeHash || !verification?.email || verification.email !== cleanEmail) {
      return NextResponse.json({ status: "invalid_code", message: "Cod invalid sau email diferit." }, { status: 400 })
    }

    const expiresAt = verification.codeExpiresAt
      ? (typeof verification.codeExpiresAt.toDate === "function" ? verification.codeExpiresAt.toDate() : new Date(verification.codeExpiresAt))
      : null
    if (!expiresAt || Date.now() > expiresAt.getTime()) {
      return NextResponse.json({ status: "code_expired", message: "Cod expirat." }, { status: 410 })
    }

    const crypto = await import("crypto")
    const codeHash = crypto.createHash("sha256").update(`${String(code).trim().toUpperCase()}:${cleanEmail}`).digest("hex")
    if (codeHash !== verification.codeHash) {
      return NextResponse.json({ status: "invalid_code", message: "Cod invalid." }, { status: 400 })
    }

    await workRef.update({
      "offerActionVerification.verifiedAt": new Date(),
    })

    return NextResponse.json({ status: "verified", email: cleanEmail })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        message: "Eroare server la verificarea codului.",
        error: { message: String(error?.message || error) },
      },
      { status: 500 },
    )
  }
}
