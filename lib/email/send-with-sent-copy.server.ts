import nodemailer from "nodemailer"
import tls from "tls"
import { randomUUID } from "crypto"
import { reportToSentry } from "@/lib/sentry/report-error"
import { updateEmailEventServer } from "@/lib/email/email-events.server"
import {
  emailDiagnosticsToMeta,
  extractEmailSendDiagnostics,
} from "@/lib/email/email-error-diagnostics.server"

type SmtpAuth = {
  user?: string
  pass?: string
}

type ImapContext = {
  route?: string
  requestId?: string
  emailEventId?: string
  flow?: string
}

/** Dacă este setat și complet, folosit în loc de resolveImapConfig(env + smtpAuth) */
export type SendMailImapExplicit = {
  host: string
  port: number
  rejectUnauthorized: boolean
  user: string
  pass: string
  mailbox: string
}

type SendWithSentCopyParams = {
  transporter: nodemailer.Transporter
  mailOptions: nodemailer.SendMailOptions
  smtpAuth?: SmtpAuth
  imapContext?: ImapContext
  /**
   * IMAP pentru copie Sent: omit = resolveImapConfig(env + smtpAuth);
   * obiect = folosește aceste valori; `null` = nu încerca IMAP (ex. user SMTP fără IMAP configurat).
   */
  imapExplicit?: SendMailImapExplicit | null
}

type ImapConfig = {
  host: string
  port: number
  rejectUnauthorized: boolean
  user: string
  pass: string
  mailbox: string
}

type AppendMode = "async" | "sync"
type ImapLifecycleResult = "queued" | "started" | "completed" | "failed" | "skipped"

type ImapLifecycleEvent = {
  runId: string
  messageId?: string
  route?: string
  requestId?: string
  emailEventId?: string
  flow?: string
  mode?: AppendMode
  stage: string
  result: ImapLifecycleResult
  durationMs?: number
  error?: string
  details?: Record<string, unknown>
}

function envBool(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return value.toLowerCase() !== "false"
}

function resolveAppendMode(): AppendMode {
  const raw = String(process.env.EMAIL_IMAP_APPEND_MODE || "async").trim().toLowerCase()
  return raw === "sync" ? "sync" : "async"
}

function isImapDebugEnabled() {
  return envBool(process.env.EMAIL_IMAP_DEBUG, false)
}

function imapLifecycle(event: ImapLifecycleEvent) {
  const payload = {
    timestamp: new Date().toISOString(),
    component: "email_imap_append",
    ...event,
  }
  console.log(JSON.stringify(payload))
}

function imapDebug(message: string, data?: Record<string, unknown>) {
  if (!isImapDebugEnabled()) return
  if (data) {
    console.log(`[Email][IMAP] ${message}`, data)
    return
  }
  console.log(`[Email][IMAP] ${message}`)
}

function quoteImapString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

class MinimalImapClient {
  private socket: tls.TLSSocket
  private buffer = ""
  private queuedLines: string[] = []
  private waiting: Array<{
    resolve: (lines: string[]) => void
    reject: (error: Error) => void
    tag: string
    lines: string[]
  }> = []
  private continuationWaiters: Array<{
    resolve: () => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  }> = []
  private counter = 0

  constructor(socket: tls.TLSSocket) {
    this.socket = socket
    socket.on("data", (chunk) => this.onData(chunk.toString("utf8")))
    socket.on("error", (error) => {
      const pending = [...this.waiting]
      this.waiting = []
      pending.forEach((entry) => entry.reject(error))

      const continuationPending = [...this.continuationWaiters]
      this.continuationWaiters = []
      continuationPending.forEach((entry) => {
        clearTimeout(entry.timer)
        entry.reject(error)
      })
    })
  }

