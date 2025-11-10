import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"

// Public endpoint used by recipients to regenerate a fresh offer action token,
// when they reach the page with a token that is expired/used/invalid.
// Requires the current lucrareId and the last token they received.
export async function POST(req: NextRequest) {
  try {
    const { lucrareId, token } = await req.json()
    if (!lucrareId || !token) {
      return NextResponse.json({ error: "Parametri lipsă." }, { status: 400 })
    }

    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) {
      return NextResponse.json({ error: "Lucrarea nu există." }, { status: 404 })
    }
    const data: any = workSnap.data()

    // For safety, require that the caller proves knowledge of the last token
    if (!data.offerActionToken || data.offerActionToken !== token) {
      return NextResponse.json({ error: "Link invalid." }, { status: 400 })
    }

    // Do NOT allow reissue after the link was already used
    if (data.offerActionUsedAt) {
      return NextResponse.json({ error: "Link deja folosit. Nu se poate reemite." }, { status: 409 })
    }

    // Issue a fresh token and push expiration (keep usedAt null)
    const newToken = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now

    await workRef.update({
      offerActionToken: newToken,
      offerActionExpiresAt: expiresAt,
      offerActionReissueCount: (data.offerActionReissueCount || 0) + 1,
    })

    const base = process.env.NEXT_PUBLIC_APP_URL || ""
    const acceptUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(newToken)}&action=accept`
    const rejectUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(newToken)}&action=reject`

    return NextResponse.json({ acceptUrl, rejectUrl, expiresAt })
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message || error), name: error?.name, code: error?.code, stack: error?.stack },
      { status: 500 }
    )
  }
}


