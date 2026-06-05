import * as functions from "firebase-functions"
import { initializeApp } from "firebase-admin/app"
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore"
import * as tls from "node:tls"
import * as net from "node:net"

// Initialize the default Firebase app for Admin SDK
initializeApp()

const db = getFirestore()
const REGION = "europe-west1"
const TIMEZONE = "Europe/Bucharest"
const MAX_WORKS_PER_RUN = 200
const RECENT_REVISION_BLOCK_DAYS = 30

type CrmTaskNotifyEventType = "assigned" | "reassigned" | "reminder_15m"
type CrmInternalNoteNotifyEventType = "created" | "overdue_daily"
type CrmInternalThreadMessageNotifyEventType = "created" | "overdue_daily"
type HrRequestReminderEventType = "weekly_pending" | "day_before_start"

// =========================
// HR Requests → Timesheets
// =========================

type HrRequestKind = "CO" | "CFP" | "CM" | "IN" | "DEL" | "CORRECT_HOURS" | "ADD_OVERTIME"
type HrRequestStatus = "pending" | "approved" | "rejected"

type HrRequest = {
  employeeId: string
  employeeName?: string
  requesterUid: string
  sectorId: string
  managerUid: string
  kind: HrRequestKind
  status: HrRequestStatus
  payload: any
  rejectionReason?: string | null
}

// =========================
// SMTP email (no deps)
// =========================

type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

function getSmtpConfig(): SmtpConfig | null {
  const cfg: any = (functions as any).config?.() ?? {}
  const smtp = cfg.smtp ?? {}
  const host = process.env.SMTP_HOST ?? smtp.host
  const portRaw = process.env.SMTP_PORT ?? smtp.port ?? "465"
  const secureRaw = process.env.SMTP_SECURE ?? smtp.secure ?? "true"
  const user = process.env.SMTP_USER ?? smtp.user
  const pass = process.env.SMTP_PASS ?? smtp.pass
  const from = process.env.SMTP_FROM ?? smtp.from ?? user
  const port = Number(portRaw)
  const secure = String(secureRaw) === "true" || String(secureRaw) === "1"
  if (!host || !user || !pass || !from || !Number.isFinite(port)) return null
  return { host: String(host), port, secure, user: String(user), pass: String(pass), from: String(from) }
}

/** JSON pe o linie — filtrează în Cloud Logging: `jsonPayload.message` conține "hrRequestReminder" sau folosește query text. */
function hrReminderLog(phase: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ src: "hrRequestReminder", phase, ...data }))
}

function hrReminderErr(phase: string, data: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ src: "hrRequestReminder", phase, ...data }))
}

function b64(s: string) {
  return Buffer.from(String(s), "utf8").toString("base64")
}

async function smtpSendMail(params: { to: string; subject: string; text: string; html?: string }) {
  const cfg = getSmtpConfig()
  if (!cfg) {
    const msg =
      "SMTP not configured for Cloud Functions (set functions.config().smtp.* or env SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM). Email not sent."
    hrReminderErr("smtp_not_configured", { to: params.to, message: msg })
    throw new Error(msg)
  }

  const socket: net.Socket = cfg.secure
    ? (tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) as any)
    : net.connect({ host: cfg.host, port: cfg.port })

  socket.setEncoding("utf8")

  let buffer = ""
  const readResponse = (): Promise<{ code: number; lines: string[] }> =>
    new Promise((resolve, reject) => {
      const onData = (chunk: string) => {
        buffer += chunk
        // SMTP responses end with \r\n; multi-line uses "xyz-" prefix.
        const parts = buffer.split("\r\n")
        if (parts.length < 2) return
        // Keep last incomplete line in buffer.
        buffer = parts.pop() ?? ""
        const lines = parts.filter(Boolean)
        if (!lines.length) return

        // Detect last response line: same code + space, not hyphen.
        const last = lines[lines.length - 1]
        const m = /^(\d{3})([ -])/.exec(last)
        if (!m) return
        const code = Number(m[1])
        const sep = m[2]
        if (sep === "-") return // still expecting more lines

        socket.off("data", onData)
        resolve({ code, lines })
      }

      const onError = (err: any) => {
        socket.off("data", onData)
        reject(err)
      }

      socket.on("data", onData)
      socket.once("error", onError)
    })

  const cmd = async (line: string, ok: number | number[]) => {
    socket.write(line + "\r\n")
    const res = await readResponse()
    const oks = Array.isArray(ok) ? ok : [ok]
    if (!oks.includes(res.code)) {
      throw new Error(`SMTP command failed (${line}) -> ${res.code} ${res.lines.join(" | ")}`)
    }
    return res
  }

  try {
    // Greeting
    const greet = await readResponse()
    if (greet.code !== 220) throw new Error(`SMTP greeting failed: ${greet.code}`)

    await cmd(`EHLO ${cfg.host}`, [250])
    await cmd("AUTH LOGIN", [334])
    await cmd(b64(cfg.user), [334])
    await cmd(b64(cfg.pass), [235])
    await cmd(`MAIL FROM:<${cfg.from}>`, [250])
    await cmd(`RCPT TO:<${params.to}>`, [250, 251])
    await cmd("DATA", [354])

    const textBody = params.text.replace(/\r?\n/g, "\r\n")
    const htmlBody = params.html ? params.html.replace(/\r?\n/g, "\r\n") : null
    const boundary = `crm-task-boundary-${Date.now()}`
    const headers = [
      `From: ${cfg.from}`,
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      "MIME-Version: 1.0",
      htmlBody
        ? `Content-Type: multipart/alternative; boundary="${boundary}"`
        : "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
    ].join("\r\n")
    const body = htmlBody
      ? [
          `--${boundary}`,
          "Content-Type: text/plain; charset=utf-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          textBody,
          "",
          `--${boundary}`,
          "Content-Type: text/html; charset=utf-8",
          "Content-Transfer-Encoding: 8bit",
          "",
          htmlBody,
          "",
          `--${boundary}--`,
        ].join("\r\n")
      : textBody
    socket.write(headers + "\r\n\r\n" + body + "\r\n.\r\n")

    const dataRes = await readResponse()
    if (dataRes.code !== 250) throw new Error(`SMTP DATA failed: ${dataRes.code}`)
    await cmd("QUIT", [221])
  } finally {
    try {
      socket.end()
      socket.destroy()
    } catch {}
  }
}

async function getUserEmail(uid: string): Promise<{ email: string | null; displayName: string | null }> {
  try {
    const snap = await db.collection("users").doc(uid).get()
    const data = snap.data() as any
    const email = typeof data?.email === "string" ? data.email : null
    const displayName = typeof data?.displayName === "string" ? data.displayName : null
    return { email, displayName }
  } catch (e) {
    console.error("getUserEmail failed", uid, e)
    return { email: null, displayName: null }
  }
}

type CrmTaskRecord = {
  opportunityId?: string
  title?: string
  status?: string
  dueAt?: any
  updatedAt?: any
  assigneeId?: string | null
  createdById?: string | null
  updatedById?: string | null
}

type CrmOpportunityRecord = {
  ownerId?: string
  code?: string
  title?: string
}

type CrmInternalNoteRecord = {
  opportunityId?: string | null
  fromUserId?: string
  toUserId?: string
  message?: string
  context?: string | null
  dueAt?: any
  status?: string
  confirmationMessage?: string | null
  confirmedAt?: any
  confirmedById?: string | null
  createdById?: string | null
  createdAt?: any
  updatedAt?: any
}