  private onData(data: string) {
    this.buffer += data
    while (this.buffer.includes("\r\n")) {
      const idx = this.buffer.indexOf("\r\n")
      const line = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 2)
      this.handleLine(line)
    }
  }

  private handleLine(line: string) {
    if (line.startsWith("+") && this.continuationWaiters.length > 0) {
      const waiter = this.continuationWaiters.shift()
      if (waiter) {
        clearTimeout(waiter.timer)
        waiter.resolve()
      }
      return
    }

    if (this.waiting.length === 0) {
      this.queuedLines.push(line)
      // Keep memory bounded in case server sends lots of untagged lines.
      if (this.queuedLines.length > 500) this.queuedLines.splice(0, this.queuedLines.length - 500)
      return
    }
    const current = this.waiting[0]
    current.lines.push(line)

    if (line.startsWith(`${current.tag} `)) {
      this.waiting.shift()
      if (line.toUpperCase().includes(" OK")) {
        current.resolve(current.lines)
      } else {
        current.reject(new Error(`IMAP command failed: ${line}`))
      }
    }
  }

  private handleQueuedLine(line: string) {
    if (line.startsWith("+") && this.continuationWaiters.length > 0) {
      const waiter = this.continuationWaiters.shift()
      if (waiter) {
        clearTimeout(waiter.timer)
        waiter.resolve()
      }
      return true
    }

    if (this.waiting.length > 0) {
      this.handleLine(line)
      return true
    }

    return false
  }

  private drainQueuedLines() {
    if (this.queuedLines.length === 0) return

    const pending = [...this.queuedLines]
    this.queuedLines = []

    for (const line of pending) {
      const consumed = this.handleQueuedLine(line)
      if (!consumed) this.queuedLines.push(line)
    }
  }

  private nextTag() {
    this.counter += 1
    return `A${String(this.counter).padStart(4, "0")}`
  }

  command(commandText: string) {
    const tag = this.nextTag()
    const payload = `${tag} ${commandText}\r\n`
    return new Promise<string[]>((resolve, reject) => {
      this.waiting.push({ resolve, reject, tag, lines: [] })
      this.socket.write(payload)
      this.drainQueuedLines()
    })
  }

  waitForContinuation() {
    return new Promise<void>((resolve, reject) => {
      const timeoutMs = Number.parseInt(process.env.EMAIL_IMAP_APPEND_TIMEOUT_MS || "60000", 10)

      const queuedContinuationIndex = this.queuedLines.findIndex((line) => line.startsWith("+"))
      if (queuedContinuationIndex >= 0) {
        this.queuedLines.splice(queuedContinuationIndex, 1)
        resolve()
        return
      }

      const timer = setTimeout(() => {
        const idx = this.continuationWaiters.findIndex((entry) => entry.timer === timer)
        if (idx >= 0) this.continuationWaiters.splice(idx, 1)
        reject(new Error("IMAP continuation timeout"))
      }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000)

      this.continuationWaiters.push({ resolve, reject, timer })
      this.drainQueuedLines()
    })
  }

  append(mailbox: string, rawMessage: Buffer) {
    const tag = this.nextTag()
    this.socket.write(`${tag} APPEND ${quoteImapString(mailbox)} (\\Seen) {${rawMessage.length}}\r\n`)
    return new Promise<void>(async (resolve, reject) => {
      try {
        await this.waitForContinuation()
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }

      this.waiting.push({
        tag,
        lines: [],
        resolve: () => resolve(),
        reject,
      })
      this.socket.write(rawMessage)
      this.socket.write("\r\n")
      this.drainQueuedLines()
    })
  }
}

function parseListMailbox(line: string): { mailbox: string; flags: string[] } | null {
  const match = line.match(/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/i)
  if (!match) return null

  const rawFlags = String(match[1] || "")
    .split(/\s+/)
    .map((flag) => flag.trim().toUpperCase())
    .filter(Boolean)

  let mailboxToken = String(match[2] || "").trim()
  if (mailboxToken.startsWith('"') && mailboxToken.endsWith('"')) {
    mailboxToken = mailboxToken.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\")
  }

  if (!mailboxToken) return null
  return { mailbox: mailboxToken, flags: rawFlags }
}

async function appendToSentMailbox(rawMessage: Buffer, config: ImapConfig) {
  imapDebug("Connecting", {
    host: config.host,
    port: config.port,
    mailbox: config.mailbox,
    user: config.user,
    rejectUnauthorized: config.rejectUnauthorized,
  })

  const socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
    const conn = tls.connect(
      {
        host: config.host,
        port: config.port,
        servername: config.host,
        rejectUnauthorized: config.rejectUnauthorized,
      },
      () => resolve(conn),
    )
    conn.once("error", reject)
  })

  const client = new MinimalImapClient(socket)
  imapDebug("Connected")

  try {
    // Give server a moment to emit greeting and ignore it.
    await new Promise((resolve) => setTimeout(resolve, 150))
    imapDebug("Running LOGIN")
    await client.command(`LOGIN ${quoteImapString(config.user)} ${quoteImapString(config.pass)}`)
    imapDebug("LOGIN OK")

    const mailboxCandidates = [config.mailbox, "Sent", "Sent Items", "INBOX.Sent"]
    try {
      const listLines = await client.command(`LIST "" "*"`)
      const parsed = listLines
        .map((line) => parseListMailbox(line))
        .filter((entry): entry is { mailbox: string; flags: string[] } => Boolean(entry))

      const sentFlagged = parsed.filter((entry) => entry.flags.includes("\\SENT")).map((entry) => entry.mailbox)
      const sentNamed = parsed
        .map((entry) => entry.mailbox)
        .filter((mailbox) => /sent|trimise|trimis/i.test(mailbox))

      const discovered = [...sentFlagged, ...sentNamed]
      for (let i = discovered.length - 1; i >= 0; i -= 1) {
        mailboxCandidates.unshift(discovered[i]!)
      }

      imapDebug("LIST discovered mailboxes", {
        total: parsed.length,
        sentFlagged,
        sentNamed,
      })
    } catch (error: unknown) {
      const listError = error instanceof Error ? error.message : String(error)
      imapDebug("LIST failed", { error: listError })
    }

    const dedupedMailboxCandidates = Array.from(
      new Set(mailboxCandidates.map((mailbox) => String(mailbox || "").trim()).filter(Boolean)),
    )
    let appended = false
    let lastError: Error | null = null

    for (const mailbox of dedupedMailboxCandidates) {
      try {
        imapDebug("Trying APPEND mailbox", { mailbox })
        await client.append(mailbox, rawMessage)
        appended = true
        imapDebug("APPEND OK", { mailbox })
        break
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error))
        imapDebug("APPEND failed", { mailbox, error: lastError.message })
      }
    }

    if (!appended) {
      throw lastError || new Error("Could not append message to any Sent mailbox")
    }

    await client.command("LOGOUT").catch(() => {})
    imapDebug("LOGOUT done")
  } finally {
    socket.end()
    imapDebug("Connection closed")
  }
}

