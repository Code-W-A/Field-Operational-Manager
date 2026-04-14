import { NextResponse, type NextRequest } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { resolveMailTransport } from "@/lib/email/resolve-mail-transport.server"
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server"

const CODE_LENGTH = 6
const CODE_TTL_MS = 15 * 60 * 1000
const CODE_RESEND_COOLDOWN_MS = 30 * 1000
const MAX_VERIFY_ATTEMPTS = 5
const VERIFY_LOCK_DURATION_MS = 15 * 60 * 1000
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

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

const generateCode = (crypto: typeof import("crypto")) => {
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)]
  }
  return out
}

type TxResult =
  | { kind: "not_found" }
  | { kind: "invalid" }
  | { kind: "used" }
  | { kind: "expired" }
  | { kind: "locked"; retryAfterSec: number }
  | { kind: "throttled"; retryAfterSec: number }
  | { kind: "ready" }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const offerId = String(body?.offerId || "").trim()
    const token = String(body?.token || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()

    if (!offerId || !token || !email || !isValidEmail(email)) {
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau email invalid." }, { status: 400 })
    }

    const now = new Date()
    const crypto = await import("crypto")
    const code = generateCode(crypto)
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS)
    const resendAvailableAt = new Date(now.getTime() + CODE_RESEND_COOLDOWN_MS)
    const offerRef = adminDb.collection(CRM_COLLECTIONS.offers).doc(offerId)

    const txResult = await adminDb.runTransaction<TxResult>(async (tx) => {
      const offerSnap = await tx.get(offerRef)
      if (!offerSnap.exists) return { kind: "not_found" }

      const data = offerSnap.data() as Record<string, unknown>
      if (String(data.actionToken || "") !== token) return { kind: "invalid" }
      if (data.actionUsedAt || data.status === "ACCEPTED" || data.status === "REJECTED") return { kind: "used" }

      const actionExpiresAt = toDate(data.actionExpiresAt)
      if (actionExpiresAt && now.getTime() > actionExpiresAt.getTime()) {
        tx.update(offerRef, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() })
        return { kind: "expired" }
      }

      const verification = (data.verification || {}) as Record<string, unknown>
      const lockUntil = toDate(verification.lockUntil)
      if (lockUntil && lockUntil.getTime() > now.getTime()) {
        return {
          kind: "locked",
          retryAfterSec: Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 1000)),
        }
      }

      const verificationEmail = String(verification.email || "").toLowerCase()
      const resendAt = toDate(verification.resendAvailableAt)
      if (verificationEmail === email && resendAt && resendAt.getTime() > now.getTime()) {
        return {
          kind: "throttled",
          retryAfterSec: Math.max(1, Math.ceil((resendAt.getTime() - now.getTime()) / 1000)),
        }
      }

      const version = Math.max(1, Number(verification.version || 0) + 1)
      const codeHash = crypto.createHash("sha256").update(`${code}:${email}:${version}`).digest("hex")
      tx.update(offerRef, {
        verification: {
          email,
          version,
          codeHash,
          codeSentAt: now,
          codeExpiresAt: expiresAt,
          resendAvailableAt,
          verifiedAt: null,
          attemptCount: 0,
          maxAttempts: MAX_VERIFY_ATTEMPTS,
          lockUntil: null,
          lockDurationMs: VERIFY_LOCK_DURATION_MS,
          responseProofHash: null,
          responseProofIssuedAt: null,
          responseProofExpiresAt: null,
          responseProofUsedAt: null,
        },
        updatedAt: FieldValue.serverTimestamp(),
      })

      return { kind: "ready" }
    })

    if (txResult.kind === "not_found") {
      return NextResponse.json({ status: "invalid", message: "Oferta nu există." }, { status: 404 })
    }
    if (txResult.kind === "invalid") {
      return NextResponse.json({ status: "invalid", message: "Link invalid sau utilizat." }, { status: 400 })
    }
    if (txResult.kind === "used") {
      return NextResponse.json({ status: "used", message: "Oferta a fost deja procesată." }, { status: 409 })
    }
    if (txResult.kind === "expired") {
      return NextResponse.json({ status: "expired", message: "Link expirat." }, { status: 410 })
    }
    if (txResult.kind === "locked") {
      return NextResponse.json(
        {
          status: "locked",
          message: `Prea multe încercări. Reîncearcă în ${txResult.retryAfterSec}s.`,
          retryAfterSec: txResult.retryAfterSec,
        },
        { status: 429 }
      )
    }
    if (txResult.kind === "throttled") {
      return NextResponse.json(
        {
          status: "throttled",
          message: `Ai cerut deja un cod. Reîncearcă în ${txResult.retryAfterSec}s.`,
          retryAfterSec: txResult.retryAfterSec,
        },
        { status: 429 }
      )
    }

    // Fără sesiune staff: folosim SMTP/IMAP din env (flux public cu token ofertă).
    const resolved = await resolveMailTransport(null)
    const sendParams: Parameters<typeof sendMailWithSentCopy>[0] = {
      transporter: resolved.transporter,
      smtpAuth: resolved.smtpAuth,
      mailOptions: {
        from: resolved.mailFrom,
        to: [email],
        subject: "Cod validare ofertă",
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
          <p>Pentru validarea ofertei CRM, introduceți codul:</p>
          <p style="font-size:20px;font-weight:700;letter-spacing:2px">${code}</p>
          <p>Codul este valabil 15 minute. Dacă ai cerut mai multe coduri, folosește doar ultimul cod primit.</p>
        </div>`,
        text: `Cod validare ofertă CRM: ${code}. Cod valabil 15 minute.`,
      },
      imapContext: {
        route: "/api/crm/offers/send-code",
        flow: "crm_offer_send_code",
      },
    }
    if (resolved.imapExplicit !== undefined) {
      sendParams.imapExplicit = resolved.imapExplicit
    }
    await sendMailWithSentCopy(sendParams)

    return NextResponse.json({ status: "sent", message: "Codul a fost trimis pe email." })
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Eroare server." },
      { status: 500 }
    )
  }
}