type CrmInternalThreadMessageRecord = {
  threadId?: string
  fromUserId?: string
  toUserId?: string
  message?: string
  context?: string | null
  requiresConfirmation?: boolean
  deadlineAt?: any
  cycleStatus?: string
  confirmedAt?: any
  confirmedById?: string | null
  createdById?: string | null
  createdAt?: any
  updatedAt?: any
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function crmDateToMs(value: any): number | null {
  if (!value) return null
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (value instanceof Timestamp) return value.toMillis()
  if (typeof value?.toMillis === "function") {
    const ms = Number(value.toMillis())
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value?.toDate === "function") {
    const d = value.toDate()
    const ms = d instanceof Date ? d.getTime() : Number.NaN
    return Number.isFinite(ms) ? ms : null
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

function crmTaskEventKey(params: { eventType: CrmTaskNotifyEventType; taskId: string; dueAtMs: number | null }) {
  if (params.eventType === "assigned") return `crm_task_assigned:${params.taskId}`
  if (params.eventType === "reassigned") return `crm_task_reassigned:${params.taskId}:${params.dueAtMs || "no_due"}`
  return `crm_task_reminder_15m:${params.taskId}:${params.dueAtMs || "no_due"}`
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function getCrmBaseUrl() {
  const cfg: any = (functions as any).config?.() ?? {}
  const fromEnv = process.env.CRM_APP_BASE_URL || process.env.APP_BASE_URL || cfg.app?.base_url || cfg.crm?.base_url
  let base = String(fromEnv || "").trim().replace(/\/+$/, "")
  if (!base) {
    base = "https://fom.nrg-acces.ro"
  } else if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base}`
  }
  return base
}

function formatRoDateTime(ms: number | null) {
  if (!ms) return "N/A"
  return new Date(ms).toLocaleString("ro-RO", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatDateKeyInTimeZone(ms: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  return formatter.format(new Date(ms))
}

async function hasQueuedOrSentCrmTaskEvent(eventKey: string) {
  const rows = await db.collection("emailEvents").where("meta.crmTaskEventKey", "==", eventKey).limit(20).get()
  return rows.docs.some((snap) => {
    const status = String(snap.data()?.status || "")
    return status === "queued" || status === "sent"
  })
}

async function logCrmTaskEmailEvent(params: {
  to: string[]
  subject: string
  status: "queued" | "sent" | "failed" | "skipped"
  error?: string
  meta: Record<string, unknown>
}) {
  const ref = await db.collection("emailEvents").add({
    type: "CRM_TASK",
    to: params.to,
    subject: params.subject,
    status: params.status,
    provider: "smtp",
    ...(params.error ? { error: params.error } : {}),
    meta: params.meta,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

async function updateCrmTaskEmailEvent(
  eventId: string,
  patch: { status?: "sent" | "failed"; error?: string; meta?: Record<string, unknown> }
) {
  await db.collection("emailEvents").doc(eventId).set(
    {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.error ? { error: patch.error } : {}),
      ...(patch.meta ? { meta: patch.meta } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

function crmInternalNoteEventKey(params: {
  eventType: CrmInternalNoteNotifyEventType
  noteId: string
  dateKey?: string
}) {
  if (params.eventType === "created") return `crm_internal_note_created:${params.noteId}`
  return `crm_internal_note_overdue_daily:${params.noteId}:${params.dateKey || "no_date"}`
}

async function hasQueuedOrSentCrmInternalNoteEvent(eventKey: string) {
  const rows = await db.collection("emailEvents").where("meta.crmInternalNoteEventKey", "==", eventKey).limit(20).get()
  return rows.docs.some((snap) => {
    const status = String(snap.data()?.status || "")
    return status === "queued" || status === "sent"
  })
}

async function logCrmInternalNoteEmailEvent(params: {
  to: string[]
  subject: string
  status: "queued" | "sent" | "failed" | "skipped"
  error?: string
  meta: Record<string, unknown>
}) {
  const ref = await db.collection("emailEvents").add({
    type: "CRM_INTERNAL_NOTE",
    to: params.to,
    subject: params.subject,
    status: params.status,
    provider: "smtp",
    ...(params.error ? { error: params.error } : {}),
    meta: params.meta,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

async function updateCrmInternalNoteEmailEvent(
  eventId: string,
  patch: { status?: "sent" | "failed"; error?: string; meta?: Record<string, unknown> }
) {
  await db.collection("emailEvents").doc(eventId).set(
    {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.error ? { error: patch.error } : {}),
      ...(patch.meta ? { meta: patch.meta } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

function crmInternalThreadMessageEventKey(params: {
  eventType: CrmInternalThreadMessageNotifyEventType
  threadId: string
  messageId: string
  dateKey?: string
}) {
  if (params.eventType === "created") return `crm_internal_thread_message_created:${params.threadId}:${params.messageId}`
  return `crm_internal_thread_message_overdue_daily:${params.threadId}:${params.messageId}:${params.dateKey || "no_date"}`
}

async function hasQueuedOrSentCrmInternalThreadMessageEvent(eventKey: string) {
  const rows = await db.collection("emailEvents").where("meta.crmInternalThreadMessageEventKey", "==", eventKey).limit(20).get()
  return rows.docs.some((snap) => {
    const status = String(snap.data()?.status || "")
    return status === "queued" || status === "sent"
  })
}

async function logCrmInternalThreadMessageEmailEvent(params: {
  to: string[]
  subject: string
  status: "queued" | "sent" | "failed" | "skipped"
  error?: string
  meta: Record<string, unknown>
}) {
  const ref = await db.collection("emailEvents").add({
    type: "CRM_INTERNAL_THREAD_MESSAGE",
    to: params.to,
    subject: params.subject,
    status: params.status,
    provider: "smtp",
    ...(params.error ? { error: params.error } : {}),
    meta: params.meta,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

async function updateCrmInternalThreadMessageEmailEvent(
  eventId: string,
  patch: { status?: "sent" | "failed"; error?: string; meta?: Record<string, unknown> }
) {
  await db.collection("emailEvents").doc(eventId).set(
    {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.error ? { error: patch.error } : {}),
      ...(patch.meta ? { meta: patch.meta } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

async function dispatchCrmInternalThreadMessageNotification(params: {
  threadId: string
  messageId: string
  eventType: CrmInternalThreadMessageNotifyEventType
  dateKey?: string
}) {
  const threadId = String(params.threadId || "").trim()
  const messageId = String(params.messageId || "").trim()
  if (!threadId || !messageId) return { ok: false, skipped: true as const, reason: "missing_ids" }

  const messageSnap = await db.collection("crm_internal_threads").doc(threadId).collection("messages").doc(messageId).get()
  if (!messageSnap.exists) return { ok: false, skipped: true as const, reason: "message_not_found" }
  const message = messageSnap.data() as CrmInternalThreadMessageRecord

  if (!message.requiresConfirmation) {
    return { ok: true, skipped: true as const, reason: "no_confirmation_required" }
  }
  if (String(message.cycleStatus || "") !== "PENDING") {
    return { ok: true, skipped: true as const, reason: "cycle_not_pending" }
  }

  const toUserId = String(message.toUserId || "").trim()
  if (!toUserId) {
    return { ok: true, skipped: true as const, reason: "missing_recipient" }
  }
  const deadlineAtMs = crmDateToMs(message.deadlineAt)
  const eventKey = crmInternalThreadMessageEventKey({
    eventType: params.eventType,
    threadId,
    messageId,
    dateKey: params.dateKey,
  })
  if (await hasQueuedOrSentCrmInternalThreadMessageEvent(eventKey)) {
    return { ok: true, skipped: true as const, reason: "already_sent_or_queued" }
  }

  const recipient = await getUserEmail(toUserId)
  const recipientEmail = String(recipient.email || "").trim().toLowerCase()
  if (!isValidEmail(recipientEmail)) {
    await logCrmInternalThreadMessageEmailEvent({
      to: [],
      subject: `CRM Internal thread message skipped (${threadId}/${messageId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        threadId,
        messageId,
        reason: "no_valid_recipient_email",
      },
    })
    return { ok: true, skipped: true as const, reason: "no_valid_recipient_email" }
  }

  const senderUserId = String(message.fromUserId || "").trim()
  const sender = senderUserId ? await getUserEmail(senderUserId) : { email: null, displayName: null }
  const senderLabel = sender.displayName || sender.email || senderUserId || "Utilizator CRM"
  const recipientLabel = recipient.displayName || recipientEmail
  const deadlineLabel = formatRoDateTime(deadlineAtMs)
  const messageBody = String(message.message || "").trim() || "-"
  const messageContext = String(message.context || "").trim()
  const internalQs = new URLSearchParams()
  internalQs.set("section", "interne")
  internalQs.set("thread", threadId)
  internalQs.set("msg", messageId)
  const internalPath = `/crm/opportunities?${internalQs.toString()}`
  const baseUrl = getCrmBaseUrl()
  const internalUrl = baseUrl ? `${baseUrl}${internalPath}` : internalPath
  const subject =
    params.eventType === "created"
      ? "Ai primit un mesaj intern cu confirmare"
      : "Reminder: mesaj intern neconfirmat"
  const text =
    `${params.eventType === "created" ? "Ai primit un mesaj intern nou care necesită confirmare." : "Reminder zilnic: ai un mesaj intern neconfirmat."}\n\n` +
    `Destinatar: ${recipientLabel}\n` +
    `De la: ${senderLabel}\n` +
    `Termen: ${deadlineLabel}\n` +
    `${messageContext ? `Context: ${messageContext}\n` : ""}` +
    `Mesaj: ${messageBody}\n\n` +
    `Deschide direct mesajul în CRM: ${internalUrl}\n`
  const html = `
    <div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="padding:18px 20px;background:#0f172a;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Notificare CRM</div>
          <h2 style="margin:6px 0 4px;font-size:20px;line-height:1.3;">${escapeHtml(subject)}</h2>
        </div>
        <div style="padding:20px;">
          <p style="margin:0;font-size:13px;color:#334155;"><strong>De la:</strong> ${escapeHtml(senderLabel)}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Termen:</strong> ${escapeHtml(deadlineLabel)}</p>
          ${messageContext ? `<p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Context:</strong> ${escapeHtml(messageContext)}</p>` : ""}
          <p style="margin:10px 0 0;font-size:14px;line-height:1.5;color:#334155;">${escapeHtml(messageBody)}</p>
          <div style="margin-top:16px;">
            <a href="${escapeHtml(internalUrl)}" style="display:inline-block;padding:11px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;">
              Deschide mesajul
            </a>
          </div>
        </div>
      </div>
    </div>
  `

  const emailEventId = await logCrmInternalThreadMessageEmailEvent({
    to: [recipientEmail],
    subject,
    status: "queued",
    meta: {
      eventType: params.eventType,
      threadId,
      messageId,
      toUserId,
      deadlineAtMs,
      crmInternalThreadMessageEventKey: eventKey,
      dateKey: params.dateKey || null,
    },
  })

  try {
    await smtpSendMail({
      to: recipientEmail,
      subject,
      text,
      html,
    })
    console.log("[CRM Interne] email sent to", recipientEmail, "threadId:", threadId, "messageId:", messageId)
    await updateCrmInternalThreadMessageEmailEvent(emailEventId, { status: "sent" })
    return { ok: true, skipped: false as const, sentCount: 1 }
  } catch (error: any) {
    await updateCrmInternalThreadMessageEmailEvent(emailEventId, {
      status: "failed",
      error: String(error?.message || error || "unknown"),
    })
    return { ok: false, skipped: false as const, reason: "send_failed" }
  }
}

async function dispatchCrmInternalNoteNotification(params: {
  noteId: string
  eventType: CrmInternalNoteNotifyEventType
  dateKey?: string
}) {
  const noteId = String(params.noteId || "").trim()
  if (!noteId) return { ok: false, skipped: true as const, reason: "missing_note_id" }

  const noteSnap = await db.collection("crm_internal_notes").doc(noteId).get()
  if (!noteSnap.exists) return { ok: false, skipped: true as const, reason: "note_not_found" }
  const note = noteSnap.data() as CrmInternalNoteRecord

  if (note.opportunityId !== null && note.opportunityId !== undefined) {
    return { ok: true, skipped: true as const, reason: "not_standalone_note" }
  }

  const status = String(note.status || "")
  if (status !== "PENDING") {
    await logCrmInternalNoteEmailEvent({
      to: [],
      subject: `CRM Internal note skipped (${noteId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        noteId,
        reason: "status_not_pending",
        status,
      },
    })
    return { ok: true, skipped: true as const, reason: "status_not_pending" }
  }

  const toUserId = String(note.toUserId || "").trim()
  if (!toUserId) {
    await logCrmInternalNoteEmailEvent({
      to: [],
      subject: `CRM Internal note skipped (${noteId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        noteId,
        reason: "missing_recipient",
      },
    })
    return { ok: true, skipped: true as const, reason: "missing_recipient" }
  }

  const dueAtMs = crmDateToMs(note.dueAt)
  const eventKey = crmInternalNoteEventKey({
    eventType: params.eventType,
    noteId,
    dateKey: params.dateKey,
  })
  if (await hasQueuedOrSentCrmInternalNoteEvent(eventKey)) {
    return { ok: true, skipped: true as const, reason: "already_sent_or_queued" }
  }

  const recipient = await getUserEmail(toUserId)
  const recipientEmail = String(recipient.email || "").trim().toLowerCase()
  if (!isValidEmail(recipientEmail)) {
    await logCrmInternalNoteEmailEvent({
      to: [],
      subject: `CRM Internal note skipped (${noteId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        noteId,
        reason: "no_valid_recipient_email",
        toUserId,
      },
    })
    return { ok: true, skipped: true as const, reason: "no_valid_recipient_email" }
  }

  const senderUserId = String(note.fromUserId || "").trim()
  const sender = senderUserId ? await getUserEmail(senderUserId) : { email: null, displayName: null }
  const senderLabel = sender.displayName || sender.email || senderUserId || "Utilizator CRM"
  const recipientLabel = recipient.displayName || recipientEmail
  const dueAtLabel = formatRoDateTime(dueAtMs)
  const noteMessage = String(note.message || "").trim() || "-"
  const noteContext = String(note.context || "").trim()
  const internalNoteQs = new URLSearchParams()
  internalNoteQs.set("section", "interne")
  internalNoteQs.set("legacyNote", noteId)
  const internalPath = `/crm/opportunities?${internalNoteQs.toString()}`
  const baseUrl = getCrmBaseUrl()
  const internalUrl = baseUrl ? `${baseUrl}${internalPath}` : internalPath
  const subject =
    params.eventType === "created"
      ? "Ai primit o notă internă nouă"
      : "Reminder: ai o notă internă neconfirmată"
  const headerTitle =
    params.eventType === "created"
      ? "Notă internă nouă"
      : "Reminder notă internă"
  const headerSubtitle =
    params.eventType === "created"
      ? "Ai primit o solicitare internă care necesită confirmare."
      : "Nota internă este încă în așteptare și necesită confirmare."
  const text =
    `${params.eventType === "created" ? "Ai primit o notă internă nouă." : "Reminder zilnic: ai o notă internă neconfirmată."}\n\n` +
    `Destinatar: ${recipientLabel}\n` +
    `De la: ${senderLabel}\n` +
    `Termen: ${dueAtLabel}\n` +
    `${noteContext ? `Context: ${noteContext}\n` : ""}` +
    `Mesaj: ${noteMessage}\n\n` +
    `Deschide direct nota în CRM: ${internalUrl}\n`
  const html = `
    <div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="padding:18px 20px;background:#0f172a;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Notificare CRM</div>
          <h2 style="margin:6px 0 4px;font-size:20px;line-height:1.3;">${escapeHtml(headerTitle)}</h2>
          <p style="margin:0;font-size:13px;opacity:.9;">${escapeHtml(headerSubtitle)}</p>
        </div>
        <div style="padding:20px;">
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 14px 10px;">
            <p style="margin:0;font-size:13px;color:#334155;"><strong>De la:</strong> ${escapeHtml(senderLabel)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Termen:</strong> ${escapeHtml(dueAtLabel)}</p>
            ${noteContext ? `<p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Context:</strong> ${escapeHtml(noteContext)}</p>` : ""}
            <p style="margin:10px 0 0;font-size:14px;color:#0f172a;"><strong>Mesaj:</strong></p>
            <p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:#334155;">${escapeHtml(noteMessage)}</p>
          </div>
          <div style="margin-top:16px;">
            <a href="${escapeHtml(internalUrl)}" style="display:inline-block;padding:11px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;">
              Deschide nota
            </a>
          </div>
          <p style="margin:14px 0 0;font-size:12px;color:#64748b;">
            Dacă butonul nu funcționează, deschide manual: ${escapeHtml(internalUrl)}
          </p>
        </div>
      </div>
    </div>
  `

  const emailEventId = await logCrmInternalNoteEmailEvent({
    to: [recipientEmail],
    subject,
    status: "queued",
    meta: {
      eventType: params.eventType,
      noteId,
      toUserId,
      dueAtMs,
      crmInternalNoteEventKey: eventKey,
      dateKey: params.dateKey || null,
    },
  })

  try {
    await smtpSendMail({
      to: recipientEmail,
      subject,
      text,
      html,
    })
    await updateCrmInternalNoteEmailEvent(emailEventId, { status: "sent" })
    return { ok: true, skipped: false as const, sentCount: 1 }
  } catch (error: any) {
    await updateCrmInternalNoteEmailEvent(emailEventId, {
      status: "failed",
      error: String(error?.message || error || "unknown"),
    })
    return { ok: false, skipped: false as const, reason: "send_failed" }
  }
}

async function dispatchCrmTaskNotification(params: {
  taskId: string
  eventType: CrmTaskNotifyEventType
  recipientUserIds?: string[]
  actorUserId?: string | null
}) {
  const taskId = String(params.taskId || "").trim()
  if (!taskId) return { ok: false, skipped: true as const, reason: "missing_task_id" }

  const taskSnap = await db.collection("crm_tasks").doc(taskId).get()
  if (!taskSnap.exists) return { ok: false, skipped: true as const, reason: "task_not_found" }

  const task = taskSnap.data() as CrmTaskRecord
  const opportunityId = String(task.opportunityId || "")
  if (!opportunityId) return { ok: false, skipped: true as const, reason: "missing_opportunity_id" }

  const dueAtMs = crmDateToMs(task.dueAt)
  const updatedAtMs = crmDateToMs(task.updatedAt)
  const eventKey = crmTaskEventKey({ eventType: params.eventType, taskId, dueAtMs })
  if (params.eventType === "reassigned") {
    const reassignKey = `crm_task_reassigned:${taskId}:${String(task.assigneeId || "none")}:${updatedAtMs || "no_updated"}`
    if (await hasQueuedOrSentCrmTaskEvent(reassignKey)) {
      return { ok: true, skipped: true as const, reason: "already_sent_or_queued" }
    }
  }
  if (await hasQueuedOrSentCrmTaskEvent(eventKey)) {
    return { ok: true, skipped: true as const, reason: "already_sent_or_queued" }
  }

  const status = String(task.status || "")
  if (params.eventType === "reminder_15m" && status !== "TODO" && status !== "IN_PROGRESS") {
    await logCrmTaskEmailEvent({
      to: [],
      subject: `CRM Task reminder skipped (${taskId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        taskId,
        opportunityId,
        status,
        reason: "status_not_open",
        crmTaskEventKey: eventKey,
      },
    })
    return { ok: true, skipped: true as const, reason: "status_not_open" }
  }

  if (params.eventType === "reminder_15m" && !dueAtMs) {
    await logCrmTaskEmailEvent({
      to: [],
      subject: `CRM Task reminder skipped (${taskId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        taskId,
        opportunityId,
        reason: "missing_due_at",
        crmTaskEventKey: eventKey,
      },
    })
    return { ok: true, skipped: true as const, reason: "missing_due_at" }
  }

  const opportunitySnap = await db.collection("crm_opportunities").doc(opportunityId).get()
  if (!opportunitySnap.exists) return { ok: false, skipped: true as const, reason: "opportunity_not_found" }
  const opportunity = opportunitySnap.data() as CrmOpportunityRecord

  const candidateUserIds =
    params.eventType === "reminder_15m"
      ? Array.from(new Set([String(task.assigneeId || ""), String(opportunity.ownerId || "")].filter(Boolean)))
      : params.recipientUserIds?.length
        ? Array.from(new Set(params.recipientUserIds.filter(Boolean)))
        : Array.from(new Set([String(task.assigneeId || "")].filter(Boolean)))

  const recipientsByEmail = new Map<string, { uid: string; displayName: string }>()
  for (const uid of candidateUserIds) {
    const user = await getUserEmail(uid)
    const email = String(user.email || "").trim().toLowerCase()
    if (!isValidEmail(email)) continue
    if (!recipientsByEmail.has(email)) {
      recipientsByEmail.set(email, {
        uid,
        displayName: user.displayName || email,
      })
    }
  }

  const recipientEmails = Array.from(recipientsByEmail.keys())
  if (recipientEmails.length === 0) {
    await logCrmTaskEmailEvent({
      to: [],
      subject: `CRM Task notification skipped (${taskId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        taskId,
        opportunityId,
        reason: "no_valid_recipients",
        crmTaskEventKey: eventKey,
      },
    })
    return { ok: true, skipped: true as const, reason: "no_valid_recipients" }
  }

  const taskTitle = String(task.title || "Sarcină CRM")
  const taskStatusLabel =
    status === "IN_PROGRESS"
      ? "În lucru"
      : status === "DONE"
        ? "Completată"
        : status === "CANCELED"
          ? "Anulată"
          : "To Do"
  const opportunityCode = String(opportunity.code || "")
  const opportunityTitle = String(opportunity.title || "")
  const opportunityLabel = [opportunityCode, opportunityTitle].filter(Boolean).join(" - ") || opportunityId
  const dueAtLabel = formatRoDateTime(dueAtMs)
  const actorUserId =
    typeof params.actorUserId === "string" && params.actorUserId.trim()
      ? params.actorUserId.trim()
      : params.eventType === "assigned"
        ? String(task.createdById || "").trim()
        : String(task.updatedById || "").trim()
  const actorUser = actorUserId ? await getUserEmail(actorUserId) : { displayName: null, email: null }
  const assignedByLabel = actorUser.displayName || actorUser.email || actorUserId || "Sistem CRM"
  const taskPath = `/crm/opportunities/${opportunityId}/tasks`
  const baseUrl = getCrmBaseUrl()
  const taskUrl = baseUrl ? `${baseUrl}${taskPath}` : taskPath

  const subject =
    params.eventType === "assigned"
      ? "Ai primit o sarcină nouă"
      : params.eventType === "reassigned"
        ? "Ți-a fost reasignată o sarcină"
        : `Reminder (15 min): ${taskTitle}`
  const eventTitle =
    params.eventType === "assigned"
      ? "Ai primit o sarcină nouă"
      : params.eventType === "reassigned"
        ? "Ți-a fost reasignată o sarcină"
        : "Reminder sarcină"
  const eventSubtitle =
    params.eventType === "assigned"
      ? "Sarcina a fost atribuită către tine."
      : params.eventType === "reassigned"
        ? "Responsabilul sarcinii a fost schimbat."
        : "Sarcina are termen în aproximativ 15 minute."
  const statusBadgeStyle =
    status === "DONE"
      ? "background:#dcfce7;color:#166534;"
      : status === "IN_PROGRESS"
        ? "background:#dbeafe;color:#1d4ed8;"
        : status === "CANCELED"
          ? "background:#fee2e2;color:#991b1b;"
          : "background:#e2e8f0;color:#334155;"

  const text =
    `${params.eventType === "assigned"
      ? "Ai primit o sarcină nouă în CRM."
      : params.eventType === "reassigned"
        ? "Ți-a fost reasignată o sarcină în CRM."
        : "Reminder: sarcina are termen în aproximativ 15 minute."}\n\n` +
    `Sarcină: ${taskTitle}\n` +
    `Status: ${status || "TODO"}\n` +
    `Termen: ${dueAtLabel}\n` +
    `Oportunitate: ${opportunityLabel}\n` +
    `Atribuită de: ${assignedByLabel}\n` +
    `Link: ${taskUrl}\n`

  const html = `
    <div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="padding:18px 20px;background:#0f172a;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Notificare CRM</div>
          <h2 style="margin:6px 0 4px;font-size:20px;line-height:1.3;">${escapeHtml(eventTitle)}</h2>
          <p style="margin:0;font-size:13px;opacity:.9;">${escapeHtml(eventSubtitle)}</p>
        </div>

        <div style="padding:20px;">
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 14px 10px;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
              <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${escapeHtml(taskTitle)}</p>
              <span style="display:inline-block;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700;${statusBadgeStyle}">
                ${escapeHtml(taskStatusLabel)}
              </span>
            </div>
            <p style="margin:10px 0 0;font-size:13px;color:#334155;"><strong>Oportunitate:</strong> ${escapeHtml(opportunityLabel)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Termen:</strong> ${escapeHtml(dueAtLabel)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Atribuită de:</strong> ${escapeHtml(assignedByLabel)}</p>
          </div>

          <div style="margin-top:16px;">
            <a href="${escapeHtml(taskUrl)}" style="display:inline-block;padding:11px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;">
              Vezi sarcina
            </a>
          </div>

          <p style="margin:14px 0 0;font-size:12px;color:#64748b;">
            Dacă butonul nu funcționează, deschide manual: ${escapeHtml(taskUrl)}
          </p>
        </div>
      </div>
    </div>
  `

  const emailEventId = await logCrmTaskEmailEvent({
    to: recipientEmails,
    subject,
    status: "queued",
    meta: {
      eventType: params.eventType,
      taskId,
      opportunityId,
      dueAtMs,
      crmTaskEventKey: eventKey,
      recipientUserIds: Array.from(recipientsByEmail.values()).map((row) => row.uid),
    },
  })

  try {
    for (const to of recipientEmails) {
      await smtpSendMail({
        to,
        subject,
        text,
        html,
      })
    }

    await updateCrmTaskEmailEvent(emailEventId, { status: "sent" })
    return { ok: true, skipped: false as const, sentCount: recipientEmails.length }
  } catch (error: any) {
    await updateCrmTaskEmailEvent(emailEventId, {
      status: "failed",
      error: String(error?.message || error || "unknown"),
    })
    return { ok: false, skipped: false as const, reason: "send_failed" }
  }
}

function kindLabel(kind: HrRequestKind) {
  switch (kind) {
    case "CO":
      return "Concediu de odihnă"
    case "CFP":
      return "Concediu fără plată"
    case "CM":
      return "Concediu medical"
    case "IN":
      return "Învoire"
    case "DEL":
      return "Delegație"
    case "CORRECT_HOURS":
      return "Corectare ore"
    case "ADD_OVERTIME":
      return "Ore suplimentare"
    default:
      return String(kind)
  }
}

function statusLabel(status: HrRequestStatus) {
  if (status === "approved") return "Aprobat"
  if (status === "rejected") return "Respins"
  return "În așteptare"
}

function requestDateLabel(req: HrRequest) {
  const p: any = req.payload ?? {}
  if (p?.startDate && p?.endDate) return `${p.startDate} → ${p.endDate}`
  if (p?.date && p?.startTime && p?.endTime) return `${p.date} • ${p.startTime}–${p.endTime}`
  if (p?.date) return String(p.date)
  return "—"
}

function getAppBaseUrl() {
  const cfg: any = (functions as any).config?.() ?? {}
  const fromEnv = process.env.APP_BASE_URL || process.env.CRM_APP_BASE_URL || cfg.app?.base_url || cfg.crm?.base_url
  let base = String(fromEnv || "").trim().replace(/\/+$/, "")
  if (!base) {
    base = "https://fom.nrg-acces.ro"
  } else if (!base.startsWith("http://") && !base.startsWith("https://")) {
    base = `https://${base}`
  }
  return base
}

function formatRoDateKey(dateKey: string | null | undefined) {
  const value = String(dateKey || "").trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value || "—"
  return `${match[3]}.${match[2]}.${match[1]}`
}

function dateKeyToUtcMs(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return Date.UTC(year, month - 1, day, 12, 0, 0, 0)
}

function addDaysToDateKey(dateKey: string, days: number) {
  const baseMs = dateKeyToUtcMs(dateKey)
  if (baseMs == null || !Number.isFinite(days)) return null
  const shifted = new Date(baseMs)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const day = String(shifted.getUTCDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function diffDateKeysInDays(startDateKey: string, endDateKey: string) {
  const startMs = dateKeyToUtcMs(startDateKey)
  const endMs = dateKeyToUtcMs(endDateKey)
  if (startMs == null || endMs == null) return null
  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000))
}

function isHrRequestReminderEligibleKind(kind: HrRequestKind) {
  return kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL" || kind === "IN"
}

function hrRequestStartDateKey(req: HrRequest) {
  const payload: any = req.payload ?? {}
  if (req.kind === "IN") {
    const date = String(payload?.date || "").trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null
  }
  if (req.kind === "CO" || req.kind === "CFP" || req.kind === "CM" || req.kind === "DEL") {
    const startDate = String(payload?.startDate || "").trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null
  }
  return null
}

function hrRequestReminderEventKey(params: {
  eventType: HrRequestReminderEventType
  requestId: string
  weekNumber?: number | null
  startDateKey?: string | null
}) {
  if (params.eventType === "day_before_start") {
    return `hr_request_day_before:${params.requestId}:${params.startDateKey || "no_start_date"}`
  }
  return `hr_request_pending_weekly:${params.requestId}:${params.weekNumber || "no_week"}`
}

async function hasQueuedOrSentHrRequestReminderEvent(eventKey: string) {
  const rows = await db.collection("emailEvents").where("meta.hrRequestReminderEventKey", "==", eventKey).limit(20).get()
  return rows.docs.some((snap) => {
    const status = String(snap.data()?.status || "")
    return status === "queued" || status === "sent"
  })
}

async function logHrRequestReminderEmailEvent(params: {
  to: string[]
  subject: string
  status: "queued" | "sent" | "failed" | "skipped"
  error?: string
  meta: Record<string, unknown>
}) {
  const ref = await db.collection("emailEvents").add({
    type: "HR_REQUEST_REMINDER",
    to: params.to,
    subject: params.subject,
    status: params.status,
    provider: "smtp",
    ...(params.error ? { error: params.error } : {}),
    meta: params.meta,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return ref.id
}

async function updateHrRequestReminderEmailEvent(
  eventId: string,
  patch: { status?: "sent" | "failed"; error?: string; meta?: Record<string, unknown> }
) {
  await db.collection("emailEvents").doc(eventId).set(
    {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.error ? { error: patch.error } : {}),
      ...(patch.meta ? { meta: patch.meta } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

async function dispatchHrRequestPendingReminder(params: {
  requestId: string
  eventType: HrRequestReminderEventType
  todayDateKey: string
  weekNumber?: number | null
}) {
  const requestId = String(params.requestId || "").trim()
  if (!requestId) {
    hrReminderLog("skip", { requestId: "(empty)", reason: "missing_request_id", eventType: params.eventType })
    return { ok: false, skipped: true as const, reason: "missing_request_id" }
  }

  hrReminderLog("evaluate", {
    requestId,
    eventType: params.eventType,
    todayDateKey: params.todayDateKey,
    weekNumber: params.weekNumber ?? null,
  })

  const snap = await db.collection("hrRequests").doc(requestId).get()
  if (!snap.exists) {
    hrReminderLog("skip", { requestId, reason: "request_not_found", eventType: params.eventType })
    return { ok: false, skipped: true as const, reason: "request_not_found" }
  }

  const data = snap.data() as any
  const req: HrRequest = {
    employeeId: String(data?.employeeId || ""),
    employeeName: data?.employeeName ? String(data.employeeName) : undefined,
    requesterUid: String(data?.requesterUid || ""),
    sectorId: String(data?.sectorId || ""),
    managerUid: String(data?.managerUid || ""),
    kind: String(data?.kind || "") as HrRequestKind,
    status: String(data?.status || "pending") as HrRequestStatus,
    payload: data?.payload ?? {},
    rejectionReason: data?.rejectionReason ?? null,
  }

  if (req.status !== "pending") {
    hrReminderLog("skip", { requestId, reason: "status_not_pending", status: req.status, eventType: params.eventType })
    return { ok: true, skipped: true as const, reason: "status_not_pending" }
  }
  if (!isHrRequestReminderEligibleKind(req.kind)) {
    hrReminderLog("skip", { requestId, reason: "kind_not_eligible", kind: req.kind, eventType: params.eventType })
    return { ok: true, skipped: true as const, reason: "kind_not_eligible" }
  }

  const startDateKey = hrRequestStartDateKey(req)
  if (!startDateKey) {
    hrReminderLog("skip", { requestId, reason: "missing_start_date", kind: req.kind, eventType: params.eventType })
    return { ok: true, skipped: true as const, reason: "missing_start_date" }
  }

  const createdAtMs = crmDateToMs(data?.createdAt)
  if (!createdAtMs) {
    hrReminderLog("skip", { requestId, reason: "missing_created_at", eventType: params.eventType })
    return { ok: true, skipped: true as const, reason: "missing_created_at" }
  }

  const createdDateKey = formatDateKeyInTimeZone(createdAtMs, TIMEZONE)
  const daysPending = diffDateKeysInDays(createdDateKey, params.todayDateKey)
  if (daysPending == null || daysPending < 0) {
    hrReminderLog("skip", {
      requestId,
      reason: "invalid_pending_age",
      createdDateKey,
      todayDateKey: params.todayDateKey,
      daysPending,
      eventType: params.eventType,
    })
    return { ok: true, skipped: true as const, reason: "invalid_pending_age" }
  }

  const eventKey = hrRequestReminderEventKey({
    eventType: params.eventType,
    requestId,
    weekNumber: params.weekNumber ?? null,
    startDateKey,
  })
  if (await hasQueuedOrSentHrRequestReminderEvent(eventKey)) {
    hrReminderLog("skip", {
      requestId,
      reason: "already_sent_or_queued",
      eventKey,
      eventType: params.eventType,
      note: "există deja emailEvents queued/sent pentru această cheie",
    })
    return { ok: true, skipped: true as const, reason: "already_sent_or_queued" }
  }

  const manager = await getUserEmail(req.managerUid)
  const managerEmail = String(manager.email || "").trim().toLowerCase()
  if (!isValidEmail(managerEmail)) {
    await logHrRequestReminderEmailEvent({
      to: [],
      subject: `HR request reminder skipped (${requestId})`,
      status: "skipped",
      meta: {
        eventType: params.eventType,
        requestId,
        managerUid: req.managerUid || null,
        reason: "no_valid_manager_email",
        hrRequestReminderEventKey: eventKey,
      },
    })
    hrReminderLog("skip", {
      requestId,
      reason: "no_valid_manager_email",
      managerUid: req.managerUid,
      eventKey,
      eventType: params.eventType,
      rawEmailFromUsersDoc: manager.email,
    })
    return { ok: true, skipped: true as const, reason: "no_valid_manager_email" }
  }

  const approvalsUrl = `${getAppBaseUrl()}/dashboard/cereri-aprobari`
  const employeeName = req.employeeName || req.employeeId || "—"
  const title = `${kindLabel(req.kind)} • ${requestDateLabel(req)}`
  const managerLabel = manager.displayName || managerEmail
  const subject =
    params.eventType === "day_before_start"
      ? `Reminder urgent aprobare cerere: ${title}`
      : `Reminder aprobare cerere în așteptare: ${title}`
  const intro =
    params.eventType === "day_before_start"
      ? "Cererea de mai jos începe mâine și este încă în așteptare."
      : `Cererea de mai jos este încă în așteptare de ${daysPending} zile.`
  const details =
    `Aprobator: ${managerLabel}\n` +
    `Angajat: ${employeeName}\n` +
    `Tip: ${kindLabel(req.kind)}\n` +
    `Perioadă/zi: ${requestDateLabel(req)}\n` +
    `Status: ${statusLabel(req.status)}\n` +
    `Creată la: ${formatRoDateKey(createdDateKey)}\n` +
    `Începe la: ${formatRoDateKey(startDateKey)}\n`
  const text = `${intro}\n\n${details}\nDeschide aplicația: ${approvalsUrl}\n`
  const html = `
    <div style="background:#f1f5f9;padding:24px 12px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
        <div style="padding:18px 20px;background:#0f172a;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;">Reminder HR</div>
          <h2 style="margin:6px 0 4px;font-size:20px;line-height:1.3;">${escapeHtml(subject)}</h2>
          <p style="margin:0;font-size:13px;opacity:.9;">${escapeHtml(intro)}</p>
        </div>
        <div style="padding:20px;">
          <div style="border:1px solid #e2e8f0;border-radius:10px;padding:14px 14px 10px;">
            <p style="margin:0;font-size:13px;color:#334155;"><strong>Angajat:</strong> ${escapeHtml(employeeName)}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Tip:</strong> ${escapeHtml(kindLabel(req.kind))}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Perioadă/zi:</strong> ${escapeHtml(requestDateLabel(req))}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Status:</strong> ${escapeHtml(statusLabel(req.status))}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Creată la:</strong> ${escapeHtml(formatRoDateKey(createdDateKey))}</p>
            <p style="margin:6px 0 0;font-size:13px;color:#334155;"><strong>Începe la:</strong> ${escapeHtml(formatRoDateKey(startDateKey))}</p>
          </div>
          <div style="margin-top:16px;">
            <a href="${escapeHtml(approvalsUrl)}" style="display:inline-block;padding:11px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:700;">
              Deschide aprobările
            </a>
          </div>
          <p style="margin:14px 0 0;font-size:12px;color:#64748b;">
            Dacă butonul nu funcționează, deschide manual: ${escapeHtml(approvalsUrl)}
          </p>
        </div>
      </div>
    </div>
  `

  const emailEventId = await logHrRequestReminderEmailEvent({
    to: [managerEmail],
    subject,
    status: "queued",
    meta: {
      eventType: params.eventType,
      requestId,
      managerUid: req.managerUid || null,
      hrRequestReminderEventKey: eventKey,
      todayDateKey: params.todayDateKey,
      weekNumber: params.weekNumber ?? null,
      daysPending,
      startDateKey,
    },
  })

  const smtpCfg = getSmtpConfig()
  hrReminderLog("smtp_attempt", {
    requestId,
    to: managerEmail,
    managerUid: req.managerUid,
    emailEventId,
    eventKey,
    eventType: params.eventType,
    daysPending,
    weekNumber: params.weekNumber ?? null,
    subjectPreview: subject.slice(0, 120),
    smtpConfigured: Boolean(smtpCfg),
    smtpHost: smtpCfg?.host ?? null,
    smtpPort: smtpCfg?.port ?? null,
    smtpSecure: smtpCfg?.secure ?? null,
    smtpFrom: smtpCfg?.from ?? null,
  })

  try {
    await smtpSendMail({
      to: managerEmail,
      subject,
      text,
      html,
    })
    await updateHrRequestReminderEmailEvent(emailEventId, { status: "sent" })
    hrReminderLog("smtp_ok", { requestId, to: managerEmail, emailEventId, eventKey })
    return { ok: true, skipped: false as const, sentCount: 1 }
  } catch (error: any) {
    const errMsg = String(error?.message || error || "unknown")
    const stack = error?.stack ? String(error.stack).slice(0, 800) : undefined
    hrReminderErr("smtp_failed", {
      requestId,
      to: managerEmail,
      emailEventId,
      eventKey,
      error: errMsg,
      stack,
    })
    await updateHrRequestReminderEmailEvent(emailEventId, {
      status: "failed",
      error: errMsg,
    })
    return { ok: false, skipped: false as const, reason: "send_failed", error: errMsg }
  }
}

type TimesheetCell = {
  code: string
  hours?: number
  entries?: Array<{
    start: string
    end: string
    project?: string
    methodStart?: string
    methodEnd?: string
    sourceRequestId?: string
    sourceRequestKind?: HrRequestKind
  }>
  breaks?: Array<{
    start: string
    end: string
    sourceRequestId?: string
    sourceRequestKind?: HrRequestKind
  }>
}

function parseDateParts(yyyyMmDd: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(yyyyMmDd).trim())
  if (!m) return null
  const y = Number(m[1])
  const mm = Number(m[2])
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mm) || !Number.isFinite(d)) return null
  if (mm < 1 || mm > 12 || d < 1 || d > 31) return null
  return { y, m: mm, d }
}

function monthKeyFromDate(yyyyMmDd: string): string | null {
  const p = parseDateParts(yyyyMmDd)
  if (!p) return null
  return `${p.y}-${String(p.m).padStart(2, "0")}`
}

function timesheetDocId(employeeId: string, monthKey: string) {
  return `${employeeId}_${monthKey}`
}

function enumerateDatesInclusive(start: string, end: string): string[] {
  const ps = parseDateParts(start)
  const pe = parseDateParts(end)
  if (!ps || !pe) return []
  const startUtc = Date.UTC(ps.y, ps.m - 1, ps.d)
  const endUtc = Date.UTC(pe.y, pe.m - 1, pe.d)
  if (!Number.isFinite(startUtc) || !Number.isFinite(endUtc)) return []
  const out: string[] = []
  for (let t = startUtc; t <= endUtc; t += 24 * 60 * 60 * 1000) {
    const d = new Date(t)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, "0")
    const day = String(d.getUTCDate()).padStart(2, "0")
    out.push(`${y}-${m}-${day}`)
  }
  return out
}

function parseHM(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v).trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function minutesToHM(total: number) {
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

function calcMinutes(cell: TimesheetCell): number {
  const entries = cell.entries ?? []
  const breaks = cell.breaks ?? []
  let work = 0
  for (const e of entries) {
    const s = parseHM(e.start)
    const en = parseHM(e.end)
    if (s == null || en == null) continue
    work += Math.max(0, en - s)
  }
  let br = 0
  for (const b of breaks) {
    const s = parseHM(b.start)
    const en = parseHM(b.end)
    if (s == null || en == null) continue
    br += Math.max(0, en - s)
  }
  return Math.max(0, work - br)
}

async function getEmployeeProgramEnd(employeeId: string): Promise<string> {
  try {
    const snap = await db.collection("hrEmployees").doc(employeeId).get()
    const end = (snap.data() as any)?.programLucruEnd
    if (typeof end === "string" && end.trim()) return end.trim()
    const defaultsSnap = await db.collection("hrSettings").doc("defaults").get()
    const defEnd = (defaultsSnap.data() as any)?.programLucruEnd
    if (typeof defEnd === "string" && defEnd.trim()) return defEnd.trim()
  } catch (e) {
    console.error("getEmployeeProgramEnd failed", employeeId, e)
  }
  return "16:30"
}

function buildTimesheetCellForRequest(params: {
  requestId: string
  req: HrRequest
  date: string // yyyy-mm-dd
  existing?: TimesheetCell | null
  programEnd?: string
}): TimesheetCell | null {
  const kind = params.req.kind
  const p = params.req.payload ?? {}
  const requestId = params.requestId

  if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    return { code: kind }
  }

  if (kind === "IN") {
    const startTime = String(p.startTime || "08:00")
    const endTime = String(p.endTime || "16:00")
    const entry = {
      start: startTime,
      end: endTime,
      project: "Învoire",
      methodStart: "Aprobat cerere",
      methodEnd: "Aprobat cerere",
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }
    const next: TimesheetCell = { code: "IN", entries: [entry], breaks: [] }
    next.hours = Math.round((calcMinutes(next) / 60) * 100) / 100
    return next
  }

  if (kind === "CORRECT_HOURS") {
    const entries = Array.isArray(p.entries) ? p.entries : []
    const breaks = Array.isArray(p.breaks) ? p.breaks : []
    const nextEntries = entries
      .filter((e: any) => e?.start && e?.end)
      .map((e: any) => ({
        start: String(e.start),
        end: String(e.end),
        project: e.project ? String(e.project) : undefined,
        methodStart: "Corectat (cerere aprobată)",
        methodEnd: "Corectat (cerere aprobată)",
        sourceRequestId: requestId,
        sourceRequestKind: kind,
      }))
    const nextBreaks = breaks
      .filter((b: any) => b?.start && b?.end)
      .map((b: any) => ({
        start: String(b.start),
        end: String(b.end),
        sourceRequestId: requestId,
        sourceRequestKind: kind,
      }))
    const next: TimesheetCell = { code: "WORK", entries: nextEntries, breaks: nextBreaks }
    next.hours = Math.round((calcMinutes(next) / 60) * 100) / 100
    return next
  }

  if (kind === "ADD_OVERTIME") {
    const overtimeHours = Number(p.overtimeHours ?? 0)
    if (!Number.isFinite(overtimeHours) || overtimeHours <= 0) return null
    const programEnd = params.programEnd ?? "16:30"
    const startM = parseHM(programEnd) ?? 16 * 60 + 30
    const endM = Math.min(23 * 60 + 59, startM + Math.round(overtimeHours * 60))
    const entry = {
      start: minutesToHM(startM),
      end: minutesToHM(endM),
      project: "Ore suplimentare",
      methodStart: "Aprobat cerere",
      methodEnd: "Aprobat cerere",
      sourceRequestId: requestId,
      sourceRequestKind: kind,
    }
    const existing = params.existing ?? null
    const baseEntries = Array.isArray(existing?.entries) ? existing!.entries! : []
    const baseBreaks = Array.isArray(existing?.breaks) ? existing!.breaks! : []
    // idempotency: if we already have an entry from this request, don't add again
    const already = baseEntries.some((e: any) => e?.sourceRequestId === requestId)
    const nextEntries = already ? baseEntries : [...baseEntries, entry]
    const next: TimesheetCell = { code: "WORK", entries: nextEntries, breaks: baseBreaks }
    next.hours = Math.round((calcMinutes(next) / 60) * 100) / 100
    return next
  }

  return null
}

async function applyApprovedHrRequest(params: { requestId: string; req: HrRequest }) {
  const req = params.req
  const requestId = params.requestId
  const kind = req.kind
  const payload = req.payload ?? {}

  if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
    const startDate = String(payload.startDate || "")
    const endDate = String(payload.endDate || "")
    const dates = enumerateDatesInclusive(startDate, endDate)
    if (!dates.length) return

    // Group by month to minimize writes
    const byMonth = new Map<string, string[]>()
    for (const d of dates) {
      const mk = monthKeyFromDate(d)
      if (!mk) continue
      const arr = byMonth.get(mk) ?? []
      arr.push(d)
      byMonth.set(mk, arr)
    }

    const batch = db.batch()
    for (const [monthKey, ds] of byMonth) {
      const ref = db.collection("hrTimesheets").doc(timesheetDocId(req.employeeId, monthKey))
      const updates: Record<string, any> = {
        employeeId: req.employeeId,
        monthKey,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }
      for (const dateStr of ds) {
        const parts = parseDateParts(dateStr)
        if (!parts) continue
        updates[`days.${String(parts.d)}`] = { code: kind }
      }
      batch.set(ref, updates, { merge: true })
    }
    await batch.commit()
    return
  }

  // Single-day requests
  const dayDate = String(payload.date || "")
  const mk = monthKeyFromDate(dayDate)
  const parts = parseDateParts(dayDate)
  if (!mk || !parts) return
  const day = parts.d

  const ref = db.collection("hrTimesheets").doc(timesheetDocId(req.employeeId, mk))
  const existingSnap = await ref.get()
  const existingCell = ((existingSnap.data() as any)?.days?.[String(day)] ?? null) as TimesheetCell | null
  const programEnd = kind === "ADD_OVERTIME" ? await getEmployeeProgramEnd(req.employeeId) : undefined
  const nextCell = buildTimesheetCellForRequest({ requestId, req, date: dayDate, existing: existingCell, programEnd })
  if (!nextCell) return

  await ref.set(
    {
      employeeId: req.employeeId,
      monthKey: mk,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      days: { [String(day)]: nextCell },
    },
    { merge: true }
  )
}

type Contract = {
  id: string
  name: string
  number?: string
  type?: string
  clientId?: string
  locationId?: string
  locationName?: string
  locationIds?: string[]
  locationNames?: string[]
  equipmentIds?: string[]
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: "zile" | "luni"
  daysBeforeWork?: number
  lastAutoWorkGenerated?: string
  revisionSchedulePreview?: RevisionPreview[]
}

type Client = {
  id: string
  nume?: string
}

type RevisionPreview = {
  scheduledIso?: string
  scheduledAt?: any
  generateIso?: string
  generateAt?: any
  locationId?: string
  locationName?: string
}

function toIsoDate(date: Date): string {
  return date.toISOString()
}

async function fetchClient(clientId?: string): Promise<{ name?: string; data?: Client }> {
  if (!clientId) return {}
  try {
    const snap = await db.collection("clienti").doc(clientId).get()
    if (snap.exists) {
      const data = snap.data() as Client
      return { name: data?.nume, data }
    }
  } catch (e) {
    console.error("fetchClient error", clientId, e)
  }
  return {}
}

async function workExists(contractId: string, locationId: string | undefined, scheduledIso: string) {
  // Avem date istorice cu câmpuri diferite (ex: `contract` = număr contract, sau `contractId` separat).
  // Pentru a evita duplicate, verificăm întâi pe `contractId`, apoi fallback pe `contract` (id-ul contractului).
  const probes: Array<"contractId" | "contract"> = ["contractId", "contract"]

  for (const field of probes) {
  let q = db.collection("lucrari")
      .where(field, "==", contractId)
    .where("dataInterventie", "==", scheduledIso)

  if (locationId) {
    q = q.where("locationId", "==", locationId)
  }

  const snap = await q.limit(1).get()
    if (!snap.empty) return true
  }

  return false
}

async function getNextReportNumberAdmin(): Promise<string> {
  const ref = db.collection("numarRaport").doc("document-numar-raport")
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        tx.set(ref, { numarRaport: 2 })
        return 1
      }
      const current = (snap.data() as any)?.numarRaport || 1
      const next = current + 1
      tx.update(ref, { numarRaport: next })
      return current
    })
    return `#${result.toString().padStart(6, "0")}`
  } catch (e) {
    console.error("getNextReportNumberAdmin error", e)
    return `#${Date.now().toString().slice(-6)}`
  }
}

function parseWorkDate(value: any): Date | null {
  if (!value) return null
  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    if (typeof value?.toDate === "function") {
      const d = value.toDate()
      return Number.isNaN(d.getTime()) ? null : d
    }
    if (typeof value?.seconds === "number") {
      const d = new Date(value.seconds * 1000)
      return Number.isNaN(d.getTime()) ? null : d
    }
    if (typeof value === "number") {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? null : d
    }
    const raw = String(value || "").trim()
    if (!raw) return null
    const roMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
    if (roMatch) {
      const d = new Date(
        Number(roMatch[3]),
        Number(roMatch[2]) - 1,
        Number(roMatch[1]),
        Number(roMatch[4] || 0),
        Number(roMatch[5] || 0),
      )
      return Number.isNaN(d.getTime()) ? null : d
    }
    const isIsoLike = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2})?/.test(raw)
    if (isIsoLike) {
      const d = new Date(raw)
      return Number.isNaN(d.getTime()) ? null : d
    }
  } catch {
    return null
  }
  return null
}

