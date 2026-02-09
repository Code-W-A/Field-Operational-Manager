import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { logOfferPortalEvent } from "@/lib/offer/portal-audit"

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
const DEFAULT_MAX_VERIFY_ATTEMPTS = 5
const DEFAULT_LOCK_DURATION_MS = 15 * 60 * 1000
const RESPONSE_PROOF_TTL_MS = 10 * 60 * 1000

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

type VerifyTxResult =
  | { kind: "verified"; email: string; verificationProof: string }
  | {
      kind: "error"
      status: "invalid" | "used" | "expired" | "code_expired" | "invalid_code" | "locked"
      statusCode: number
      message: string
      attemptsRemaining?: number
      retryAfterSec?: number
    }

export async function POST(req: NextRequest) {
  let workId = ""
  let providedToken = ""
  let cleanEmail = ""
  try {
    const { lucrareId, token, email, code } = await req.json()
    workId = String(lucrareId || "").trim()
    providedToken = String(token || "").trim()
    cleanEmail = String(email || "").trim().toLowerCase()
    const normalizedCode = String(code || "").trim().toUpperCase()

    if (!workId || !providedToken || !cleanEmail || !normalizedCode || !isValidEmail(cleanEmail)) {
      await logOfferPortalEvent({
        lucrareId: workId || undefined,
        action: "verify-code",
        status: "invalid",
        token: providedToken,
        email: cleanEmail,
        details: "Parametri lipsă sau email invalid.",
        meta: { route: "/api/offer/verify-code", reason: "invalid_params" },
      })
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau email invalid." }, { status: 400 })
    }

    const now = new Date()
    const crypto = await import("crypto")
    const workRef = adminDb.collection("lucrari").doc(workId)

    const txResult = await adminDb.runTransaction<VerifyTxResult>(async (tx) => {
      const workSnap = await tx.get(workRef)
      if (!workSnap.exists) {
        return { kind: "error", status: "invalid", statusCode: 404, message: "Lucrarea nu există." }
      }

      const data: any = workSnap.data() || {}
      if (!data.offerActionToken || data.offerActionToken !== providedToken) {
        return { kind: "error", status: "invalid", statusCode: 400, message: "Link invalid sau utilizat." }
      }
      if (data.offerActionUsedAt) {
        return {
          kind: "error",
          status: "used",
          statusCode: 409,
          message: "Oferta a fost deja acceptată sau refuzată.",
        }
      }
      const exp = toDate(data.offerActionExpiresAt)
      if (exp && now.getTime() > exp.getTime()) {
        return { kind: "error", status: "expired", statusCode: 410, message: "Link expirat." }
      }

      const verification = data.offerActionVerification || {}
      const verificationEmail = String(verification?.email || "").trim().toLowerCase()
      const verificationCodeHash = typeof verification?.codeHash === "string" ? verification.codeHash : ""
      if (!verificationCodeHash || !verificationEmail || verificationEmail !== cleanEmail) {
        return {
          kind: "error",
          status: "invalid_code",
          statusCode: 400,
          message: "Cod invalid sau email diferit.",
        }
      }

      const lockUntil = toDate(verification?.lockUntil)
      const isLockActive = !!lockUntil && lockUntil.getTime() > now.getTime()
      if (isLockActive) {
        return {
          kind: "error",
          status: "locked",
          statusCode: 429,
          message: "Prea multe încercări. Codul este blocat temporar.",
          retryAfterSec: Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 1000)),
        }
      }

      const codeExpiresAt = toDate(verification?.codeExpiresAt)
      if (!codeExpiresAt || now.getTime() > codeExpiresAt.getTime()) {
        return { kind: "error", status: "code_expired", statusCode: 410, message: "Cod expirat." }
      }

      const version = Number(verification?.version || 0)
      const safeVersion = Math.max(1, version || 1)
      const hashV2 = crypto.createHash("sha256").update(`${normalizedCode}:${cleanEmail}:${safeVersion}`).digest("hex")
      const hashLegacy = crypto.createHash("sha256").update(`${normalizedCode}:${cleanEmail}`).digest("hex")
      const isLegacyCode = version <= 0
      const isMatch = verificationCodeHash === hashV2 || (isLegacyCode && verificationCodeHash === hashLegacy)

      const maxAttempts = Math.max(1, Number(verification?.maxAttempts || DEFAULT_MAX_VERIFY_ATTEMPTS))
      const lockDurationMs = Math.max(1000, Number(verification?.lockDurationMs || DEFAULT_LOCK_DURATION_MS))
      const rawAttemptCount = Math.max(0, Number(verification?.attemptCount || 0))
      const attemptCount = lockUntil && !isLockActive ? 0 : rawAttemptCount

      if (!isMatch) {
        const nextAttemptCount = attemptCount + 1
        const updates: Record<string, any> = {
          "offerActionVerification.attemptCount": nextAttemptCount,
          "offerActionVerification.lastAttemptAt": now,
        }
        if (lockUntil && !isLockActive) {
          updates["offerActionVerification.lockUntil"] = null
        }

        if (nextAttemptCount >= maxAttempts) {
          const nextLockUntil = new Date(now.getTime() + lockDurationMs)
          updates["offerActionVerification.lockUntil"] = nextLockUntil
          tx.update(workRef, updates)
          return {
            kind: "error",
            status: "locked",
            statusCode: 429,
            message: "Prea multe încercări. Codul este blocat temporar.",
            retryAfterSec: Math.max(1, Math.ceil((nextLockUntil.getTime() - now.getTime()) / 1000)),
          }
        }

        tx.update(workRef, updates)
        return {
          kind: "error",
          status: "invalid_code",
          statusCode: 400,
          message: "Cod invalid. Dacă ai cerut un cod nou, folosește ultimul cod primit.",
          attemptsRemaining: maxAttempts - nextAttemptCount,
        }
      }

      const successUpdates: Record<string, any> = {
        "offerActionVerification.verifiedAt": now,
        "offerActionVerification.attemptCount": 0,
        "offerActionVerification.lockUntil": null,
        "offerActionVerification.lastVerifiedAt": now,
      }
      const responseProof = crypto.randomBytes(24).toString("base64url")
      const responseProofHash = crypto.createHash("sha256").update(responseProof).digest("hex")
      successUpdates["offerActionVerification.responseProofHash"] = responseProofHash
      successUpdates["offerActionVerification.responseProofIssuedAt"] = now
      successUpdates["offerActionVerification.responseProofExpiresAt"] = new Date(now.getTime() + RESPONSE_PROOF_TTL_MS)
      successUpdates["offerActionVerification.responseProofUsedAt"] = null
      if (version > 0) {
        successUpdates["offerActionVerification.verifiedVersion"] = version
      }
      tx.update(workRef, successUpdates)
      return { kind: "verified", email: cleanEmail, verificationProof: responseProof }
    })

    if (txResult.kind === "error") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "verify-code",
        status: txResult.status,
        token: providedToken,
        email: cleanEmail,
        details: txResult.message,
        meta: {
          route: "/api/offer/verify-code",
          retryAfterSec: txResult.retryAfterSec ?? null,
          attemptsRemaining: txResult.attemptsRemaining ?? null,
        },
      })
      return NextResponse.json(
        {
          status: txResult.status,
          message: txResult.message,
          attemptsRemaining: txResult.attemptsRemaining,
          retryAfterSec: txResult.retryAfterSec,
        },
        { status: txResult.statusCode },
      )
    }
    await logOfferPortalEvent({
      lucrareId: workId,
      action: "verify-code",
      status: "verified",
      token: providedToken,
      email: cleanEmail,
      details: "Cod validat cu succes.",
      meta: { route: "/api/offer/verify-code" },
    })
    return NextResponse.json({ status: "verified", email: txResult.email, verificationProof: txResult.verificationProof })
  } catch (error: any) {
    await logOfferPortalEvent({
      lucrareId: workId || undefined,
      action: "verify-code",
      status: "error",
      token: providedToken,
      email: cleanEmail,
      details: String(error?.message || error || "unknown"),
      meta: { route: "/api/offer/verify-code", reason: "exception" },
    })
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
