import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { logOfferEvent } from "@/lib/offer/offer-events.server"

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const REISSUE_IDEMPOTENCY_WINDOW_MS = 30 * 1000

function toDate(value: any): Date | null {
  if (!value) return null
  try {
    if (typeof value?.toDate === "function") {
      const d = value.toDate()
      return Number.isNaN(d.getTime()) ? null : d
    }
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function buildBaseUrl(req: NextRequest): string {
  const envBase = process.env.NEXT_PUBLIC_APP_URL
  const proto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || ""
  const headerBase = host ? `${proto}://${host}` : ""
  const rawBase = envBase || headerBase || ""
  if (!rawBase) return ""
  if (!rawBase.startsWith("http://") && !rawBase.startsWith("https://")) {
    return `https://${rawBase}`
  }
  return rawBase
}

type ReissueTxResult =
  | { kind: "not_found" }
  | { kind: "invalid" }
  | { kind: "used" }
  | { kind: "reused"; token: string; expiresAt: Date }
  | { kind: "reissued"; token: string; expiresAt: Date }

// Public endpoint used by recipients to regenerate a fresh offer action token,
// when they reach the page with a token that is expired/used/invalid.
// Requires the current lucrareId and the last token they received.
export async function POST(req: NextRequest) {
  try {
    const { lucrareId, token } = await req.json()
    const workId = String(lucrareId || "").trim()
    const providedToken = String(token || "").trim()
    if (!workId || !providedToken) {
      return NextResponse.json({ error: "Parametri lipsă." }, { status: 400 })
    }

    const crypto = await import("crypto")
    const workRef = adminDb.collection("lucrari").doc(workId)

    const txResult = await adminDb.runTransaction<ReissueTxResult>(async (tx) => {
      const workSnap = await tx.get(workRef)
      if (!workSnap.exists) return { kind: "not_found" }

      const data: any = workSnap.data() || {}
      if (data.offerActionUsedAt) return { kind: "used" }

      const currentToken = typeof data.offerActionToken === "string" ? data.offerActionToken : ""
      if (!currentToken) return { kind: "invalid" }

      const now = new Date()
      const existingExpiry = toDate(data.offerActionExpiresAt)
      const fallbackExpiry = new Date(now.getTime() + TOKEN_TTL_MS)
      const previousToken = typeof data.offerActionPreviousToken === "string" ? data.offerActionPreviousToken : ""
      const lastReissueAt = toDate(data.offerActionReissuedAt)
      const withinWindow =
        !!lastReissueAt && now.getTime() - lastReissueAt.getTime() <= REISSUE_IDEMPOTENCY_WINDOW_MS

      if (providedToken !== currentToken) {
        // Idempotency for parallel retries with the old token.
        if (withinWindow && previousToken && providedToken === previousToken) {
          return { kind: "reused", token: currentToken, expiresAt: existingExpiry || fallbackExpiry }
        }
        return { kind: "invalid" }
      }

      // If link was just reissued moments ago, reuse the latest token to avoid churn.
      if (withinWindow) {
        return { kind: "reused", token: currentToken, expiresAt: existingExpiry || fallbackExpiry }
      }

      const newToken = crypto.randomBytes(24).toString("base64url")
      const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS)

      tx.update(workRef, {
        offerActionToken: newToken,
        offerActionPreviousToken: currentToken,
        offerActionExpiresAt: expiresAt,
        offerActionReissuedAt: now,
        offerActionReissueCount: Number(data.offerActionReissueCount || 0) + 1,
        offerActionVerification: null,
      })

      return { kind: "reissued", token: newToken, expiresAt }
    })

    if (txResult.kind === "not_found") {
      return NextResponse.json({ error: "Lucrarea nu există." }, { status: 404 })
    }
    if (txResult.kind === "used") {
      return NextResponse.json({ error: "Link deja folosit. Nu se poate reemite." }, { status: 409 })
    }
    if (txResult.kind === "invalid") {
      return NextResponse.json({ error: "Link invalid." }, { status: 400 })
    }

    const base = buildBaseUrl(req)
    const acceptUrl = `${base}/offer/${encodeURIComponent(workId)}?t=${encodeURIComponent(txResult.token)}&action=accept`
    const rejectUrl = `${base}/offer/${encodeURIComponent(workId)}?t=${encodeURIComponent(txResult.token)}&action=reject`

    if (txResult.kind === "reissued") {
      const workSnap = await workRef.get()
      const reissueCount = Number((workSnap.data() as any)?.offerActionReissueCount || 0)
      await logOfferEvent(
        {
          type: "OFFER_TOKEN_REISSUED",
          source: "lucrari",
          status: "reissued",
          lucrareId: workId,
          actorType: "portal_client",
          token: txResult.token,
          payload: { reissueCount, expiresAt: txResult.expiresAt.toISOString() },
        },
        req,
      )
    }

    return NextResponse.json({
      acceptUrl,
      rejectUrl,
      expiresAt: txResult.expiresAt,
      reissued: txResult.kind === "reissued",
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message || error), name: error?.name, code: error?.code, stack: error?.stack },
      { status: 500 }
    )
  }
}