function getRevisionDateForEquipment(work: any, equipmentId: string): Date | null {
  const times = work?.revisionEquipmentTimes
  const equipmentTime = times && typeof times === "object" ? times[equipmentId] : null
  const candidates = [
    equipmentTime?.endIso,
    equipmentTime?.startIso,
    work?.raportSnapshot?.dataGenerare,
    work?.timpPlecare,
    work?.dataInterventie,
    work?.updatedAt,
    work?.createdAt,
  ]
  for (const candidate of candidates) {
    const d = parseWorkDate(candidate)
    if (d) return d
  }
  return null
}

function isRevisionCompletedForEquipment(work: any, equipmentId: string): boolean {
  const statusByEquipment = work?.revision?.equipmentStatus
  if (statusByEquipment && typeof statusByEquipment === "object") {
    if (String(statusByEquipment[equipmentId] || "").toLowerCase() === "done") return true
  }
  const status = String(work?.statusLucrare || "").toLowerCase()
  return status === "finalizat" || status === "arhivată" || Boolean(work?.raportGenerat)
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function filterRecentlyReviewedEquipmentIds(params: {
  equipmentIds: string[]
  clientId?: string
  clientName?: string
  locationId?: string
  locationName?: string
}): Promise<{ allowed: string[]; blocked: string[] }> {
  const ids = Array.from(new Set(params.equipmentIds.map((id) => String(id || "").trim()).filter(Boolean)))
  if (ids.length === 0) return { allowed: [], blocked: [] }

  const now = new Date()
  const cutoff = new Date(now.getTime() - RECENT_REVISION_BLOCK_DAYS * 24 * 60 * 60 * 1000)
  const blocked = new Set<string>()
  const idSet = new Set(ids)
  const seenWorkIds = new Set<string>()

  for (const part of chunks(ids, 10)) {
    const snap = await db.collection("lucrari").where("equipmentIds", "array-contains-any", part).get()
    for (const docSnap of snap.docs) {
      if (seenWorkIds.has(docSnap.id)) continue
      seenWorkIds.add(docSnap.id)
      const work: any = { id: docSnap.id, ...docSnap.data() }
      if (String(work?.tipLucrare || "").toLowerCase() !== "revizie") continue

      const workClientId = String(work?.clientId || work?.clientInfo?.id || "").trim()
      const workClientName = String(work?.client || "").trim()
      if (params.clientId && workClientId && workClientId !== String(params.clientId).trim()) continue
      if (!params.clientId && params.clientName && workClientName && workClientName !== String(params.clientName).trim()) continue

      const workLocationId = String(work?.locationId || work?.clientInfo?.locationId || work?.clientInfo?.locatieId || "").trim()
      const workLocationName = String(work?.locatie || work?.locationName || "").trim()
      if (params.locationId && workLocationId && workLocationId !== String(params.locationId).trim()) continue
      if (!params.locationId && params.locationName && workLocationName && workLocationName !== String(params.locationName).trim()) continue

      const workEquipmentIds = Array.isArray(work?.equipmentIds)
        ? work.equipmentIds.map((id: any) => String(id || "").trim()).filter(Boolean)
        : []
      for (const equipmentId of workEquipmentIds) {
        if (!idSet.has(equipmentId)) continue
        if (!isRevisionCompletedForEquipment(work, equipmentId)) continue
        const revisionDate = getRevisionDateForEquipment(work, equipmentId)
        if (!revisionDate || revisionDate < cutoff || revisionDate > now) continue
        blocked.add(equipmentId)
      }
    }
  }

  return {
    allowed: ids.filter((id) => !blocked.has(id)),
    blocked: Array.from(blocked),
  }
}

function createWorkPayload(params: {
  contract: Contract
  clientName?: string
  clientInfo?: Client
  locationId?: string
  locationName?: string
  scheduledDate: Date
  nrLucrare: string
  equipmentIds?: string[]
}): Record<string, any> {
  const nowIso = toIsoDate(new Date())
  const scheduledIso = toIsoDate(params.scheduledDate)
  const equipmentIds =
    (Array.isArray(params.equipmentIds) ? params.equipmentIds : undefined) ??
    (Array.isArray(params.contract.equipmentIds) ? params.contract.equipmentIds : [])
  const contactName =
    (params.clientInfo as any)?.contact ||
    (params.clientInfo as any)?.persoanaContact ||
    (params.clientInfo as any)?.contactPerson ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.nume ||
    ""
  const contactPhone =
    (params.clientInfo as any)?.telefon ||
    (params.clientInfo as any)?.phone ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.telefon ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.phone ||
    ""

  // Metadata revizie: toate echipamentele sunt setate pe "pending"
  const revision = {
    checklistVersionId: "auto", // fallback; se poate sincroniza ulterior la primul checklist
    equipmentStatus: equipmentIds.reduce<Record<string, "pending">>((acc, id) => {
      acc[id] = "pending"
      return acc
    }, {}),
    doneCount: 0,
  }

  return {
    tipLucrare: "Revizie",
    statusLucrare: "Listată",
    statusFacturare: "Nefacturat",
    client: params.clientName || params.contract.clientId || "Client",
    clientId: params.contract.clientId || null,
    clientInfo: params.clientInfo || null,
    locatie: params.locationName || "",
    locationId: params.locationId || null,
    locationName: params.locationName || null,
    contract: params.contract.id, // compatibilitate: multe ecrane folosesc acest câmp
    contractId: params.contract.id, // câmp canonical pentru dedupe/filtrare
    contractNumber: params.contract.number || "",
    contractType: params.contract.type || "",
    dataEmiterii: nowIso,
    dataInterventie: scheduledIso,
    tehnicieni: [] as string[],
    persoaneContact: [],
    persoanaContact: contactName,
    telefon: contactPhone,
    contact: contactName,
    equipmentIds,
    revision,
    echipamentId: "",
    echipamentCod: "",
    descriere: "Revizie programată automat",
    defectReclamat: "",
    necesitaOferta: false,
    statusOferta: "NU",
    nrLucrare: params.nrLucrare,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: "system",
    createdByName: "CRON Revizie",
    notificationRead: false,
    notificationReadBy: [],
    raportGenerat: false,
    preluatDispecer: false,
    preluatDe: "",
    statusEchipament: "",
  }
}

async function generateRevisionWorks(params: { now: Date; contractId?: string }) {
  const now = params.now
  const contracts: Contract[] = []

  if (params.contractId) {
    const snap = await db.collection("contracts").doc(params.contractId).get()
    if (snap.exists) contracts.push({ id: snap.id, ...(snap.data() as any) })
  } else {
    const contractsSnap = await db.collection("contracts").get()
    contracts.push(...contractsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
  }

    let created = 0

    for (const contract of contracts) {
    if (created >= MAX_WORKS_PER_RUN) break
      if (!contract.revisionSchedulePreview || !Array.isArray(contract.revisionSchedulePreview)) continue

      const clientPayload = await fetchClient(contract.clientId)
      const locationEquipments = new Map<string, { id?: string; cod?: string }[]>()
      const contractEquipmentIds = Array.isArray((contract as any)?.equipmentIds)
        ? (contract as any).equipmentIds.map((id: any) => String(id))
        : []
      const locs = (clientPayload.data as any)?.locatii
      if (Array.isArray(locs)) {
        for (const loc of locs) {
          const locName = loc?.nume
          if (!locName) continue
          const eqList = Array.isArray(loc?.echipamente)
            ? loc.echipamente
                .map((eq: any) => ({
                  id: typeof eq?.id === "string" && eq.id.length > 0 ? String(eq.id) : undefined,
                  cod: typeof eq?.cod === "string" && eq.cod.length > 0 ? String(eq.cod) : undefined,
                }))
                .filter((eq: any) => eq.id || eq.cod)
            : []
          if (eqList.length) {
            locationEquipments.set(locName, eqList)
          }
        }
      }

      const entries: { generateAt: Date; scheduledAt: Date; locationId?: string; locationName?: string }[] = []
      for (const raw of contract.revisionSchedulePreview) {
        const genRaw = (raw as any).generateAt?.toDate?.() ?? (raw as any).generateIso ?? (raw as any).generateDate
        const schedRaw = (raw as any).scheduledAt?.toDate?.() ?? (raw as any).scheduledIso ?? (raw as any).scheduledDate
        const gen = genRaw ? new Date(genRaw) : null
        const sched = schedRaw ? new Date(schedRaw) : null
        if (!gen || Number.isNaN(gen.getTime()) || !sched || Number.isNaN(sched.getTime())) continue
        entries.push({
          generateAt: gen,
          scheduledAt: sched,
          locationId: (raw as any).locationId,
          locationName: (raw as any).locationName,
        })
      }

      entries.sort((a, b) => a.generateAt.getTime() - b.generateAt.getTime())

    const lastGeneratedRaw = contract.lastAutoWorkGenerated
    const lastGeneratedAt = lastGeneratedRaw ? new Date(lastGeneratedRaw) : null
    const lastGeneratedOk = lastGeneratedAt && !Number.isNaN(lastGeneratedAt.getTime()) ? lastGeneratedAt : null

    let createdForContract = 0

      for (const entry of entries) {
      if (created >= MAX_WORKS_PER_RUN) break

      // 1) Nu generăm înainte de generateAt (asta trebuie să corespundă UI "Următoarele date de generare")
      if (entry.generateAt > now) break
      // 2) Nu re-procesăm dacă deja am marcat că am generat până aici
      if (lastGeneratedOk && entry.generateAt <= lastGeneratedOk) continue
      // 3) Nu creăm revizii pentru date de execuție deja trecute (fără backfill implicit)
      if (entry.scheduledAt <= now) continue

        const scheduledIso = toIsoDate(entry.scheduledAt)
        const exists = await workExists(contract.id, entry.locationId, scheduledIso)
        if (exists) continue

        const nrLucrare = await getNextReportNumberAdmin()
        const locEqList = locationEquipments.get(entry.locationName || "") || []
        const locEqMatchSet = new Set(
          locEqList
            .flatMap((eq) => [eq.id, eq.cod])
            .filter((v) => typeof v === "string" && v.length > 0)
            .map((v) => String(v)),
        )
        let equipmentIdsForWork: string[] | undefined
        if (contractEquipmentIds.length > 0) {
          const filtered = contractEquipmentIds.filter((id: string) => locEqMatchSet.has(id))
          if (filtered.length === 0) {
            console.warn("generateRevisionWorks: contract has equipmentIds but none match location", {
              contractId: contract.id,
              locationName: entry.locationName,
              contractEquipmentIds,
              locEqList,
            })
            continue
          }
          equipmentIdsForWork = filtered
        } else {
          const fallbackIds = locEqList
            .map((eq) => (eq.id ? eq.id : eq.cod))
            .filter((v): v is string => typeof v === "string" && v.length > 0)
          equipmentIdsForWork = fallbackIds.length ? fallbackIds : undefined
        }

        const normalizedEquipmentIdsForWork = Array.isArray(equipmentIdsForWork)
          ? Array.from(new Set(equipmentIdsForWork.map((id) => String(id || "").trim()).filter(Boolean)))
          : []
        if (normalizedEquipmentIdsForWork.length === 0) {
          console.warn("generateRevisionWorks: skip create due to missing equipments", {
            contractId: contract.id,
            locationId: entry.locationId,
            locationName: entry.locationName,
            scheduledIso,
          })
          continue
        }

        const recentRevisionFilter = await filterRecentlyReviewedEquipmentIds({
          equipmentIds: normalizedEquipmentIdsForWork,
          clientId: contract.clientId,
          clientName: clientPayload.name,
          locationId: entry.locationId,
          locationName: entry.locationName,
        })
        if (recentRevisionFilter.blocked.length > 0) {
          console.log("generateRevisionWorks: skipped recently reviewed equipments", {
            contractId: contract.id,
            locationId: entry.locationId,
            locationName: entry.locationName,
            scheduledIso,
            blocked: recentRevisionFilter.blocked,
          })
        }
        if (recentRevisionFilter.allowed.length === 0) {
          console.warn("generateRevisionWorks: skip create because all equipments were reviewed recently", {
            contractId: contract.id,
            locationId: entry.locationId,
            locationName: entry.locationName,
            scheduledIso,
          })
          continue
        }

        const payload = createWorkPayload({
          contract,
          clientName: clientPayload.name,
          clientInfo: clientPayload.data,
          locationId: entry.locationId,
          locationName: entry.locationName,
          scheduledDate: entry.scheduledAt,
          nrLucrare,
          equipmentIds: recentRevisionFilter.allowed,
        })

      // Safety net: chiar dacă o altă bucată de cod ar crea prematur, UI va ascunde lucrarea până la generateAt.
      ;(payload as any).visibleAt = Timestamp.fromDate(entry.generateAt)
      ;(payload as any).autoGenerated = true

        await db.collection("lucrari").add(payload)
        created += 1
      createdForContract += 1
    }

    if (createdForContract > 0) {
      try {
        await db.collection("contracts").doc(contract.id).update({
          lastAutoWorkGenerated: toIsoDate(now),
        })
      } catch (e) {
        console.error("Failed to update lastAutoWorkGenerated", contract.id, e)
      }
    }
  }

  return { created }
}

// Numele acesta există deja în deploy (conform firebase debug log). Păstrăm aceeași semnătură și program.
export const generateScheduledWorks = functions
  .region(REGION)
  .pubsub.schedule("0 7,13 * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const res = await generateRevisionWorks({ now: new Date() })
    console.log("generateScheduledWorks completed", res)
    return null
  })

const DEPONTAJ_AUTO_GRACE_MINUTES = 30
const DEFAULT_PROGRAM_END_ATTENDANCE = "16:30"
const WORK_STATUS_IN_PROGRESS = "În lucru"

function parseHHmmAttendance(value: string | undefined, fallback: { h: number; m: number }) {
  if (!value) return fallback
  const [hStr, mStr] = String(value).trim().split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  return { h, m }
}

function timeOnSameDayMsAttendance(ts: number, hhmm: string | undefined, fallback: { h: number; m: number } = { h: 16, m: 30 }) {
  const d = new Date(ts)
  const { h, m } = parseHHmmAttendance(hhmm, fallback)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

function scheduleGraceThresholdMsAttendance(nowMs: number, programLucruEnd: string | undefined) {
  const endMs = timeOnSameDayMsAttendance(nowMs, programLucruEnd ?? DEFAULT_PROGRAM_END_ATTENDANCE)
  return endMs + DEPONTAJ_AUTO_GRACE_MINUTES * 60 * 1000
}

async function technicianHasOpenInProgressTicket(displayName: string | null): Promise<boolean> {
  const name = typeof displayName === "string" ? displayName.trim() : ""
  if (!name) return false
  const snap = await db
    .collection("lucrari")
    .where("tehnicieni", "array-contains", name)
    .where("statusLucrare", "==", WORK_STATUS_IN_PROGRESS)
    .limit(1)
    .get()
  return !snap.empty
}

function buildAutoCheckoutPatch(data: any, endMs: number, opts: { reason: string; forceEndOfDay?: boolean }) {
  const extraTimeLogs = Array.isArray(data?.extraTimeLogs) ? data.extraTimeLogs : null
  let nextExtraTimeLogs: any[] | null = null
  if (extraTimeLogs) {
    let changed = false
    nextExtraTimeLogs = extraTimeLogs.map((log: any) => {
      if (!log || typeof log !== "object") return log
      if (log.endTime) return log
      changed = true
      return {
        ...log,
        endTime: endMs,
        minutesEligible: Number.isFinite(Number(log.minutesEligible)) ? Number(log.minutesEligible) : 0,
      }
    })
    if (!changed) nextExtraTimeLogs = null
  }

  return {
    status: "completed",
    sessionEnd: Timestamp.fromMillis(endMs),
    checkOutMode: data?.mode ?? null,
    checkOutLocation: data?.location ?? null,
    checkOutDeviceInfo: {
      type: "auto",
      userAgent: opts.forceEndOfDay ? "auto-stop-23:59" : "auto-schedule-grace",
      reason: opts.reason,
    },
    checkOutAuto: true,
    checkOutAutoReason: opts.reason,
    ...(opts.forceEndOfDay ? { autoStopped: true, autoStoppedAt: FieldValue.serverTimestamp() } : {}),
    ...(nextExtraTimeLogs ? { extraTimeLogs: nextExtraTimeLogs } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

/**
 * Auto check-out at program end + grace (default 30 min), if no ticket „În lucru”.
 */
export const autoCheckOutScheduleGrace = functions
  .region(REGION)
  .pubsub.schedule("*/15 17-18 * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const nowMs = Date.now()
    let totalStopped = 0

    try {
      const snap = await db.collection("attendance").where("status", "==", "active").get()
      if (snap.empty) {
        console.log("autoCheckOutScheduleGrace: no active sessions")
        return null
      }

      for (const d of snap.docs) {
        const data = d.data() as any
        const userId = String(data?.userId || "")
        const programEnd = data?.programLucruEnd ? String(data.programLucruEnd) : DEFAULT_PROGRAM_END_ATTENDANCE
        const threshold = scheduleGraceThresholdMsAttendance(nowMs, programEnd)
        if (nowMs < threshold) continue

        const user = userId ? await getUserEmail(userId) : { email: null, displayName: null }
        if (await technicianHasOpenInProgressTicket(user.displayName)) {
          continue
        }

        await d.ref.update(buildAutoCheckoutPatch(data, nowMs, { reason: "schedule_grace" }))
        totalStopped += 1
      }

      console.log("autoCheckOutScheduleGrace completed", { totalStopped })
    } catch (e) {
      console.error("autoCheckOutScheduleGrace failed", e)
    }

    return null
  })

/**
 * Safety net: auto-stop any active attendance sessions at end of day (23:59 local time).
 * Forces checkout even when a ticket is still „În lucru”.
 */
export const autoStopAttendanceSessions = functions
  .region(REGION)
  .pubsub.schedule("59 23 * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const endMs = Date.now()
    let totalStopped = 0

    try {
      const snap = await db.collection("attendance").where("status", "==", "active").get()
      if (snap.empty) {
        console.log("autoStopAttendanceSessions: no active sessions")
        return null
      }

      const docs = snap.docs
      for (let i = 0; i < docs.length; i += 450) {
        const chunk = docs.slice(i, i + 450)
        const batch = db.batch()

        for (const d of chunk) {
          const data = d.data() as any
          if (String(data?.status || "") !== "active") continue

          batch.update(
            d.ref,
            buildAutoCheckoutPatch(data, endMs, { reason: "eod_force", forceEndOfDay: true }),
          )
          totalStopped += 1
        }

        await batch.commit()
      }

      console.log("autoStopAttendanceSessions completed", { totalStopped })
    } catch (e) {
      console.error("autoStopAttendanceSessions failed", e)
    }

    return null
  })

// Callable folosit după creare/editare contract (în app/dashboard/contracte/page.tsx).
// IMPORTANT: nu creează nimic dacă nu suntem în fereastra de generare (generateAt <= now).
export const runGenerateScheduledWorks = functions
  .region(REGION)
  .https.onCall(async (data) => {
    const contractId = typeof data?.contractId === "string" && data.contractId.length > 0 ? data.contractId : undefined
    const res = await generateRevisionWorks({ now: new Date(), contractId })
    return res
  })

export const onCrmTaskCreatedEmail = functions
  .region(REGION)
  .firestore.document("crm_tasks/{taskId}")
  .onCreate(async (_snap, context) => {
    const taskId = String(context.params.taskId || "").trim()
    if (!taskId) return null

    await dispatchCrmTaskNotification({
      taskId,
      eventType: "assigned",
    })

    return null
  })

export const onCrmTaskReassignedEmail = functions
  .region(REGION)
  .firestore.document("crm_tasks/{taskId}")
  .onUpdate(async (change, context) => {
    const taskId = String(context.params.taskId || "").trim()
    if (!taskId) return null

    const before = change.before.data() as CrmTaskRecord
    const after = change.after.data() as CrmTaskRecord
    const beforeAssignee = String(before?.assigneeId || "").trim()
    const afterAssignee = String(after?.assigneeId || "").trim()

    if (!afterAssignee || beforeAssignee === afterAssignee) return null

    await dispatchCrmTaskNotification({
      taskId,
      eventType: "reassigned",
      recipientUserIds: [afterAssignee],
      actorUserId: String(after.updatedById || "").trim() || null,
    })

    return null
  })

export const sendCrmTaskReminders15m = functions
  .region(REGION)
  .pubsub.schedule("* * * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const nowMs = Date.now()
    const lowerDueAtMs = nowMs + 14 * 60 * 1000
    const upperDueAtMs = nowMs + 16 * 60 * 1000

    let checked = 0
    let skippedStatus = 0
    let dispatched = 0

    try {
      const rows = await db
        .collection("crm_tasks")
        .where("dueAt", ">=", Timestamp.fromMillis(lowerDueAtMs))
        .where("dueAt", "<=", Timestamp.fromMillis(upperDueAtMs))
        .limit(500)
        .get()

      for (const taskRow of rows.docs) {
        checked += 1
        const taskData = taskRow.data() as { status?: string }
        const status = String(taskData?.status || "")
        if (status !== "TODO" && status !== "IN_PROGRESS") {
          skippedStatus += 1
          continue
        }

        const result = await dispatchCrmTaskNotification({
          taskId: taskRow.id,
          eventType: "reminder_15m",
        })

        if (result.ok) {
          dispatched += 1
        }
      }

      console.log("sendCrmTaskReminders15m completed", {
        checked,
        skippedStatus,
        dispatched,
        window: {
          lowerDueAtMs,
          upperDueAtMs,
        },
      })
    } catch (error) {
      console.error("sendCrmTaskReminders15m failed", error)
    }

    return null
  })

export const onCrmInternalNoteCreatedEmail = functions
  .region(REGION)
  .firestore.document("crm_internal_notes/{noteId}")
  .onCreate(async (_snap, context) => {
    const noteId = String(context.params.noteId || "").trim()
    if (!noteId) return null

    await dispatchCrmInternalNoteNotification({
      noteId,
      eventType: "created",
    })

    return null
  })

export const sendCrmInternalNoteOverdueDailyReminders = functions
  .region(REGION)
  .pubsub.schedule("0 8 * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const nowMs = Date.now()
    const todayDateKey = formatDateKeyInTimeZone(nowMs, TIMEZONE)

    let checked = 0
    let skipped = 0
    let dispatched = 0

    try {
      const rows = await db
        .collection("crm_internal_notes")
        .where("opportunityId", "==", null)
        .where("status", "==", "PENDING")
        .where("dueAt", "<=", Timestamp.fromMillis(nowMs))
        .limit(500)
        .get()

      for (const row of rows.docs) {
        checked += 1
        const data = row.data() as CrmInternalNoteRecord
        const dueAtMs = crmDateToMs(data.dueAt)
        if (!dueAtMs) {
          skipped += 1
          continue
        }
        const dueDateKey = formatDateKeyInTimeZone(dueAtMs, TIMEZONE)
        if (todayDateKey <= dueDateKey) {
          // Reminder starts the day after due date.
          skipped += 1
          continue
        }

        const result = await dispatchCrmInternalNoteNotification({
          noteId: row.id,
          eventType: "overdue_daily",
          dateKey: todayDateKey,
        })
        if (result.ok && !result.skipped) {
          dispatched += 1
        }
      }

      console.log("sendCrmInternalNoteOverdueDailyReminders completed", {
        checked,
        skipped,
        dispatched,
        todayDateKey,
      })
    } catch (error) {
      console.error("sendCrmInternalNoteOverdueDailyReminders failed", error)
    }

    return null
  })

export const onCrmInternalThreadMessageCreatedEmail = functions
  .region(REGION)
  .firestore.document("crm_internal_threads/{threadId}/messages/{messageId}")
  .onCreate(async (_snap, context) => {
    const threadId = String(context.params.threadId || "").trim()
    const messageId = String(context.params.messageId || "").trim()
    if (!threadId || !messageId) return null
    await dispatchCrmInternalThreadMessageNotification({
      threadId,
      messageId,
      eventType: "created",
    })
    return null
  })

export const sendCrmInternalThreadOverdueDailyReminders = functions
  .region(REGION)
  .pubsub.schedule("0 8 * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const nowMs = Date.now()
    const todayDateKey = formatDateKeyInTimeZone(nowMs, TIMEZONE)
    let checked = 0
    let skipped = 0
    let dispatched = 0

    try {
      const rows = await db
        .collectionGroup("messages")
        .where("requiresConfirmation", "==", true)
        .where("cycleStatus", "==", "PENDING")
        .where("deadlineAt", "<=", Timestamp.fromMillis(nowMs))
        .limit(500)
        .get()

      for (const row of rows.docs) {
        const parentRef = row.ref.parent.parent
        if (!parentRef) {
          skipped += 1
          continue
        }
        const threadId = parentRef.id
        const messageId = row.id
        checked += 1
        const data = row.data() as CrmInternalThreadMessageRecord
        const deadlineAtMs = crmDateToMs(data.deadlineAt)
        if (!deadlineAtMs) {
          skipped += 1
          continue
        }
        const dueDateKey = formatDateKeyInTimeZone(deadlineAtMs, TIMEZONE)
        if (todayDateKey <= dueDateKey) {
          skipped += 1
          continue
        }
        const result = await dispatchCrmInternalThreadMessageNotification({
          threadId,
          messageId,
          eventType: "overdue_daily",
          dateKey: todayDateKey,
        })
        if (result.ok && !result.skipped) {
          dispatched += 1
        }
      }
      console.log("sendCrmInternalThreadOverdueDailyReminders completed", {
        checked,
        skipped,
        dispatched,
        todayDateKey,
      })
    } catch (error) {
      console.error("sendCrmInternalThreadOverdueDailyReminders failed", error)
    }

    return null
  })

