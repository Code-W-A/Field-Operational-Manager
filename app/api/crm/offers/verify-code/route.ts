import { NextResponse, type NextRequest } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { logOfferEvent } from "@/lib/offer/offer-events.server"

const DEFAULT_MAX_VERIFY_ATTEMPTS = 5
const DEFAULT_LOCK_DURATION_MS = 15 * 60 * 1000
const RESPONSE_PROOF_TTL_MS = 10 * 60 * 1000

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  try {
    if (typeof (value as { toDate?: () => Date }).toDate === "function") {
      const date = (value as { toDate: () => Date }).toDate()
      return Number.isNaN(date.getTime()) ? null : date
    }
    const date = new Date(value as string | number | Date)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

type TxResult =
  | { kind: "verified"; email: string; verificationProof: string }
  | {
      kind: "error"
      status: "invalid" | "used" | "expired" | "code_expired" | "invalid_code" | "locked"
      statusCode: number
      message: string
      attemptsRemaining?: number
      retryAfterSec?: number
    }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const offerId = String(body?.offerId || "").trim()
    const token = String(body?.token || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()
    const code = String(body?.code || "").trim().toUpperCase()

    if (!offerId || !token || !email || !code || !isValidEmail(email)) {
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau email invalid." }, { status: 400 })
    }

    const now = new Date()
    const crypto = await import("crypto")
    const offerRef = adminDb.collection(CRM_COLLECTIONS.offers).doc(offerId)
    const txResult = await adminDb.runTransaction<TxResult>(async (tx) => {
      const offerSnap = await tx.get(offerRef)
      if (!offerSnap.exists) {
        return { kind: "error", status: "invalid", statusCode: 404, message: "Oferta nu există." }
      }

      const data = offerSnap.data() as Record<string, unknown>
      if (String(data.actionToken || "") !== token) {
        return { kind: "error", status: "invalid", statusCode: 400, message: "Link invalid sau utilizat." }
      }
      if (data.actionUsedAt || data.status === "ACCEPTED" || data.status === "REJECTED") {
        return { kind: "error", status: "used", statusCode: 409, message: "Oferta a fost deja procesată." }
      }

      const actionExpiresAt = toDate(data.actionExpiresAt)
      if (actionExpiresAt && now.getTime() > actionExpiresAt.getTime()) {
        tx.update(offerRef, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() })
        return { kind: "error", status: "expired", statusCode: 410, message: "Link expirat." }
      }

      const verification = (data.verification || {}) as Record<string, unknown>
      const verificationEmail = String(verification.email || "").trim().toLowerCase()
      const verificationCodeHash = String(verification.codeHash || "")
      if (!verificationCodeHash || !verificationEmail || verificationEmail !== email) {
        return {
          kind: "error",
          status: "invalid_code",
          statusCode: 400,
          message: "Cod invalid sau email diferit.",
        }
      }

      const lockUntil = toDate(verification.lockUntil)
      if (lockUntil && lockUntil.getTime() > now.getTime()) {
        return {
          kind: "error",
          status: "locked",
          statusCode: 429,
          message: "Prea multe încercări. Codul este blocat temporar.",
          retryAfterSec: Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 1000)),
        }
      }

      const codeExpiresAt = toDate(verification.codeExpiresAt)
      if (!codeExpiresAt || now.getTime() > codeExpiresAt.getTime()) {
        return { kind: "error", status: "code_expired", statusCode: 410, message: "Cod expirat." }
      }

      const version = Math.max(1, Number(verification.version || 1))
      const hash = crypto.createHash("sha256").update(`${code}:${email}:${version}`).digest("hex")
      const maxAttempts = Math.max(1, Number(verification.maxAttempts || DEFAULT_MAX_VERIFY_ATTEMPTS))
      const lockDurationMs = Math.max(1000, Number(verification.lockDurationMs || DEFAULT_LOCK_DURATION_MS))
      const attemptCount = Math.max(0, Number(verification.attemptCount || 0))

      if (hash !== verificationCodeHash) {
        const nextAttemptCount = attemptCount + 1
        const updates: Record<string, unknown> = {
          "verification.attemptCount": nextAttemptCount,
          "verification.lastAttemptAt": now,
          updatedAt: FieldValue.serverTimestamp(),
        }

        if (nextAttemptCount >= maxAttempts) {
          const nextLockUntil = new Date(now.getTime() + lockDurationMs)
          updates["verification.lockUntil"] = nextLockUntil
          tx.update(offerRef, updates)
          return {
            kind: "error",
            status: "locked",
            statusCode: 429,
            message: "Prea multe încercări. Codul este blocat temporar.",
            retryAfterSec: Math.max(1, Math.ceil((nextLockUntil.getTime() - now.getTime()) / 1000)),
          }
        }

        tx.update(offerRef, updates)
        return {
          kind: "error",
          status: "invalid_code",
          statusCode: 400,
          message: "Cod invalid. Dacă ai cerut un cod nou, folosește ultimul cod primit.",
          attemptsRemaining: maxAttempts - nextAttemptCount,
        }
      }

      const responseProof = crypto.randomBytes(24).toString("base64url")
      const responseProofHash = crypto.createHash("sha256").update(responseProof).digest("hex")
      tx.update(offerRef, {
        "verification.verifiedAt": now,
        "verification.attemptCount": 0,
        "verification.lockUntil": null,
        "verification.lastVerifiedAt": now,
        "verification.responseProofHash": responseProofHash,
        "verification.responseProofIssuedAt": now,
        "verification.responseProofExpiresAt": new Date(now.getTime() + RESPONSE_PROOF_TTL_MS),
        "verification.responseProofUsedAt": null,
        updatedAt: FieldValue.serverTimestamp(),
      })

      return { kind: "verified", email, verificationProof: responseProof }
    })

    if (txResult.kind === "error") {
      return NextResponse.json(
        {
          status: txResult.status,
          message: txResult.message,
          attemptsRemaining: txResult.attemptsRemaining,
          retryAfterSec: txResult.retryAfterSec,
        },
        { status: txResult.statusCode }
      )
    }

    let msSinceCodeSent: number | null = null
    let opportunityId = ""
    try {
      const offerSnap = await offerRef.get()
      const offerData = offerSnap.data() as Record<string, unknown>
      opportunityId = String(offerData?.opportunityId || "")
      const verification = (offerData?.verification || {}) as Record<string, unknown>
      const codeSentAt = toDate(verification?.codeSentAt)
      if (codeSentAt) msSinceCodeSent = Date.now() - codeSentAt.getTime()
    } catch {
      /* non-blocking */
    }

    await logOfferEvent(
      {
        type: "OFFER_CODE_VERIFIED",
        source: "crm",
        status: "verified",
        offerId,
        opportunityId: opportunityId || null,
        actorType: "portal_client",
        email: txResult.email,
        token,
        payload: { msSinceCodeSent },
      },
      request,
    )

    return NextResponse.json({
      status: "verified",
      email: txResult.email,
      verificationProof: txResult.verificationProof,
    })
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Eroare server." },
      { status: 500 }
    )
  }
}
