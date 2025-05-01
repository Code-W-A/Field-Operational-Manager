import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(request: NextRequest) {
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

    // Verify connection
    await transporter.verify()

    return NextResponse.json({
      success: true,
      message: "Conexiunea SMTP a fost testată cu succes",
    })
  } catch (error: any) {
    console.error("[SMTP Test] Connection test failed:", error)

    return NextResponse.json(
      {
        success: false,
        error: `Testarea conexiunii SMTP a eșuat: ${error.message}`,
      },
      { status: 500 },
    )
  }
}
