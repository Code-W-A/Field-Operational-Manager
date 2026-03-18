import nodemailer from "nodemailer"

export type ConfiguredSmtpAuth = {
  user: string
  pass: string
}

function parseSecureFlag(value: string | undefined) {
  return value === "false" ? false : true
}

export function getConfiguredSmtpAuth(): ConfiguredSmtpAuth {
  const user = String(process.env.EMAIL_USER || "").trim()
  const pass = String(process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || "").trim()

  if (!user || !pass) {
    throw new Error("Configurația SMTP este incompletă: lipsesc EMAIL_USER sau EMAIL_PASSWORD")
  }

  return { user, pass }
}

export function createConfiguredSmtpTransport() {
  const host = String(process.env.EMAIL_SMTP_HOST || process.env.EMAIL_HOST || "").trim()
  const port = Number.parseInt(process.env.EMAIL_SMTP_PORT || "465", 10)
  const secure = parseSecureFlag(process.env.EMAIL_SMTP_SECURE)
  const auth = getConfiguredSmtpAuth()

  if (!host || !Number.isFinite(port)) {
    throw new Error("Configurația SMTP este incompletă: lipsesc EMAIL_SMTP_HOST sau EMAIL_SMTP_PORT")
  }

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure,
      auth,
    }),
    auth,
  }
}
