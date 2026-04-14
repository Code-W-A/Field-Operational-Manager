const MAX_RESPONSE = 800
const MAX_STACK = 2000

export type EmailSmtpDiagnostics = {
  code?: string
  command?: string
  responseCode?: number
  response?: string
}

export type EmailSendDiagnostics = {
  /** Mesaj principal pentru câmpul `error` pe emailEvents */
  summary: string
  smtp?: EmailSmtpDiagnostics
  /** Fără date sensibile */
  stack?: string
}

function clip(s: string, max: number) {
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

/**
 * Extrage cauze uzuale din erori Nodemailer / Error, fără parole sau corp MIME.
 */
export function extractEmailSendDiagnostics(err: unknown): EmailSendDiagnostics {
  const e = err as {
    message?: string
    code?: string
    command?: string
    response?: string
    responseCode?: number
    stack?: string
  }

  const smtp: EmailSmtpDiagnostics | undefined = (() => {
    const code = typeof e.code === "string" ? e.code : undefined
    const command = typeof e.command === "string" ? e.command : undefined
    const responseCode = typeof e.responseCode === "number" ? e.responseCode : undefined
    let response: string | undefined
    if (typeof e.response === "string" && e.response) {
      response = clip(e.response, MAX_RESPONSE)
    }
    if (!code && !command && responseCode === undefined && !response) return undefined
    return { code, command, responseCode, response }
  })()

  const baseMsg = err instanceof Error ? err.message : String(err || "unknown error")
  const parts = [clip(baseMsg, 500)]
  if (smtp?.code) parts.push(`code=${smtp.code}`)
  if (smtp?.command) parts.push(`cmd=${smtp.command}`)
  if (smtp?.responseCode != null) parts.push(`respCode=${smtp.responseCode}`)

  const stack =
    err instanceof Error && typeof e.stack === "string" && e.stack.trim()
      ? clip(e.stack, MAX_STACK)
      : undefined

  return {
    summary: parts.join(" | "),
    ...(smtp ? { smtp } : {}),
    ...(stack ? { stack } : {}),
  }
}

/** Obiect stocat în meta.emailDiagnostics (serializabil Firestore). */
export function emailDiagnosticsToMeta(d: EmailSendDiagnostics): Record<string, unknown> {
  return {
    summary: d.summary,
    ...(d.smtp ? { smtp: d.smtp } : {}),
    ...(d.stack ? { stack: d.stack } : {}),
    at: new Date().toISOString(),
  }
}