export const sendHrRequestPendingApprovalReminders = functions
  .region(REGION)
  .pubsub.schedule("0 8 * * *")
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const nowMs = Date.now()
    const todayDateKey = formatDateKeyInTimeZone(nowMs, TIMEZONE)

    let checked = 0
    let dueWeekly = 0
    let dueDayBefore = 0
    let skipped = 0
    let dispatched = 0

    try {
      const rows = await db.collection("hrRequests").where("status", "==", "pending").limit(500).get()
      hrReminderLog("job_start", { todayDateKey, pendingHrRequests: rows.size })

      for (const row of rows.docs) {
        checked += 1
        const data = row.data() as any
        const kind = String(data?.kind || "") as HrRequestKind
        if (!isHrRequestReminderEligibleKind(kind)) {
          skipped += 1
          continue
        }

        const req: HrRequest = {
          employeeId: String(data?.employeeId || ""),
          employeeName: data?.employeeName ? String(data.employeeName) : undefined,
          requesterUid: String(data?.requesterUid || ""),
          sectorId: String(data?.sectorId || ""),
          managerUid: String(data?.managerUid || ""),
          kind,
          status: "pending",
          payload: data?.payload ?? {},
          rejectionReason: data?.rejectionReason ?? null,
        }

        const startDateKey = hrRequestStartDateKey(req)
        if (!startDateKey) {
          skipped += 1
          continue
        }

        const createdAtMs = crmDateToMs(data?.createdAt)
        if (!createdAtMs) {
          skipped += 1
          continue
        }

        const createdDateKey = formatDateKeyInTimeZone(createdAtMs, TIMEZONE)
        const daysPending = diffDateKeysInDays(createdDateKey, todayDateKey)
        if (daysPending == null || daysPending < 0) {
          skipped += 1
          continue
        }

        const dayBeforeDateKey = addDaysToDateKey(startDateKey, -1)
        if (dayBeforeDateKey === todayDateKey) {
          dueDayBefore += 1
          const result = await dispatchHrRequestPendingReminder({
            requestId: row.id,
            eventType: "day_before_start",
            todayDateKey,
          })
          if (result.ok && !result.skipped) {
            dispatched += 1
            console.log("sendHrRequestPendingApprovalReminders dispatched", row.id, "day_before")
          } else if (result.skipped) {
            console.log("sendHrRequestPendingApprovalReminders skip", row.id, "day_before", result.reason)
          } else {
            const errDetail = "error" in result && result.error ? result.error : ""
            console.log("sendHrRequestPendingApprovalReminders failed", row.id, "day_before", result.reason, errDetail)
          }
          continue
        }

        if (daysPending >= 7 && daysPending % 7 === 0) {
          dueWeekly += 1
          const result = await dispatchHrRequestPendingReminder({
            requestId: row.id,
            eventType: "weekly_pending",
            todayDateKey,
            weekNumber: Math.floor(daysPending / 7),
          })
          if (result.ok && !result.skipped) {
            dispatched += 1
            console.log("sendHrRequestPendingApprovalReminders dispatched", row.id, "weekly")
          } else if (result.skipped) {
            console.log("sendHrRequestPendingApprovalReminders skip", row.id, "weekly", result.reason)
          } else {
            const errDetail = "error" in result && result.error ? result.error : ""
            console.log("sendHrRequestPendingApprovalReminders failed", row.id, "weekly", result.reason, errDetail)
          }
          continue
        }

        skipped += 1
      }

      console.log("sendHrRequestPendingApprovalReminders completed", {
        checked,
        dueWeekly,
        dueDayBefore,
        skipped,
        dispatched,
        todayDateKey,
      })
    } catch (error) {
      console.error("sendHrRequestPendingApprovalReminders failed", error)
    }

    return null
  })

