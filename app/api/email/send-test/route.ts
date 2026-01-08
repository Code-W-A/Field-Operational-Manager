import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { getEmailFrom } from "@/lib/email/from"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"

export async function POST(request: NextRequest) {
  let errorRecipient = "unknown"
  let emailEventId: string | null = null
  try {
    const data = await request.json()
    const { recipient, subject = "Test Email", message = "Acesta este un email de test." } = data
    errorRecipient = recipient || "unknown"

    if (!recipient) {
      return NextResponse.json({ error: "Adresa de email a destinatarului este obligatorie" }, { status: 400 })
    }

    // Log queued (server)
    try {
      emailEventId = await logEmailEventServer({
        type: "TEST",
        to: [String(recipient)],
        subject,
        status: "queued",
        provider: "smtp",
        meta: { route: "/api/email/send-test" },
      })
    } catch (logError) {
      console.error("[Email Test] Failed to log test attempt:", logError)
    }

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST,
      port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      debug: true,
      logger: true,
    })

    // Verify connection configuration
    console.log("[Email Test] Verifying SMTP connection...")
    await transporter.verify()
    console.log("[Email Test] SMTP connection verified successfully")

    // Send test email
    const mailOptions = {
      from: getEmailFrom(),
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
    const info = await transporter.sendMail(mailOptions)
    console.log(`[Email Test] Email sent successfully, messageId: ${info.messageId}`)

    try {
      if (emailEventId) await updateEmailEventServer(emailEventId, { status: "sent", messageId: info.messageId })
    } catch (logError) {
      console.error("[Email Test] Failed to log success:", logError)
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      message: `Email de test trimis cu succes către ${recipient}`,
    })
  } catch (error: any) {
    console.error("[Email Test] Failed to send test email:", error)

    try {
      if (emailEventId) {
        await updateEmailEventServer(emailEventId, {
          status: "failed",
          error: String(error?.message || error || "unknown error"),
          meta: { stack: error?.stack ? String(error.stack).slice(0, 2000) : undefined },
        })
      } else {
        await logEmailEventServer({
          type: "TEST",
          to: [String(errorRecipient)],
          subject: "Test Email",
          status: "failed",
          provider: "smtp",
          error: String(error?.message || error || "unknown error"),
          meta: { route: "/api/email/send-test", stack: error?.stack ? String(error.stack).slice(0, 2000) : undefined },
      })
      }
    } catch (logError) {
      console.error("[Email Test] Failed to log error:", logError)
    }

    return NextResponse.json(
      {
        success: false,
        error: `Eroare la trimiterea email-ului de test: ${error.message}`,
      },
      { status: 500 },
    )
  }
}
