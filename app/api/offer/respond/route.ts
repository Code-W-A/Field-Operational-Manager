import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { sendInviteStyleEmail } from "@/lib/email/send-invite-style-email.server"
import { logOfferEvent } from "@/lib/offer/offer-events.server"
import { logOfferPortalEvent } from "@/lib/offer/portal-audit"

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

type RespondTxResult =
  | { kind: "success"; action: "accept" | "reject" }
  | {
      kind: "error"
      status: "invalid" | "used" | "expired" | "verification_required" | "verification_invalid"
      statusCode: number
      message: string
    }

function resolveBaseUrl(req: NextRequest) {
  const envBase = process.env.NEXT_PUBLIC_APP_URL
  const proto = req.headers.get("x-forwarded-proto") || "https"
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || ""
  const rawBase = envBase || (host ? `${proto}://${host}` : "")
  if (!rawBase) return ""
  return rawBase.startsWith("http://") || rawBase.startsWith("https://") ? rawBase : `https://${rawBase}`
}

async function sendResponseConfirmation(params: {
  req: NextRequest
  lucrareId: string
  action: "accept" | "reject"
  work: Record<string, any>
}) {
  const email =
    String(params.work?.offerResponse?.verifiedEmail || params.work?.offerActionVerification?.email || "").trim().toLowerCase()
  if (!email) {
    await logOfferEvent(
      {
        type: "OFFER_CONFIRMATION_SENT",
        source: "lucrari",
        status: "skipped",
        lucrareId: params.lucrareId,
        actorType: "system",
        payload: { responseAction: params.action, reason: "missing_verified_email" },
        integrityWarning: "Confirmarea post-răspuns nu a fost trimisă: lipsește emailul verificat.",
      },
      params.req,
    )
    return
  }

  const subject = `${
    params.action === "accept" ? "Confirmare acceptare ofertă" : "Confirmare răspuns – refuz ofertă"
  } – tichet ${params.work?.numarRaport || params.lucrareId}`
  const base = resolveBaseUrl(params.req)
  const ofertaUrl = typeof params.work?.ofertaDocument?.url === "string" ? params.work.ofertaDocument.url : ""
  const downloadLink =
    params.action === "accept" && base && ofertaUrl
      ? `${base}/api/download?lucrareId=${encodeURIComponent(params.lucrareId)}&type=oferta&url=${encodeURIComponent(ofertaUrl)}&recipient=${encodeURIComponent(email)}`
      : ""
  const messageParagraph =
    params.action === "accept"
      ? "Va multumim pentru acceptarea ofertei noastre. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi."
      : "Va multumim pentru raspunsul dvs. In continuare veti fi contactat de un reprezentant NRG pt a stabili urmatorii pasi."
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
      <p>${messageParagraph}</p>
      ${
        downloadLink
          ? `<p style="margin:12px 0"><a href="${downloadLink}" style="background:#2563eb;border-radius:6px;color:#ffffff;display:inline-block;font-weight:600;padding:10px 14px;text-decoration:none">Descarcă oferta</a></p>`
          : ""
      }
    </div>
  `

  try {
    const sent = await sendInviteStyleEmail({
      to: [email],
      subject,
      html,
      content: messageParagraph,
      type: "GENERIC",
      lucrareId: params.lucrareId,
      source: "lucrari",
      route: "/api/offer/respond",
      flow: "offer_confirmation",
    })
    await logOfferEvent(
      {
        type: "OFFER_CONFIRMATION_SENT",
        source: "lucrari",
        status: "sent",
        lucrareId: params.lucrareId,
        actorType: "system",
        email,
        messageId: sent.messageId,
        emailBodyHtml: html,
        payload: { responseAction: params.action, subject, emailEventId: sent.emailEventId, hasDownloadLink: Boolean(downloadLink) },
      },
      params.req,
    )
  } catch (error) {
    await logOfferEvent(
      {
        type: "OFFER_CONFIRMATION_SENT",
        source: "lucrari",
        status: "failed",
        lucrareId: params.lucrareId,
        actorType: "system",
        email,
        emailBodyHtml: html,
        payload: {
          responseAction: params.action,
          subject,
          error: error instanceof Error ? error.message : String(error),
        },
        integrityWarning: "Confirmarea post-răspuns nu a putut fi trimisă; acceptul/refuzul rămâne înregistrat.",
      },
      params.req,
    )
  }
}

export async function POST(req: NextRequest) {
  let workId = ""
  let providedToken = ""
  let proof = ""
  let reason = ""
  let finalAction: "accept" | "reject" | undefined
  try {
    const body = await req.json()
    workId = String(body.lucrareId || "").trim()
    providedToken = String(body.token || "").trim()
    finalAction = body.action as "accept" | "reject"
    reason = String(body.reason || "").trim()
    proof = String(body.verificationProof || "").trim()

    if (!workId || !providedToken || !finalAction || (finalAction !== "accept" && finalAction !== "reject")) {
      await logOfferPortalEvent({
        lucrareId: workId || undefined,
        action: `respond-${String(finalAction || "unknown")}`,
        status: "invalid",
        token: providedToken,
        details: "Parametri lipsă sau nevalizi.",
        meta: { route: "/api/offer/respond", reason: "invalid_params" },
      })
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau nevalizi." }, { status: 400 })
    }

    if (!proof) {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: `respond-${finalAction}`,
        status: "verification_required",
        token: providedToken,
        details: "Lipsește verificationProof.",
        meta: { route: "/api/offer/respond", reason: "missing_proof" },
      })
      return NextResponse.json(
        { status: "verification_required", message: "Este necesară reverificarea în doi pași." },
        { status: 403 },
      )
    }

    const safeFinalAction: "accept" | "reject" = finalAction

    const crypto = await import("crypto")
    const proofHash = crypto.createHash("sha256").update(proof).digest("hex")
    const workRef = adminDb.collection("lucrari").doc(workId)

    const txResult = await adminDb.runTransaction<RespondTxResult>(async (tx) => {
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
      if (exp && Date.now() > exp.getTime()) {
        return { kind: "error", status: "expired", statusCode: 410, message: "Link expirat." }
      }

      const verification = data?.offerActionVerification || {}
      const storedProofHash = typeof verification?.responseProofHash === "string" ? verification.responseProofHash : ""
      const proofExpiresAt = toDate(verification?.responseProofExpiresAt)
      const proofUsedAt = toDate(verification?.responseProofUsedAt)

      if (!storedProofHash || !proofExpiresAt) {
        return {
          kind: "error",
          status: "verification_required",
          statusCode: 403,
          message: "Verificarea în doi pași trebuie refăcută.",
        }
      }

      if (proofUsedAt) {
        return {
          kind: "error",
          status: "verification_invalid",
          statusCode: 403,
          message: "Dovada de verificare a fost deja folosită. Reverifică emailul și codul.",
        }
      }

      if (Date.now() > proofExpiresAt.getTime()) {
        return {
          kind: "error",
          status: "verification_required",
          statusCode: 403,
          message: "Verificarea în doi pași a expirat. Solicită un cod nou.",
        }
      }

      if (storedProofHash !== proofHash) {
        return {
          kind: "error",
          status: "verification_invalid",
          statusCode: 403,
          message: "Dovada de verificare este invalidă. Reverifică emailul și codul.",
        }
      }

      const verifiedEmail = typeof verification?.email === "string" ? verification.email : ""
      const now = new Date()
      const versionSavedAt =
        typeof data?.offerActionSnapshot?.savedAt === "string"
          ? data.offerActionSnapshot.savedAt
          : typeof data?.offerActionVersionSavedAt === "string"
            ? data.offerActionVersionSavedAt
            : null
      const existingHistory = Array.isArray(data?.offerResponsesHistory) ? data.offerResponsesHistory : []
      const hasExistingResponseForProof = existingHistory.some((row: any) => String(row?.responseProofHash || "") === proofHash)
      const historyEntry = {
        status: safeFinalAction,
        at: now,
        ...(verifiedEmail ? { verifiedEmail } : {}),
        ...(safeFinalAction === "reject" && reason ? { reason } : {}),
        ...(versionSavedAt ? { versionSavedAt } : {}),
        offerSendCountAtResponse: Number(data?.offerSendCount || 0),
        tokenUsed: String(data?.offerActionToken || ""),
        responseProofHash: proofHash,
      }
      const update: Record<string, any> = {
        offerResponse: {
          status: safeFinalAction,
          at: now,
          ...(verifiedEmail ? { verifiedEmail } : {}),
          ...(safeFinalAction === "reject" && reason ? { reason } : {}),
          ...(versionSavedAt ? { versionSavedAt } : {}),
        },
        offerResponsesHistory: hasExistingResponseForProof ? existingHistory : [...existingHistory, historyEntry],
        offerActionUsedAt: now,
        "offerActionVerification.responseProofUsedAt": now,
      }

      if (safeFinalAction === "accept") {
        update.statusOferta = "OFERTAT"
        update.acceptedOfferSnapshot = data?.offerActionSnapshot || null
        update.offerActionVersionSavedAt = data?.offerActionSnapshot?.savedAt || data?.offerActionVersionSavedAt || null
      } else {
        update.statusOferta = "DA"
      }

      tx.update(workRef, update)
      return { kind: "success", action: safeFinalAction }
    })

    if (txResult.kind === "error") {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: `respond-${safeFinalAction}`,
        status: txResult.status,
        token: providedToken,
        details: txResult.message,
        meta: { route: "/api/offer/respond", statusCode: txResult.statusCode },
      })
      return NextResponse.json({ status: txResult.status, message: txResult.message }, { status: txResult.statusCode })
    }

    await logOfferPortalEvent({
      lucrareId: workId,
      action: `respond-${safeFinalAction}`,
      status: "success",
      token: providedToken,
      details: txResult.action === "accept" ? "Oferta acceptată." : "Oferta refuzată.",
      meta: { route: "/api/offer/respond" },
    })

    const workSnapAfter = await adminDb.collection("lucrari").doc(workId).get()
    const workDataAfter = workSnapAfter.data() as any
    await logOfferEvent(
      {
        type: txResult.action === "accept" ? "OFFER_ACCEPTED" : "OFFER_REJECTED",
        source: "lucrari",
        status: "success",
        lucrareId: workId,
        actorType: "portal_client",
        email: workDataAfter?.offerResponse?.verifiedEmail || workDataAfter?.offerActionVerification?.email || null,
        token: providedToken,
        snapshot: txResult.action === "accept" ? workDataAfter?.acceptedOfferSnapshot || workDataAfter?.offerActionSnapshot : null,
        payload: {
          versionSavedAt: workDataAfter?.offerResponse?.versionSavedAt || null,
          reason: safeFinalAction === "reject" ? reason || null : null,
        },
      },
      req,
    )

    await sendResponseConfirmation({
      req,
      lucrareId: workId,
      action: txResult.action,
      work: workDataAfter || {},
    })

    return NextResponse.json({
      status: "success",
      message: txResult.action === "accept" ? "Oferta acceptată." : "Oferta refuzată.",
    })
  } catch (error: any) {
    await logOfferPortalEvent({
      lucrareId: workId || undefined,
      action: `respond-${String(finalAction || "unknown")}`,
      status: "error",
      token: providedToken,
      details: String(error?.message || error || "unknown"),
      meta: { route: "/api/offer/respond", reason: "exception", hasProof: Boolean(proof) },
    })
    return NextResponse.json(
      {
        status: "error",
        message: "Eroare server la procesare.",
        error: { message: String(error?.message || error), code: error?.code, name: error?.name, stack: error?.stack },
      },
      { status: 500 },
    )
  }
}
