import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"

export async function POST(req: NextRequest) {
  try {
    const { lucrareId } = await req.json()
    if (!lucrareId) return NextResponse.json({ error: "lucrareId lipsă" }, { status: 400 })

    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) return NextResponse.json({ error: "Lucrarea nu există" }, { status: 404 })

    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 zile

    await workRef.update({
      offerActionToken: token,
      offerActionExpiresAt: expiresAt,
      offerActionUsedAt: null,
    })

    const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")
    const acceptUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(token)}&action=accept`
    const rejectUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(token)}&action=reject`

    return NextResponse.json({ token, acceptUrl, rejectUrl, expiresAt })
  } catch (e) {
    console.error("Mint offer token failed:", e)
    return NextResponse.json({ error: "Eroare server" }, { status: 500 })
  }
}