function resolveImapConfig(auth?: SmtpAuth): ImapConfig | null {
  if (!envBool(process.env.EMAIL_APPEND_TO_SENT, true)) return null

  const user = auth?.user || process.env.EMAIL_USER || ""
  const pass = auth?.pass || process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || ""
  const host = process.env.EMAIL_IMAP_HOST || process.env.EMAIL_SMTP_HOST || process.env.EMAIL_HOST || ""
  const port = Number.parseInt(process.env.EMAIL_IMAP_PORT || "993", 10)
  const rejectUnauthorized = envBool(process.env.EMAIL_IMAP_TLS_REJECT_UNAUTHORIZED, true)
  const mailbox = process.env.EMAIL_IMAP_SENT_MAILBOX || "Sent"

  if (!user || !pass || !host || Number.isNaN(port)) {
    imapDebug("IMAP config incomplete", {
      hasUser: Boolean(user),
      hasPass: Boolean(pass),
      hasHost: Boolean(host),
      port,
    })
    return null
  }

  imapDebug("IMAP config resolved", {
    user,
    host,
    port,
    mailbox,
    rejectUnauthorized,
    passwordSet: Boolean(pass),
  })

  return { user, pass, host, port, rejectUnauthorized, mailbox }
}

async function buildRawMime(mailOptions: nodemailer.SendMailOptions) {
  const rawTransport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows",
  })
  const rawInfo = await rawTransport.sendMail(mailOptions)
  return Buffer.isBuffer(rawInfo.message) ? rawInfo.message : Buffer.from(String(rawInfo.message || ""), "utf8")
}

async function patchEmailEventImapSentCopy(
  emailEventId: string | undefined,
  payload: Record<string, unknown>,
) {
  if (!emailEventId) return
  try {
    await updateEmailEventServer(emailEventId, {
      meta: { imapSentCopy: payload },
    })
  } catch (e) {
    console.warn("[Email] Failed to patch emailEvent imapSentCopy:", e)
  }
}

