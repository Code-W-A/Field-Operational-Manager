import { NextResponse, type NextRequest } from "next/server"
import nodemailer from "nodemailer"
import { adminDb } from "@/lib/firebase/admin"
import { getEmailFrom } from "@/lib/email/from"
import { logOfferPortalEvent } from "@/lib/offer/portal-audit"

const CODE_LENGTH = 6
const CODE_TTL_MS = 15 * 60 * 1000
const CODE_RESEND_COOLDOWN_MS = 30 * 1000
const MAX_VERIFY_ATTEMPTS = 5
const VERIFY_LOCK_DURATION_MS = 15 * 60 * 1000
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

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

const generateCode = (crypto: typeof import("crypto")) => {
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)]
  }
  return out
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

type SendCodeTxResult =
  | { kind: "not_found" }
  | { kind: "invalid" }
  | { kind: "used" }
  | { kind: "expired" }
  | { kind: "locked"; retryAfterSec: number }
  | { kind: "throttled"; retryAfterSec: number }
  | { kind: "ready"; version: number }

export async function POST(req: NextRequest) {
  let workId = ""
  let providedToken = ""
  let cleanEmail = ""
  try {
    const { lucrareId, token, email } = await req.json()
    workId = String(lucrareId || "").trim()
    providedToken = String(token || "").trim()
    cleanEmail = String(email || "").trim().toLowerCase()

    if (!workId || !providedToken || !cleanEmail || !isValidEmail(cleanEmail)) {
      await logOfferPortalEvent({
        lucrareId: workId || undefined,
        action: "send-code",
        status: "invalid",
        token: providedToken,
        email: cleanEmail,
        details: "Parametri lipsă sau email invalid.",
        meta: { route: "/api/offer/send-code", reason: "invalid_params" },
      })
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau email invalid." }, { status: 400 })
    }

    const crypto = await import("crypto")
    const code = generateCode(crypto)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CODE_TTL_MS)
    const resendAvailableAt = new Date(now.getTime() + CODE_RESEND_COOLDOWN_MS)

    const workRef = adminDb.collection("lucrari").doc(workId)
    const txResult = await adminDb.runTransaction<SendCodeTxResult>(async (tx) => {
      const workSnap = await tx.get(workRef)
      if (!workSnap.exists) return { kind: "not_found" }

      const data: any = workSnap.data() || {}
      if (!data.offerActionToken || data.offerActionToken !== providedToken) {
        return { kind: "invalid" }
      }
      if (data.offerActionUsedAt) {
        return { kind: "used" }
      }
      const exp = toDate(data.offerActionExpiresAt)
      if (exp && now.getTime() > exp.getTime()) {
        return { kind: "expired" }
      }

      const verification = data.offerActionVerification || {}
      const verificationEmail = String(verification?.email || "").trim().toLowerCase()

      const lockUntil = toDate(verification?.lockUntil)
      if (lockUntil && lockUntil.getTime() > now.getTime()) {
        return {
          kind: "locked",
          retryAfterSec: Math.max(1, Math.ceil((lockUntil.getTime() - now.getTime()) / 1000)),
        }
      }

      const resendAt = toDate(verification?.resendAvailableAt)
      if (verificationEmail === cleanEmail && resendAt && resendAt.getTime() > now.getTime()) {
        return {
          kind: "throttled",
          retryAfterSec: Math.max(1, Math.ceil((resendAt.getTime() - now.getTime()) / 1000)),
        }
      }

      const version = Math.max(1, Number(verification?.version || 0) + 1)
      const maxAttempts = Math.max(1, Number(verification?.maxAttempts || MAX_VERIFY_ATTEMPTS))
      const lockDurationMs = Math.max(1000, Number(verification?.lockDurationMs || VERIFY_LOCK_DURATION_MS))
      const codeHash = crypto.createHash("sha256").update(`${code}:${cleanEmail}:${version}`).digest("hex")

      tx.update(workRef, {
        offerActionVerification: {
          email: cleanEmail,
          version,
          codeHash,
          codeSentAt: now,
          codeExpiresAt: expiresAt,
          resendAvailableAt,
          verifiedAt: null,
          attemptCount: 0,
          maxAttempts,
          lockUntil: null,
          lockDurationMs,
          codeFormat: "v2",
          responseProofHash: null,
          responseProofIssuedAt: null,
          responseProofExpiresAt: null,
          responseProofUsedAt: null,
        },
      })

      return { kind: "ready", version }
    })

    if (txResult.kind === "not_found") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "send-code",
        status: "invalid",
        token: providedToken,
        email: cleanEmail,
        details: "Lucrarea nu există.",
        meta: { route: "/api/offer/send-code", reason: "work_not_found" },
      })
      return NextResponse.json({ status: "invalid", message: "Lucrarea nu există." }, { status: 404 })
    }
    if (txResult.kind === "invalid") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "send-code",
        status: "invalid",
        token: providedToken,
        email: cleanEmail,
        details: "Link invalid sau utilizat.",
        meta: { route: "/api/offer/send-code", reason: "token_invalid" },
      })
      return NextResponse.json({ status: "invalid", message: "Link invalid sau utilizat." }, { status: 400 })
    }
    if (txResult.kind === "used") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "send-code",
        status: "used",
        token: providedToken,
        email: cleanEmail,
        details: "Oferta a fost deja acceptată sau refuzată.",
        meta: { route: "/api/offer/send-code" },
      })
      return NextResponse.json({ status: "used", message: "Oferta a fost deja acceptată sau refuzată." }, { status: 409 })
    }
    if (txResult.kind === "expired") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "send-code",
        status: "expired",
        token: providedToken,
        email: cleanEmail,
        details: "Link expirat.",
        meta: { route: "/api/offer/send-code" },
      })
      return NextResponse.json({ status: "expired", message: "Link expirat." }, { status: 410 })
    }
    if (txResult.kind === "locked") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "send-code",
        status: "locked",
        token: providedToken,
        email: cleanEmail,
        details: `Prea multe încercări. Retry în ${txResult.retryAfterSec}s.`,
        meta: { route: "/api/offer/send-code", retryAfterSec: txResult.retryAfterSec },
      })
      return NextResponse.json(
        {
          status: "locked",
          message: `Prea multe încercări. Reîncearcă în ${txResult.retryAfterSec}s.`,
          retryAfterSec: txResult.retryAfterSec,
        },
        { status: 429 },
      )
    }
    if (txResult.kind === "throttled") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "send-code",
        status: "throttled",
        token: providedToken,
        email: cleanEmail,
        details: `Cooldown activ. Retry în ${txResult.retryAfterSec}s.`,
        meta: { route: "/api/offer/send-code", retryAfterSec: txResult.retryAfterSec },
      })
      return NextResponse.json(
        {
          status: "throttled",
          message: `Ai cerut deja un cod. Reîncearcă în ${txResult.retryAfterSec}s.`,
          retryAfterSec: txResult.retryAfterSec,
        },
        { status: 429 },
      )
    }
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "mail.nrg-acces.ro",
      port: Number(process.env.EMAIL_PORT || 465),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASS || "FOM@nrg25",
      },
    })

    const subject = "Cod validare ofertă"
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
        <p>Pentru validarea ofertei, vă rugăm să introduceți codul de mai jos în pagina de confirmare:</p>
        <p style="font-size:20px;font-weight:700;letter-spacing:2px">${code}</p>
        <p>Codul este valabil timp de 15 minute. Dacă ați solicitat mai multe coduri, folosiți doar cel mai recent cod primit.</p>
      </div>
    `

    try {
      await transporter.sendMail({
        from: getEmailFrom(),
        to: [cleanEmail],
        subject,
        html,
        text: `Pentru validarea ofertei, introduceți codul: ${code}. Codul este valabil 15 minute. Dacă ați cerut coduri multiple, folosiți ultimul cod primit.`,
      })
    } catch (sendError) {
      // Allow immediate retry if SMTP send fails after code was persisted.
      await workRef
        .update({
          "offerActionVerification.resendAvailableAt": new Date(),
        })
        .catch(() => {})
      throw sendError
    }

    await logOfferPortalEvent({
      lucrareId: workId,
      action: "send-code",
      status: "sent",
      token: providedToken,
      email: cleanEmail,
      details: "Codul de verificare a fost trimis.",
      meta: { route: "/api/offer/send-code", version: txResult.version },
    })

    return NextResponse.json({
      status: "sent",
      version: txResult.version,
      cooldownSec: Math.floor(CODE_RESEND_COOLDOWN_MS / 1000),
    })
  } catch (error: any) {
    await logOfferPortalEvent({
      lucrareId: workId || undefined,
      action: "send-code",
      status: "error",
      token: providedToken,
      email: cleanEmail,
      details: String(error?.message || error || "unknown"),
      meta: { route: "/api/offer/send-code", reason: "exception" },
    })
    return NextResponse.json(
      {
        status: "error",
        message: "Eroare server la trimiterea codului.",
        error: { message: String(error?.message || error) },
      },
      { status: 500 },
    )
  }
}
