import nodemailer from "nodemailer"
import type { EmailEventType } from "@/lib/email/email-events.server"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { emailDiagnosticsToMeta, extractEmailSendDiagnostics } from "@/lib/email/email-error-diagnostics.server"
import { resolveMailTransport } from "@/lib/email/resolve-mail-transport.server"
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server"

/** Thrown when SMTP send fails after optional queued emailEvent was created (id exposed for callers). */
export class InviteStyleEmailSendError extends Error {
  readonly emailEventId: string | null

  constructor(message: string, emailEventId: string | null, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "InviteStyleEmailSendError"
    this.emailEventId = emailEventId
  }
}

export type InviteStyleAttachmentInput = {
  filename?: string
  content?: string | Buffer
  encoding?: string
  contentType?: string
  /** Lucrări portal offer/deviz tracking */
  lucrareId?: string
  /** CRM metadata (not used for mapping; optional for callers) */
  opportunityId?: string
}

export function createInviteStyleSmtpTransport() {
  const smtpUser = process.env.EMAIL_USER || "fom@nrg-acces.ro"
  const smtpPass = process.env.EMAIL_PASS || "FOM@nrg25"
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "mail.nrg-acces.ro",
    port: Number(process.env.EMAIL_PORT || 465),
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  })
  return { transporter, smtpAuth: { user: smtpUser, pass: smtpPass } }
}

function inferInviteStyleEmailEventType(
  type: string | undefined,
  attachments: InviteStyleAttachmentInput[] | undefined,
): EmailEventType {
  const normalizedType = String(type || "").toUpperCase()
  const inferredLucrareId =
    (Array.isArray(attachments) && attachments[0]?.lucrareId) || undefined
  const inferredType =
    normalizedType === "REPORT"
      ? "REPORT"
      : normalizedType === "OFFER"
        ? "OFFER"
        : normalizedType === "DEVIZ"
          ? "DEVIZ"
          : inferredLucrareId
            ? "OFFER"
            : "GENERIC"

  if (inferredType === "REPORT") return "REPORT"
  if (inferredType === "OFFER") return "OFFER"
  if (inferredType === "DEVIZ") return "DEVIZ"
  return "INVITE"
}

export type SendInviteStyleEmailParams = {
  to: string[]
  subject: string
  content?: string
  html?: string
  attachments?: InviteStyleAttachmentInput[]
  type?: string
  /** Logged + passed to IMAP context */
  route: string
  /** Lowercase flow label for Sent folder copy (e.g. invite, crm_offer_issue) */
  flow?: string
  replyTo?: string
  /** Merged into `meta` for emailEvents (e.g. opportunityId, offerId, version) */
  metaExtra?: Record<string, unknown>
  /** Dacă setat, încearcă SMTP/IMAP salvat pe utilizator; altfel doar env */
  actorUserId?: string | null
}

/**
 * Same SMTP + emailEvents + sendMailWithSentCopy pipeline as POST /api/users/invite.
 * On SMTP failure, updates the queued emailEvent to failed when one was created, then rethrows.
 */
export async function sendInviteStyleEmail(
  params: SendInviteStyleEmailParams,
): Promise<{ messageId: string; emailEventId: string | null }> {
  const { to, subject, content, html, attachments, type, route, flow, replyTo, metaExtra, actorUserId } =
    params

  const resolved = await resolveMailTransport(actorUserId ?? null)

  const normalizedType = String(type || "").toUpperCase()
  const inferredLucrareId =
    (Array.isArray(attachments) && attachments[0]?.lucrareId) || undefined
  const inferredType =
    normalizedType === "REPORT"
      ? "REPORT"
      : normalizedType === "OFFER"
        ? "OFFER"
        : normalizedType === "DEVIZ"
          ? "DEVIZ"
          : inferredLucrareId
            ? "OFFER"
            : "GENERIC"

  const emailEventType = inferInviteStyleEmailEventType(type, attachments)

  let emailEventId: string | null = null

  try {
    emailEventId = await logEmailEventServer({
      type: emailEventType,
      lucrareId: inferredLucrareId,
      to: to || [],
      subject: subject || "Email – FOM",
      status: "queued",
      provider: "smtp",
      meta: {
        route,
        inviteType: inferredType,
        attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
        smtpTransportSource: resolved.source,
        ...(actorUserId ? { actorUserId } : {}),
        ...metaExtra,
      },
    })
  } catch (error) {
    console.error("Eroare la logging eveniment email queued:", error)
  }

  const { transporter, smtpAuth, imapExplicit, mailFrom } = resolved

  try {
    const sentParams: Parameters<typeof sendMailWithSentCopy>[0] = {
      transporter,
      smtpAuth,
      mailOptions: {
        from: mailFrom,
        replyTo: replyTo || undefined,
        to,
        subject: subject || "Invitație acces Portal Client – FOM",
        text: content || "Vă-am creat acces în Portalul Client FOM.",
        html: html || undefined,
        attachments: Array.isArray(attachments)
          ? attachments.map((a) => ({
              filename: String(a?.filename || "attachment"),
              content: a?.content,
              encoding: a?.encoding || undefined,
              contentType: a?.contentType || undefined,
            }))
          : undefined,
      },
      imapContext: {
        route,
        emailEventId: emailEventId || undefined,
        flow: flow ?? String(type || "invite").toLowerCase(),
      },
    }
    if (resolved.imapExplicit !== undefined) {
      sentParams.imapExplicit = resolved.imapExplicit
    }
    const info = await sendMailWithSentCopy(sentParams)

    try {
      if (emailEventId) await updateEmailEventServer(emailEventId, { status: "sent", messageId: info.messageId })
    } catch (error) {
      console.error("Eroare la logging eveniment email sent:", error)
    }

    return { messageId: String(info.messageId || ""), emailEventId }
  } catch (e: unknown) {
    const diag = extractEmailSendDiagnostics(e)
    try {
      if (emailEventId) {
        await updateEmailEventServer(emailEventId, {
          status: "failed",
          error: diag.summary,
          meta: { emailDiagnostics: emailDiagnosticsToMeta(diag) },
        })
      }
    } catch (eventError) {
      console.error("Eroare la update email event failed:", eventError)
    }
    throw new InviteStyleEmailSendError(diag.summary, emailEventId, { cause: e })
  }
}