export async function sendMailWithSentCopy(params: SendWithSentCopyParams) {
  let info: nodemailer.SentMessageInfo
  try {
    info = await params.transporter.sendMail(params.mailOptions)
  } catch (smtpError) {
    const diag = extractEmailSendDiagnostics(smtpError)
    const evId = params.imapContext?.emailEventId
    if (evId) {
      try {
        await updateEmailEventServer(evId, {
          status: "failed",
          error: diag.summary,
          meta: {
            failureStage: "smtp_send",
            emailDiagnostics: emailDiagnosticsToMeta(diag),
          },
        })
      } catch (e) {
        console.warn("[Email] Failed to record SMTP failure on emailEvent:", e)
      }
    }
    reportToSentry(smtpError instanceof Error ? smtpError : new Error(diag.summary), {
      tags: { area: "email", stage: "smtp_send" },
      extra: {
        route: params.imapContext?.route,
        requestId: params.imapContext?.requestId,
        flow: params.imapContext?.flow,
        emailEventId: evId,
        diagnosticsSummary: diag.summary,
      },
    })
    throw smtpError
  }

  imapDebug("SMTP send done", { messageId: info.messageId, response: info.response })

  const mode = resolveAppendMode()
  const runId = randomUUID()
  const lifecycleBase = {
    runId,
    mode,
    messageId: info.messageId || undefined,
    route: params.imapContext?.route,
    requestId: params.imapContext?.requestId,
    emailEventId: params.imapContext?.emailEventId,
    flow: params.imapContext?.flow,
  }

  const imapConfig: ImapConfig | null = (() => {
    if (params.imapExplicit === undefined) {
      return resolveImapConfig(params.smtpAuth)
    }
    if (params.imapExplicit === null) {
      return null
    }
    const ex = params.imapExplicit
    if (ex.host && ex.user && ex.pass && Number.isFinite(ex.port) && ex.mailbox) {
      return {
        host: ex.host,
        port: ex.port,
        rejectUnauthorized: ex.rejectUnauthorized,
        user: ex.user,
        pass: ex.pass,
        mailbox: ex.mailbox,
      }
    }
    return null
  })()

  if (!imapConfig) {
    imapLifecycle({
      ...lifecycleBase,
      stage: "skip_config",
      result: "skipped",
      details: { enabled: envBool(process.env.EMAIL_APPEND_TO_SENT, true) },
    })
    imapDebug("Skipping IMAP append (disabled or incomplete config)")
    return info
  }

  const runAppend = async () => {
    const appendStartedAt = Date.now()
    let stage = "build_mime"
    imapLifecycle({ ...lifecycleBase, stage: "started", result: "started" })
    imapLifecycle({ ...lifecycleBase, stage, result: "started" })

    try {
      const rawMessage = await buildRawMime(params.mailOptions)
      imapDebug("Built raw MIME", { bytes: rawMessage.length })
      imapLifecycle({
        ...lifecycleBase,
        stage,
        result: "completed",
        details: { mimeBytes: rawMessage.length },
      })

      stage = "append"
      imapLifecycle({ ...lifecycleBase, stage, result: "started" })
      await appendToSentMailbox(rawMessage, imapConfig)
      imapLifecycle({ ...lifecycleBase, stage, result: "completed" })
      imapLifecycle({
        ...lifecycleBase,
        stage: "completed",
        result: "completed",
        durationMs: Date.now() - appendStartedAt,
      })
      imapDebug("Sent copy append completed")
      await patchEmailEventImapSentCopy(params.imapContext?.emailEventId, {
        ok: true,
        stage: "completed",
        host: imapConfig.host,
        port: imapConfig.port,
        mailbox: imapConfig.mailbox,
        durationMs: Date.now() - appendStartedAt,
        at: new Date().toISOString(),
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      reportToSentry(error instanceof Error ? error : new Error(errorMessage), {
        tags: { area: "email", stage: "imap_sent_copy" },
        extra: {
          ...lifecycleBase,
          imapHost: imapConfig.host,
          imapPort: imapConfig.port,
          mailbox: imapConfig.mailbox,
        },
      })
      console.warn("[Email] Sent copy append failed:", error)
      imapDebug("Sent copy append failed", {
        error: errorMessage,
        host: imapConfig.host,
        port: imapConfig.port,
        mailbox: imapConfig.mailbox,
        user: imapConfig.user,
      })
      imapLifecycle({
        ...lifecycleBase,
        stage,
        result: "failed",
        durationMs: Date.now() - appendStartedAt,
        error: errorMessage,
      })
      await patchEmailEventImapSentCopy(params.imapContext?.emailEventId, {
        ok: false,
        stage,
        error: errorMessage,
        host: imapConfig.host,
        port: imapConfig.port,
        mailbox: imapConfig.mailbox,
        durationMs: Date.now() - appendStartedAt,
        at: new Date().toISOString(),
      })
    }
  }

  if (mode === "async") {
    imapLifecycle({ ...lifecycleBase, stage: "queued_async", result: "queued" })
    setImmediate(() => {
      void runAppend().catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        reportToSentry(error instanceof Error ? error : new Error(errorMessage), {
          tags: { area: "email", stage: "imap_sent_copy_async" },
          extra: { ...lifecycleBase, imapHost: imapConfig.host, imapPort: imapConfig.port },
        })
        console.warn("[Email] Async sent-copy runner failed unexpectedly:", error)
        imapLifecycle({
          ...lifecycleBase,
          stage: "runner",
          result: "failed",
          error: errorMessage,
        })
        void patchEmailEventImapSentCopy(params.imapContext?.emailEventId, {
          ok: false,
          stage: "runner",
          error: errorMessage,
          host: imapConfig.host,
          port: imapConfig.port,
          mailbox: imapConfig.mailbox,
          at: new Date().toISOString(),
        })
      })
    })
    return info
  }

  imapLifecycle({ ...lifecycleBase, stage: "queued_sync", result: "queued" })
  await runAppend()
  return info
}
