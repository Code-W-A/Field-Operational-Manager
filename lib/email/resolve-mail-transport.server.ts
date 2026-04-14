import nodemailer from "nodemailer"
import { getEmailFrom } from "@/lib/email/from"
import { createConfiguredSmtpTransport } from "@/lib/email/smtp.server"
import { getMailCredentialsDecrypted } from "@/lib/users/mail-credentials-store.server"

/** Config IMAP pasat explicit la sendMailWithSentCopy (copie în Sent) */
export type MailTransportImapExplicit = {
  host: string
  port: number
  rejectUnauthorized: boolean
  user: string
  pass: string
  mailbox: string
}

export type ResolvedMailTransport = {
  transporter: nodemailer.Transporter
  smtpAuth: { user: string; pass: string }
  source: "user" | "env"
  /**
   * Pentru sendMailWithSentCopy.imapExplicit: `undefined` = resolveImapConfig(env);
   * obiect = IMAP user; `null` = fără copie Sent (user fără IMAP).
   */
  imapExplicit: MailTransportImapExplicit | null | undefined
  /** Valoare recomandată pentru câmpul From (aliniat la SMTP-auth când source=user) */
  mailFrom: { name: string; address: string }
}

function envBool(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return value.toLowerCase() !== "false"
}

/**
 * SMTP (și opțional IMAP pentru Sent) din credențialele utilizatorului sau fallback env.
 */
export async function resolveMailTransport(
  actorUid: string | null | undefined,
): Promise<ResolvedMailTransport> {
  const uid = typeof actorUid === "string" ? actorUid.trim() : ""
  if (uid) {
    try {
      const creds = await getMailCredentialsDecrypted(uid)
      const host = creds?.smtpHost?.trim() || ""
      const user = creds?.smtpUser?.trim() || ""
      const pass = (creds?.smtpPassword || "").trim()
      const port = Number.isFinite(creds?.smtpPort) ? Number(creds!.smtpPort) : 465
      const secure = creds?.smtpSecure !== false

      if (host && user && pass) {
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure,
          auth: { user, pass },
        })
        const smtpAuth = { user, pass }
        const displayName = getEmailFrom().name

        let imapExplicit: MailTransportImapExplicit | null = null
        const imHost = creds.imapHost?.trim() || ""
        const imUser = creds.imapUser?.trim() || ""
        const imPass = (creds.imapPassword?.trim() || pass).trim()
        if (imHost && imUser && imPass) {
          const imPort = Number.isFinite(creds.imapPort) ? Number(creds.imapPort) : 993
          imapExplicit = {
            host: imHost,
            port: imPort,
            user: imUser,
            pass: imPass,
            rejectUnauthorized: envBool(process.env.EMAIL_IMAP_TLS_REJECT_UNAUTHORIZED, true),
            mailbox: String(process.env.EMAIL_IMAP_SENT_MAILBOX || "Sent").trim() || "Sent",
          }
        }

        return {
          transporter,
          smtpAuth,
          source: "user",
          imapExplicit: imapExplicit ?? null,
          mailFrom: { name: displayName, address: user },
        }
      }
    } catch {
      /* fallback env */
    }
  }

  const { transporter, auth } = createConfiguredSmtpTransport()
  const mf = getEmailFrom()
  return {
    transporter,
    smtpAuth: auth,
    source: "env",
    imapExplicit: undefined,
    mailFrom: { name: mf.name, address: mf.address },
  }
}