export const onHrRequestApproved = functions
  .region(REGION)
  .firestore.document("hrRequests/{requestId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() as any
    const after = change.after.data() as any
    const requestId = String(context.params.requestId)

    const beforeStatus = String(before?.status ?? "pending") as HrRequestStatus
    const afterStatus = String(after?.status ?? "pending") as HrRequestStatus
    if (beforeStatus === afterStatus) return null
    if (afterStatus !== "approved") return null

    const req: HrRequest = {
      employeeId: String(after.employeeId),
      employeeName: after.employeeName ? String(after.employeeName) : undefined,
      requesterUid: String(after.requesterUid),
      sectorId: String(after.sectorId),
      managerUid: String(after.managerUid),
      kind: String(after.kind) as HrRequestKind,
      status: afterStatus,
      payload: after.payload ?? {},
      rejectionReason: after.rejectionReason ?? null,
    }

    try {
      await applyApprovedHrRequest({ requestId, req })
      // best-effort marker (for debugging / future idempotency)
      await change.after.ref.set({ appliedAt: FieldValue.serverTimestamp() }, { merge: true })
    } catch (e) {
      console.error("onHrRequestApproved failed", requestId, e)
    }
    return null
  })

export const onHrRequestCreatedEmail = functions
  .region(REGION)
  .firestore.document("hrRequests/{requestId}")
  .onCreate(async (snap, context) => {
    const data = snap.data() as any
    if (String(data?.emailChannel || "") === "nextjs") return null
    const req: HrRequest = {
      employeeId: String(data.employeeId),
      employeeName: data.employeeName ? String(data.employeeName) : undefined,
      requesterUid: String(data.requesterUid),
      sectorId: String(data.sectorId),
      managerUid: String(data.managerUid),
      kind: String(data.kind) as HrRequestKind,
      status: String(data.status) as HrRequestStatus,
      payload: data.payload ?? {},
      rejectionReason: data.rejectionReason ?? null,
    }

    const requester = await getUserEmail(req.requesterUid)
    const manager = await getUserEmail(req.managerUid)

    const title = `${kindLabel(req.kind)} • ${requestDateLabel(req)}`
    const employeeName = req.employeeName || req.employeeId

    // Manager notification
    if (manager.email) {
      await smtpSendMail({
        to: manager.email,
        subject: `Cerere nouă de aprobat: ${title}`,
        text:
          `Ai primit o cerere nouă.\n\n` +
          `Angajat: ${employeeName}\n` +
          `Tip: ${kindLabel(req.kind)}\n` +
          `Perioadă/zi: ${requestDateLabel(req)}\n` +
          `Sector: ${req.sectorId}\n\n` +
          `Deschide aplicația: /dashboard/cereri-aprobari\n`,
      })
    }

    // Technician confirmation
    if (requester.email) {
      await smtpSendMail({
        to: requester.email,
        subject: `Cererea ta a fost înregistrată: ${title}`,
        text:
          `Cererea ta a fost înregistrată și trimisă către șeful ierarhic.\n\n` +
          `Tip: ${kindLabel(req.kind)}\n` +
          `Perioadă/zi: ${requestDateLabel(req)}\n` +
          `Status: ${statusLabel(req.status)}\n`,
      })
    }

    return null
  })

