import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { emailDiagnosticsToMeta, extractEmailSendDiagnostics } from "@/lib/email/email-error-diagnostics.server"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { reportToSentry } from "@/lib/sentry/report-error"

export async function POST(request: NextRequest) {
  let emailEventId: string | null = null
  try {
    const data = await request.json()

    // Use provided config or fall back to environment variables
    const config = {
      host: data.host || process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
      port: data.port || Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: data.secure !== undefined ? data.secure : process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
      auth: {
        user: data.user || process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: data.password || process.env.EMAIL_PASSWORD,
      },
      debug: true,
    }

    console.log("[SMTP Test] Testing connection with config:", {
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.auth.user,
      // Password is hidden for security
    })

    // Create test transporter
    const transporter = nodemailer.createTransport(config)

    // Log queued for SMTP test (even though we don't send an email)
    try {
      emailEventId = await logEmailEventServer({
        type: "TEST",
        to: [String(config?.auth?.user || "")].filter(Boolean),
        subject: "SMTP connection test",
        status: "queued",
        provider: "smtp",
        meta: { route: "/api/email/test-smtp", host: config.host, port: config.port, secure: config.secure },
      })
    } catch {}

    // Verify connection
    await transporter.verify()

    try {
      if (emailEventId) await updateEmailEventServer(emailEventId, { status: "sent" })
    } catch {}

    return NextResponse.json({
      success: true,
      message: "Conexiunea SMTP a fost testată cu succes",
    })
  } catch (error: unknown) {
    const diag = extractEmailSendDiagnostics(error)
    console.error("[SMTP Test] Connection test failed:", error)
    reportToSentry(error instanceof Error ? error : new Error(diag.summary), {
      tags: { area: "email", stage: "smtp_verify_test" },
      extra: { route: "/api/email/test-smtp", diagnosticsSummary: diag.summary },
    })

    try {
      if (emailEventId) {
        await updateEmailEventServer(emailEventId, {
          status: "failed",
          error: diag.summary,
          meta: {
            route: "/api/email/test-smtp",
            emailDiagnostics: emailDiagnosticsToMeta(diag),
          },
        })
      } else {
        await logEmailEventServer({
          type: "TEST",
          to: [],
          subject: "SMTP connection test",
          status: "failed",
          provider: "smtp",
          error: diag.summary,
          meta: {
            route: "/api/email/test-smtp",
            emailDiagnostics: emailDiagnosticsToMeta(diag),
          },
        })
      }
    } catch {}

    return NextResponse.json(
      {
        success: false,
        error: `Testarea conexiunii SMTP a eșuat: ${diag.summary}`,
      },
      { status: 500 },
    )
  }
}
