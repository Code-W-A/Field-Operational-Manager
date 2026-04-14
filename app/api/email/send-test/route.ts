import { type NextRequest, NextResponse } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { emailDiagnosticsToMeta, extractEmailSendDiagnostics } from "@/lib/email/email-error-diagnostics.server"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { resolveMailTransport } from "@/lib/email/resolve-mail-transport.server"
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server"

export async function POST(request: NextRequest) {
  let errorRecipient = "unknown"
  let emailEventId: string | null = null
  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Autentificare obligatorie (sesiune sau Bearer token)." }, { status: 401 })
    }

    const data = await request.json()
    const { recipient, subject = "Test Email", message = "Acesta este un email de test." } = data
    errorRecipient = recipient || "unknown"

    if (!recipient) {
      return NextResponse.json({ error: "Adresa de email a destinatarului este obligatorie" }, { status: 400 })
    }

    const resolved = await resolveMailTransport(session.uid)

    try {
      emailEventId = await logEmailEventServer({
        type: "TEST",
        to: [String(recipient)],
        subject,
        status: "queued",
        provider: "smtp",
        meta: {
          route: "/api/email/send-test",
          smtpTransportSource: resolved.source,
          actorUid: session.uid,
        },
      })
    } catch (logError) {
      console.error("[Email Test] Failed to log test attempt:", logError)
    }

    console.log("[Email Test] Verifying SMTP connection...")
    await resolved.transporter.verify()
    console.log("[Email Test] SMTP connection verified successfully")

    const mailOptions = {
      from: resolved.mailFrom,
      to: recipient,
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
          <h2 style="color: #0f56b3; border-bottom: 1px solid #eaeaea; padding-bottom: 10px;">Email de Test</h2>
          
          <p>${message}</p>
          
          <p>Acest email a fost trimis la: ${new Date().toLocaleString()}</p>
          
          <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eaeaea; font-size: 12px; color: #666;">
            <p>Acest email a fost generat automat pentru a testa configurația SMTP. Vă rugăm să nu răspundeți la acest email.</p>
          </div>
        </div>
      `,
    }

    console.log(`[Email Test] Sending test email to ${recipient}...`)
    const sendParams: Parameters<typeof sendMailWithSentCopy>[0] = {
      transporter: resolved.transporter,
      mailOptions,
      smtpAuth: resolved.smtpAuth,
      imapContext: {
        route: "/api/email/send-test",
        emailEventId: emailEventId || undefined,
        flow: "test",
      },
    }
    if (resolved.imapExplicit !== undefined) {
      sendParams.imapExplicit = resolved.imapExplicit
    }
    const info = await sendMailWithSentCopy(sendParams)
    console.log(`[Email Test] Email sent successfully, messageId: ${info.messageId}`)

    try {
      if (emailEventId) {
        await updateEmailEventServer(emailEventId, {
          status: "sent",
          messageId: info.messageId,
          meta: { smtpTransportSource: resolved.source },
        })
      }
    } catch (logError) {
      console.error("[Email Test] Failed to log success:", logError)
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      message: `Email de test trimis cu succes către ${recipient}`,
    })
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const diag = extractEmailSendDiagnostics(error)
    console.error("[Email Test] Failed to send test email:", error)

    try {
      if (emailEventId) {
        await updateEmailEventServer(emailEventId, {
          status: "failed",
          error: diag.summary,
          meta: {
            route: "/api/email/send-test",
            emailDiagnostics: emailDiagnosticsToMeta(diag),
          },
        })
      } else {
        await logEmailEventServer({
          type: "TEST",
          to: [String(errorRecipient)],
          subject: "Test Email",
          status: "failed",
          provider: "smtp",
          error: diag.summary,
          meta: {
            route: "/api/email/send-test",
            emailDiagnostics: emailDiagnosticsToMeta(diag),
          },
        })
      }
    } catch (logError) {
      console.error("[Email Test] Failed to log error:", logError)
    }

    return NextResponse.json(
      {
        success: false,
        error: `Eroare la trimiterea email-ului de test: ${diag.summary}`,
      },
      { status: 500 },
    )
  }
}