export const onHrRequestStatusChangedEmail = functions
  .region(REGION)
  .firestore.document("hrRequests/{requestId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() as any
    const after = change.after.data() as any

    const beforeStatus = String(before?.status ?? "pending") as HrRequestStatus
    const afterStatus = String(after?.status ?? "pending") as HrRequestStatus
    if (beforeStatus === afterStatus) return null
    if (String(after?.emailChannel || "") === "nextjs") return null

    const req: HrRequest = {
      employeeId: String(after.employeeId),
      employeeName: after.employeeName ? String(after.employeeName) : undefined,
      requesterUid: String(after.requesterUid),
      sectorId: String(after.sectorId),
      managerUid: String(after.managerUid),
      kind: String(after.kind) as HrRequestKind,
      status: afterStatus,
      payload: after.payload ?? {},
      rejectionReason: after.rejectionReason ?? null,
    }

    const requester = await getUserEmail(req.requesterUid)

    const title = `${kindLabel(req.kind)} • ${requestDateLabel(req)}`
    const rejectReason = afterStatus === "rejected" ? String(after.rejectionReason ?? "").trim() : ""
    const employeeName = req.employeeName || req.employeeId
    const baseText =
      `Statusul cererii a fost actualizat.\n\n` +
      `Angajat: ${employeeName}\n` +
      `Tip: ${kindLabel(req.kind)}\n` +
      `Perioadă/zi: ${requestDateLabel(req)}\n` +
      `Status: ${statusLabel(afterStatus)}\n` +
      (rejectReason ? `Motiv refuz: ${rejectReason}\n` : "")

    if (requester.email) {
      await smtpSendMail({
        to: requester.email,
        subject: `Status cerere actualizat: ${statusLabel(afterStatus)} • ${title}`,
        text: baseText,
      })
    }

    return null
  })
