import type { OfferEventActorType, OfferEventSource, OfferEventType } from "./evidence-types"
import type { OfferRequestMeta } from "./request-meta.server"

export const OFFER_EVENT_HASH_VERSION = 1

export type OfferEventDocumentInput = {
  type: OfferEventType
  source: OfferEventSource
  status?: string
  lucrareId?: string | null
  opportunityId?: string | null
  offerId?: string | null
  actorId?: string | null
  actorType?: OfferEventActorType
  email?: string | null
  token?: string | null
  snapshot?: unknown
  messageId?: string | null
  payload?: Record<string, unknown> | null
  emailBodyHtml?: string | null
  emailBodyStoragePath?: string | null
  ip?: string | null
  userAgent?: string | null
  referer?: string | null
  integrityWarning?: string | null
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

function normalizeForHash(value: unknown): unknown {
  if (value === undefined) return null
  if (value === null) return null
  if (Array.isArray(value)) return value.map(normalizeForHash)
  if (typeof value !== "object") return value

  const input = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(input).sort()) {
    const normalized = normalizeForHash(input[key])
    if (normalized === undefined) continue
    out[key] = normalized
  }
  return out
}

async function sha256Hex(value: string): Promise<string> {
  const crypto = await import("crypto")
  return crypto.createHash("sha256").update(value).digest("hex")
}

async function hashToken(token: string): Promise<string | null> {
  if (!token) return null
  return sha256Hex(token)
}

export async function computeOfferEventHash(input: Record<string, unknown>): Promise<string> {
  return sha256Hex(JSON.stringify(normalizeForHash(input)))
}

export async function hashOfferSnapshot(snapshot: unknown): Promise<string | null> {
  if (snapshot === null || snapshot === undefined) return null
  try {
    return sha256Hex(JSON.stringify(snapshot))
  } catch {
    return null
  }
}

export async function hashOfferEmailBody(html: string | null | undefined): Promise<string | null> {
  const body = safeString(html || "", 500_000)
  if (!body) return null
  return sha256Hex(body)
}

export async function buildOfferEventDocument(
  input: OfferEventDocumentInput,
  requestMeta: OfferRequestMeta = { ip: null, userAgent: null, referer: null },
  prevEventHash: string | null = null,
  eventAt: string = new Date().toISOString(),
) {
  const tokenHash = input.token ? await hashToken(input.token) : null
  const snapshotHash = input.snapshot !== undefined ? await hashOfferSnapshot(input.snapshot) : null
  const emailBodyHash =
    input.emailBodyHtml !== undefined ? await hashOfferEmailBody(input.emailBodyHtml) : null

  const doc = {
    type: input.type,
    source: input.source,
    dataTier: "complete" as const,
    lucrareId: safeString(input.lucrareId || "", 128) || null,
    opportunityId: safeString(input.opportunityId || "", 128) || null,
    offerId: safeString(input.offerId || "", 128) || null,
    actorId: safeString(input.actorId || "", 128) || null,
    actorType: input.actorType || "system",
    status: safeString(input.status || "ok", 64) || "ok",
    email: safeString(input.email || "", 256).toLowerCase() || null,
    tokenHash,
    snapshotHash,
    messageId: safeString(input.messageId || "", 512) || null,
    ip: input.ip ?? requestMeta.ip,
    userAgent: input.userAgent ?? requestMeta.userAgent,
    referer: input.referer ?? requestMeta.referer,
    payload: input.payload && typeof input.payload === "object" ? input.payload : null,
    emailBodyStoragePath: safeString(input.emailBodyStoragePath || "", 512) || null,
    emailBodyHash,
    eventAt,
    prevEventHash,
    hashVersion: OFFER_EVENT_HASH_VERSION,
    integrityWarning: safeString(input.integrityWarning || "", 1000) || null,
  }

  const eventHash = await computeOfferEventHash({
    hashVersion: OFFER_EVENT_HASH_VERSION,
    type: doc.type,
    source: doc.source,
    lucrareId: doc.lucrareId,
    opportunityId: doc.opportunityId,
    offerId: doc.offerId,
    actorId: doc.actorId,
    actorType: doc.actorType,
    status: doc.status,
    email: doc.email,
    tokenHash: doc.tokenHash,
    snapshotHash: doc.snapshotHash,
    messageId: doc.messageId,
    ip: doc.ip,
    userAgent: doc.userAgent,
    referer: doc.referer,
    payload: doc.payload,
    emailBodyStoragePath: doc.emailBodyStoragePath,
    emailBodyHash: doc.emailBodyHash,
    eventAt: doc.eventAt,
    prevEventHash: doc.prevEventHash,
  })

  return { ...doc, eventHash }
}
