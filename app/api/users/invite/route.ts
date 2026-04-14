import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { logEmailEventServer } from "@/lib/email/email-events.server"
import {
  InviteStyleEmailSendError,
  sendInviteStyleEmail,
} from "@/lib/email/send-invite-style-email.server"

export async function POST(request: NextRequest) {
  // IMPORTANT: Request body can be read only once. Keep a copy for both success + error logging.
  let body: any = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  let lastEmailEventId: string | null = null
  try {
    const session = await requireRole(["admin", "dispecer"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Autentificare obligatorie (sesiune sau Bearer token)." }, { status: 401 })
    }

    const { to, subject, content, html, attachments, type } = body || {}
    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: "Destinatari lipsă" }, { status: 400 })
    }

    const { messageId, emailEventId } = await sendInviteStyleEmail({
      to: to as string[],
      subject,
      content,
      html,
      attachments,
      type,
      route: "/api/users/invite",
      flow: String(type || "invite").toLowerCase(),
      actorUserId: session.uid,
    })
    lastEmailEventId = emailEventId

    // mark sent on lucrare (portal offer/deviz)
    try {
      const lucrareId = (Array.isArray((attachments as any)) && (attachments as any)[0]?.lucrareId) || undefined
      if (lucrareId) {
        const emailStatusField =
          String(type || "").toUpperCase() === "DEVIZ" ? "lastDevizEmail" : "lastOfferEmail"
        await adminDb.collection("lucrari").doc(String(lucrareId)).set(
          {
            [emailStatusField]: {
              sentAt: new Date().toISOString(),
              to: (to as string[]) || [],
              status: "sent",
              messageId,
            },
          },
          { merge: true },
        )
      }
    } catch (error) {
      console.error("Eroare la logging eveniment email sent:", error)
    }

    return NextResponse.json({
      success: true,
      messageId,
      emailEventId,
      acceptedBySmtp: true,
    })
  } catch (e: unknown) {
    if (e instanceof RequireRoleError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("Invite email error", e)

    const smtpError = e instanceof InviteStyleEmailSendError ? e.cause : e
    const err = smtpError as {
      message?: string
      code?: string
      command?: string
      response?: string
      responseCode?: number
    }
    const details = {
      message: err?.message,
      code: err?.code,
      command: err?.command,
      response: err?.response,
      responseCode: err?.responseCode,
    }

    let errorTo: string[] = []
    let errorSubject = "unknown"
    try {
      errorTo = Array.isArray(body?.to) ? body.to : []
      errorSubject = body?.subject || "Email – FOM"

      const lucrareId = (Array.isArray((body?.attachments as any)) && (body?.attachments as any)[0]?.lucrareId) || undefined
      if (lucrareId) {
        const emailStatusField =
          String(body?.type || "").toUpperCase() === "DEVIZ" ? "lastDevizEmail" : "lastOfferEmail"
        await adminDb.collection("lucrari").doc(String(lucrareId)).set(
          {
            [emailStatusField]: {
              sentAt: new Date().toISOString(),
              to: errorTo,
              status: "failed",
            },
          },
          { merge: true },
        )
      }
    } catch (parseError) {
      console.error("Eroare la parsarea body pentru logging:", parseError)
    }

    const failedEventId = e instanceof InviteStyleEmailSendError ? e.emailEventId : lastEmailEventId

    // Fallback log when queued event was never created (helper already marks failed when event exists)
    try {
      if (!failedEventId) {
        await logEmailEventServer({
          type:
            String(body?.type || "").toUpperCase() === "REPORT"
              ? "REPORT"
              : String(body?.type || "").toUpperCase() === "OFFER"
                ? "OFFER"
                : String(body?.type || "").toUpperCase() === "DEVIZ"
                  ? "DEVIZ"
                  : "INVITE",
          lucrareId: (Array.isArray((body?.attachments as any)) && (body?.attachments as any)[0]?.lucrareId) || undefined,
          to: errorTo,
          subject: errorSubject,
          status: "failed",
          provider: "smtp",
          error: details.message || String(e),
          meta: {
            route: "/api/users/invite",
            code: details.code,
            command: details.command,
          },
        })
      }
    } catch (eventError) {
      console.error("Eroare la update email event failed:", eventError)
    }

    return NextResponse.json(
      {
        error: "Eroare trimitere email",
        details,
        emailEventId: failedEventId,
        to: errorTo,
        subject: errorSubject,
      },
      { status: 500 },
    )
  }
}
