import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { sendInviteStyleEmail } from "@/lib/email/send-invite-style-email.server"

/**
 * Authenticated CRM-only send with the same SMTP + emailEvents pipeline as POST /api/users/invite.
 * Does not persist crm_offers; use POST /api/crm/offers/issue for full emit flow.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["admin", "dispecer"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: "Payload invalid" }, { status: 400 })

    const to = body.to
    const subject = typeof body.subject === "string" ? body.subject.trim() : ""
    const content = typeof body.content === "string" ? body.content : undefined
    const html = typeof body.html === "string" ? body.html : undefined
    const attachments = body.attachments
    const type = typeof body.type === "string" ? body.type : undefined
    const opportunityId = typeof body.opportunityId === "string" ? body.opportunityId.trim() : ""
    const offerId = typeof body.offerId === "string" ? body.offerId.trim() : ""

    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: "Destinatari lipsă" }, { status: 400 })
    }
    if (!subject) {
      return NextResponse.json({ error: "Subiectul este obligatoriu" }, { status: 400 })
    }

    const { messageId, emailEventId } = await sendInviteStyleEmail({
      to: to as string[],
      subject,
      content,
      html,
      attachments: Array.isArray(attachments) ? attachments : undefined,
      type,
      route: "/api/crm/offers/send-email",
      flow: String(type || "crm_offer_email").toLowerCase(),
      actorUserId: session.uid,
      metaExtra: {
        ...(opportunityId ? { opportunityId } : {}),
        ...(offerId ? { offerId } : {}),
      },
    })

    return NextResponse.json({
      success: true,
      messageId,
      emailEventId,
      acceptedBySmtp: true,
    })
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("CRM offers send-email error", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Eroare trimitere email" },
      { status: 500 },
    )
  }
}
