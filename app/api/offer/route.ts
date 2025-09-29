import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"

export async function POST(req: NextRequest) {
  try {
    const { lucrareId, snapshot } = await req.json()
    if (!lucrareId) return NextResponse.json({ error: "lucrareId lipsă" }, { status: 400 })

    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) return NextResponse.json({ error: "Lucrarea nu există" }, { status: 404 })

    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 zile

    const updateData: Record<string, any> = {
      offerActionToken: token,
      offerActionExpiresAt: expiresAt,
      offerActionUsedAt: null,
    }
    // Persist optional snapshot of the offer being sent so we can later show exactly what was accepted
    if (snapshot && typeof snapshot === 'object') {
      updateData.offerActionSnapshot = snapshot
      updateData.offerActionVersionSavedAt = snapshot.savedAt || new Date().toISOString()
    }
    await workRef.update(updateData)

    // Build absolute base URL for email links (works on server): prefer env, then headers
    const envBase = process.env.NEXT_PUBLIC_APP_URL
    const proto = req.headers.get("x-forwarded-proto") || "https"
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || ""
    const headerBase = host ? `${proto}://${host}` : ""
    const rawBase = envBase || headerBase
    const base = rawBase && !rawBase.startsWith("http://") && !rawBase.startsWith("https://")
      ? `https://${rawBase}`
      : rawBase
    const acceptUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(token)}&action=accept`
    const rejectUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(token)}&action=reject`

    return NextResponse.json({ token, acceptUrl, rejectUrl, expiresAt })
  } catch (e) {
    console.error("Mint offer token failed:", e)
    return NextResponse.json({ error: "Eroare server" }, { status: 500 })
  }
}
