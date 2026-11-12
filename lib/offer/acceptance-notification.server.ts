import type { NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { sendInviteStyleEmail } from "@/lib/email/send-invite-style-email.server"
import { logOfferEvent } from "@/lib/offer/offer-events.server"

export type OfferIssuer = { userId: string; email: string }

export type OfferAcceptanceNotification = {
  source: "lucrari" | "crm"
  lucrareId?: string
  offerId?: string
  opportunityId?: string
  issuer?: OfferIssuer | null
  legacyCreatorId?: string
  legacyMessageId?: string
  client: string
  reference: string
  version?: string
  acceptedBy: string
  acceptedAt: string
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const validEmail = (value: string) =>
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  )

async function resolveIssuer(
  input: OfferAcceptanceNotification,
): Promise<OfferIssuer | null> {
  const issuer = input.issuer
  if (text(issuer?.userId) && validEmail(text(issuer?.email))) {
    return {
      userId: text(issuer?.userId),
      email: text(issuer?.email).toLowerCase(),
    }
  }

  let userId = text(issuer?.userId) || text(input.legacyCreatorId)
  if (!userId && input.source === "lucrari" && text(input.legacyMessageId)) {
    const events = await adminDb
      .collection("emailEvents")
      .where("messageId", "==", input.legacyMessageId)
      .get()
    const senders = new Set(
      events.docs.flatMap((doc) => {
        const event = doc.data()
        if (
          event.type !== "OFFER" ||
          event.status !== "sent" ||
          event.lucrareId !== input.lucrareId
        )
          return []
        const actorId = text(event.meta?.actorUserId)
        return actorId ? [actorId] : []
      }),
    )
    if (senders.size === 1) userId = [...senders][0]
  }
  if (!userId) return null
  const user = await adminDb.collection("users").doc(userId).get()
  const email = text(user.data()?.email).toLowerCase()
  return validEmail(email) ? { userId, email } : null
}

/** Called only by the winning response transaction. Never throws into the client response. */
export async function notifyOfferIssuerOfAcceptance(
  input: OfferAcceptanceNotification,
  request: NextRequest,
) {
  let recipient: OfferIssuer | null = null
  const event = {
    type: "OFFER_ISSUER_ACCEPTANCE_NOTIFICATION" as const,
    source: input.source,
    lucrareId: input.lucrareId,
    offerId: input.offerId,
    opportunityId: input.opportunityId,
    actorType: "system" as const,
  }
  try {
    recipient = await resolveIssuer(input)
    if (!recipient) {
      await logOfferEvent(
        {
          ...event,
          status: "skipped",
          payload: { reason: "issuer_unavailable" },
        },
        request,
      )
      return
    }
    const label = input.source === "lucrari" ? "Tichet" : "Oportunitate"
    const date = new Date(input.acceptedAt).toLocaleString("ro-RO", {
      timeZone: "Europe/Bucharest",
    })
    const lines = [
      "Clientul a acceptat oferta trimisă de tine.",
      `Client: ${input.client || "—"}`,
      `${label}: ${input.reference}`,
      ...(input.version ? [`Versiune ofertă: ${input.version}`] : []),
      `Confirmat de: ${input.acceptedBy || "—"}`,
      `Data acceptării: ${date} (Europe/Bucharest)`,
    ]
    const configuredBase =
      text(process.env.NEXT_PUBLIC_APP_URL) || "https://fom-nrg.vercel.app"
    const base = /^https?:\/\//i.test(configuredBase)
      ? configuredBase
      : `https://${configuredBase}`
    const path =
      input.source === "lucrari"
        ? `/dashboard/lucrari/${encodeURIComponent(input.lucrareId!)}`
        : `/crm/opportunities/${encodeURIComponent(input.opportunityId!)}/offers`
    const url = new URL(path, base).toString()
    const subject =
      `Ofertă acceptată – ${label.toLowerCase()} ${input.reference}`.replace(
        /[\r\n]/g,
        " ",
      )
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600">Deschide oferta în FOM</a></p></div>`
    const sent = await sendInviteStyleEmail({
      to: [recipient.email],
      subject,
      html,
      content: [...lines, url].join("\n"),
      type: "GENERIC",
      source: input.source,
      route:
        input.source === "lucrari"
          ? "/api/offer/respond"
          : "/api/crm/offers/respond",
      flow: "offer_issuer_acceptance",
      metaExtra: {
        notification: "offer_issuer_acceptance",
        issuerUserId: recipient.userId,
        lucrareId: input.lucrareId || null,
        offerId: input.offerId || null,
        opportunityId: input.opportunityId || null,
        acceptedAt: input.acceptedAt,
      },
    })
    await logOfferEvent(
      {
        ...event,
        status: "sent",
        email: recipient.email,
        messageId: sent.messageId,
        payload: {
          emailEventId: sent.emailEventId,
          issuerUserId: recipient.userId,
          acceptedAt: input.acceptedAt,
        },
      },
      request,
    )
  } catch (error) {
    // SMTP uncertainty is recorded, never retried automatically by a repeated accept.
    try {
      await logOfferEvent(
        {
          ...event,
          status: "failed",
          email: recipient?.email || null,
          payload: {
            error: error instanceof Error ? error.message : String(error),
          },
          integrityWarning:
            "Notificarea emitentului nu a fost confirmată. Acceptul clientului este înregistrat.",
        },
        request,
      )
    } catch (logError) {
      console.error("[offer/issuer-notification] Logging failed", logError)
    }
  }
}
