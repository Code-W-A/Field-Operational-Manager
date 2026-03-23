import "server-only"

import { CRM_COLLECTIONS } from "./constants"
import { ingestCrmInboxMessages } from "./inbox"
import {
  connectImapClient,
  parseExamineStatus,
  parseFetchMessages,
  parseSearchUids,
  resolveCrmInboxFetchPlan,
  type CrmInboxImapSyncState,
} from "./inbox-imap.server"
import { CRM_INBOX_ACCOUNT } from "./inbox-types"

const CRM_INBOX_COUNTER_DOC_ID = "crm_inbox_fom_nrg_acces_ro"
const CRM_INBOX_MAILBOX = "INBOX"
const CRM_INBOX_FETCH_BATCH_SIZE = 25
const CRM_INBOX_BOOTSTRAP_MAX_MESSAGES = 25
const CRM_INBOX_LOCK_MS = 5 * 60 * 1000

type CrmInboxSyncConfig = {
  host: string
  port: number
  user: string
  pass: string
  rejectUnauthorized: boolean
}

type CrmInboxCounterState = CrmInboxImapSyncState & {
  lockUntilMs: number | null
}

export type CrmInboxSyncSummary = {
  locked: boolean
  fetched: number
  inserted: number
  updated: number
  skipped: number
  autoLinked: number
  bootstrap: boolean
  reset: boolean
}

export type CrmInboxSyncResult =
  | ({ ok: true } & CrmInboxSyncSummary)
  | { ok: false; reason: "not_configured" | "failed"; error: string }

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function envBool(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback
  return value.toLowerCase() !== "false"
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function crmDateToMs(value: unknown): number | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.getTime()
  }
  if (typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate()
    return Number.isNaN(date.getTime()) ? null : date.getTime()
  }
  if (typeof value === "object" && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    const millis = (value as { toMillis: () => number }).toMillis()
    return Number.isFinite(millis) ? millis : null
  }
  return null
}

function getCrmInboxSyncConfig(): CrmInboxSyncConfig | null {
  const host = normalizeString(process.env.EMAIL_IMAP_HOST || process.env.EMAIL_SMTP_HOST || process.env.EMAIL_HOST)
  const port = parsePositiveInt(process.env.EMAIL_IMAP_PORT, 993)
  const user = normalizeString(process.env.EMAIL_USER)
  const pass = normalizeString(process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS)
  const rejectUnauthorized = envBool(process.env.EMAIL_IMAP_TLS_REJECT_UNAUTHORIZED, true)

  if (!host || !user || !pass) {
    return null
  }

  return {
    host,
    port,
    user,
    pass,
    rejectUnauthorized,
  }
}

async function getAdminDb() {
  const mod = await import("../firebase/admin")
  return mod.adminDb
}

async function getAdminFirestoreHelpers() {
  const mod = await import("firebase-admin/firestore")
  return {
    FieldValue: mod.FieldValue,
    Timestamp: mod.Timestamp,
  }
}

function parseCrmInboxCounterState(data: unknown): CrmInboxCounterState {
  const source = (data || {}) as Record<string, unknown>
  const uidValidity = Number(source.uidValidity)
  const lastUid = Number(source.lastUid)

  return {
    uidValidity: Number.isFinite(uidValidity) && uidValidity > 0 ? Math.floor(uidValidity) : null,
    lastUid: Number.isFinite(lastUid) && lastUid > 0 ? Math.floor(lastUid) : 0,
    lockUntilMs: crmDateToMs(source.lockUntil),
  }
}

async function acquireCrmInboxSyncLock() {
  const adminDb = await getAdminDb()
  const { FieldValue, Timestamp } = await getAdminFirestoreHelpers()
  const counterRef = adminDb.collection(CRM_COLLECTIONS.counters).doc(CRM_INBOX_COUNTER_DOC_ID)
  const nowMs = Date.now()

  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef)
    const state = parseCrmInboxCounterState(snapshot.data() || {})
    if (state.lockUntilMs && state.lockUntilMs > nowMs) {
      return { acquired: false as const, counterRef, state }
    }

    transaction.set(
      counterRef,
      {
        provider: "imap",
        account: CRM_INBOX_ACCOUNT,
        mailbox: CRM_INBOX_MAILBOX,
        lockUntil: Timestamp.fromMillis(nowMs + CRM_INBOX_LOCK_MS),
        lastRunAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    return { acquired: true as const, counterRef, state }
  })
}

