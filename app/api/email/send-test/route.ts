import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { addLog } from "@/lib/firebase/firestore"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { recipient, subject = "Test Email", message = "Acesta este un email de test." } = data

    if (!recipient) {
      return NextResponse.json({ error: "Adresa de email a destinatarului este obligatorie" }, { status: 400 })
    }

    // Log the test attempt
    try {
      await addLog("Test email", `Încercare trimitere email de test către ${recipient}`, "Informație", "Email")
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
      from: `"Field Operational Manager" <${process.env.EMAIL_USER}>`,
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

    // Log the success
    try {
      await addLog("Test email", `Email de test trimis cu succes către ${recipient}`, "Informație", "Email")
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

    // Log the error
    try {
      await addLog("Test email", `Eroare la trimiterea email-ului de test: ${error.message}`, "Eroare", "Email")
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