async function releaseCrmInboxSyncLock(params: {
  counterRef: FirebaseFirestore.DocumentReference
  uidValidity?: number | null
  lastUid?: number
  summary?: Record<string, unknown>
  error?: string | null
}) {
  const { FieldValue } = await getAdminFirestoreHelpers()

  const patch: Record<string, unknown> = {
    provider: "imap",
    account: CRM_INBOX_ACCOUNT,
    mailbox: CRM_INBOX_MAILBOX,
    lockUntil: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (params.uidValidity !== undefined) patch.uidValidity = params.uidValidity
  if (params.lastUid !== undefined) patch.lastUid = params.lastUid
  if (params.summary) patch.lastResult = params.summary

  if (params.error) {
    patch.lastError = params.error
  } else {
    patch.lastError = FieldValue.delete()
    patch.lastSuccessAt = FieldValue.serverTimestamp()
  }

  await params.counterRef.set(patch, { merge: true })
}

export async function syncCrmInboxFromImap(actorId: string): Promise<CrmInboxSyncResult> {
  const normalizedActorId = normalizeString(actorId)
  if (!normalizedActorId) {
    return { ok: false, reason: "failed", error: "Actor invalid pentru sincronizare" }
  }

  const config = getCrmInboxSyncConfig()
  if (!config) {
    return { ok: false, reason: "not_configured", error: "Configurația IMAP pentru CRM Inbox este incompletă" }
  }

  const lock = await acquireCrmInboxSyncLock()
  if (!lock.acquired) {
    return {
      ok: true,
      locked: true,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      autoLinked: 0,
      bootstrap: false,
      reset: false,
    }
  }

  let uidValidity = lock.state.uidValidity
  let lastUid = lock.state.lastUid
  let summary: CrmInboxSyncSummary = {
    locked: false,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    autoLinked: 0,
    bootstrap: false,
    reset: false,
  }
  let clientConnection:
    | {
        client: Awaited<ReturnType<typeof connectImapClient>>["client"]
        socket: Awaited<ReturnType<typeof connectImapClient>>["socket"]
      }
    | null = null

  try {
    clientConnection = await connectImapClient({
      host: config.host,
      port: config.port,
      user: config.user,
      pass: config.pass,
      rejectUnauthorized: config.rejectUnauthorized,
    })

    const examineChunks = await clientConnection.client.command(`EXAMINE "${CRM_INBOX_MAILBOX}"`)
    const mailboxStatus = parseExamineStatus(examineChunks)
    uidValidity = mailboxStatus.uidValidity

    const fetchPlan = resolveCrmInboxFetchPlan(mailboxStatus, lock.state, CRM_INBOX_BOOTSTRAP_MAX_MESSAGES)
    const searchChunks = await clientConnection.client.command(`UID SEARCH UID ${fetchPlan.searchStartUid}:*`)
    const allCandidateUids = parseSearchUids(searchChunks)
    const selectedUids = fetchPlan.bootstrap
      ? allCandidateUids.slice(-CRM_INBOX_BOOTSTRAP_MAX_MESSAGES)
      : allCandidateUids.slice(0, CRM_INBOX_FETCH_BATCH_SIZE)

    if (selectedUids.length === 0) {
      if (fetchPlan.bootstrap) {
        lastUid = Math.max(0, (mailboxStatus.uidNext || 1) - 1)
      }

      summary = {
        ...summary,
        bootstrap: fetchPlan.bootstrap,
        reset: fetchPlan.reset,
      }

      await releaseCrmInboxSyncLock({
        counterRef: lock.counterRef,
        uidValidity,
        lastUid,
        summary,
      })

      return { ok: true, ...summary }
    }

    const messages: Array<{
      uid: number
      messageId?: string
      providerMessageId: string
      threadId?: string
      from: string
      to: string[]
      cc?: string[]
      subject?: string
      bodySnippet?: string
      receivedAt: string
    }> = []

    for (let index = 0; index < selectedUids.length; index += 10) {
      const chunk = selectedUids.slice(index, index + 10)
      const fetchChunks = await clientConnection.client.command(`UID FETCH ${chunk.join(",")} (UID INTERNALDATE BODY.PEEK[])`)
      messages.push(...parseFetchMessages(fetchChunks, uidValidity))
    }

    const ingestPayload = messages.map((message) => ({
      messageId: message.messageId,
      providerMessageId: message.providerMessageId,
      threadId: message.threadId,
      from: message.from,
      to: message.to.length ? message.to : [CRM_INBOX_ACCOUNT],
      cc: message.cc,
      subject: message.subject,
      bodySnippet: message.bodySnippet,
      receivedAt: message.receivedAt,
    }))

    const ingestResult = await ingestCrmInboxMessages(ingestPayload, { actorId: normalizedActorId })

    lastUid = Math.max(...selectedUids)
    summary = {
      locked: false,
      fetched: ingestPayload.length,
      inserted: ingestResult.inserted,
      updated: ingestResult.updated,
      skipped: ingestResult.skipped,
      autoLinked: ingestResult.autoLinked,
      bootstrap: fetchPlan.bootstrap,
      reset: fetchPlan.reset,
    }

    await releaseCrmInboxSyncLock({
      counterRef: lock.counterRef,
      uidValidity,
      lastUid,
      summary: {
        ...summary,
        highestUid: lastUid,
        errors: ingestResult.errors.length,
      },
    })

    return { ok: true, ...summary }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || "Eroare necunoscută")

    await releaseCrmInboxSyncLock({
      counterRef: lock.counterRef,
      uidValidity,
      lastUid,
      summary,
      error: errorMessage,
    })

    return { ok: false, reason: "failed", error: errorMessage }
  } finally {
    if (clientConnection) {
      await clientConnection.client.command("LOGOUT").catch(() => null)
      try {
        clientConnection.socket.end()
        clientConnection.socket.destroy()
      } catch {}
    }
  }
}
