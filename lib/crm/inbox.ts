import { createHash } from "crypto"
import { getDateValue } from "./activity"
import { CRM_COLLECTIONS } from "./constants"
import type {
  CrmInboxCategory,
  CrmInboxDateValue,
  CrmInboxIngestInput,
  CrmInboxIngestResult,
  CrmInboxLinkInput,
  CrmInboxLinkMethod,
  CrmInboxLinkState,
  CrmInboxListFilters,
  CrmInboxMessage,
  CrmInboxMessageListItem,
  CrmInboxOpportunityRecommendation,
  CrmInboxOpportunitySummary,
  CrmInboxPriority,
  CrmInboxStatus,
  CrmInboxUpdateInput,
} from "./inbox-types"
import { getClientLevelContactsFromRecord, getClientLocationContactsFromRecord } from "../client-contacts"
import { createCrmEmail } from "./tasks"
import { getCrmOpportunityById } from "./opportunities"

const CRM_INBOX_ACCOUNT = "fom@nrg-acces.ro"
const CRM_INBOX_PROVIDER = "imap"
const CRM_INBOX_STATUSES = ["NEW", "IN_PROGRESS", "DONE", "IGNORED"] as const
const CRM_INBOX_CATEGORIES = ["OFERTA", "FACTURARE", "SUPORT", "INSTALARE", "ADMIN", "SPAM", "UNCLASSIFIED"] as const
const CRM_INBOX_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const
const CRM_INBOX_LINK_METHODS = ["subject_code", "sender_contact", "manual_existing", "created_from_email"] as const
const CATEGORY_RULES: Array<{ category: CrmInboxCategory; keywords: string[] }> = [
  { category: "OFERTA", keywords: ["oferta", "quotation", "price"] },
  { category: "FACTURARE", keywords: ["factura", "invoice", "plata", "payment"] },
  { category: "SUPORT", keywords: ["problema", "error", "incident", "suport"] },
  { category: "INSTALARE", keywords: ["instalare", "montaj", "punere in functiune"] },
  { category: "ADMIN", keywords: ["document", "contract", "anexa", "cerere"] },
  { category: "SPAM", keywords: ["casino", "crypto", "loan", "free money"] },
]

type NormalizedInboxMessage = Omit<
  CrmInboxMessage,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "receivedAt"
  | "assignedToUserId"
  | "assignedTeam"
  | "priority"
  | "opportunityId"
  | "opportunityCode"
  | "linkedAt"
  | "linkedByUserId"
  | "linkMethod"
  | "crmEmailId"
> & {
  receivedAt: Date
}

type RecommendationContext = {
  byId: Map<string, CrmInboxOpportunitySummary>
  byCode: Map<string, CrmInboxOpportunitySummary>
  bySenderEmail: Map<string, CrmInboxOpportunitySummary[]>
  draftClientIdBySenderEmail: Map<string, string>
}

const MAX_LIST_SCAN = 300
const MAX_LIST_RETURN = 100
const MAX_RECOMMENDATIONS = 3

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value)
  return normalized || undefined
}

function normalizeInboxText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function categorizeCrmInboxMessage(subject: string, bodySnippet: string): CrmInboxCategory {
  const haystack = `${normalizeInboxText(subject)} ${normalizeInboxText(bodySnippet)}`.trim()

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(normalizeInboxText(keyword)))) {
      return rule.category
    }
  }

  return "UNCLASSIFIED"
}

function normalizeEmailList(value: string[] | string | undefined) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,]+/) : []
  const normalized = raw
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  return Array.from(new Set(normalized))
}

function normalizeDateValue(value: CrmInboxDateValue): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === "number") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "string") {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const date = value.toDate()
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function isInboxStatus(value: string): value is CrmInboxStatus {
  return (CRM_INBOX_STATUSES as readonly string[]).includes(value)
}

function isInboxCategory(value: string): value is CrmInboxCategory {
  return (CRM_INBOX_CATEGORIES as readonly string[]).includes(value)
}

function isInboxPriority(value: string): value is CrmInboxPriority {
  return (CRM_INBOX_PRIORITIES as readonly string[]).includes(value)
}

function isInboxLinkMethod(value: string): value is CrmInboxLinkMethod {
  return (CRM_INBOX_LINK_METHODS as readonly string[]).includes(value)
}

function parseListLimit(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return MAX_LIST_RETURN
  return Math.max(1, Math.min(value, MAX_LIST_RETURN))
}

function extractPrimaryEmail(value: unknown) {
  const source = normalizeString(value)
  if (!source) return ""

  const bracketMatch = source.match(/<([^>]+)>/)
  const candidate = bracketMatch?.[1] || source
  const emailMatch = candidate.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return emailMatch ? emailMatch[0].trim().toLowerCase() : ""
}

function extractOpportunityCodeFromSubject(subject: string) {
  const match = subject.match(/\bOP\.\s*0*(\d+)\b/i)
  if (!match) return undefined

  const numberValue = Number(match[1])
  if (!Number.isFinite(numberValue) || numberValue < 1) return undefined

  return `OP.${numberValue}`
}

function mapInboxMessage(docId: string, data: Record<string, unknown>): CrmInboxMessage {
  return {
    id: docId,
    provider: CRM_INBOX_PROVIDER,
    account: String(data.account || CRM_INBOX_ACCOUNT),
    messageId: String(data.messageId || ""),
    providerMessageId: normalizeNullableString(data.providerMessageId),
    threadId: normalizeNullableString(data.threadId),
    from: String(data.from || ""),
    to: Array.isArray(data.to) ? data.to.map((entry) => String(entry)) : [],
    cc: Array.isArray(data.cc) ? data.cc.map((entry) => String(entry)) : [],
    subject: String(data.subject || ""),
    bodySnippet: String(data.bodySnippet || ""),
    receivedAt: normalizeDateValue(data.receivedAt as CrmInboxDateValue),
    status: isInboxStatus(String(data.status || "")) ? (data.status as CrmInboxStatus) : "NEW",
    category: isInboxCategory(String(data.category || "")) ? (data.category as CrmInboxCategory) : "UNCLASSIFIED",
    assignedToUserId: normalizeNullableString(data.assignedToUserId),
    assignedTeam: normalizeNullableString(data.assignedTeam),
    priority: isInboxPriority(String(data.priority || "")) ? (data.priority as CrmInboxPriority) : undefined,
    opportunityId: normalizeNullableString(data.opportunityId),
    opportunityCode: normalizeNullableString(data.opportunityCode),
    linkedAt: normalizeDateValue(data.linkedAt as CrmInboxDateValue),
    linkedByUserId: normalizeNullableString(data.linkedByUserId),
    linkMethod: isInboxLinkMethod(String(data.linkMethod || "")) ? (data.linkMethod as CrmInboxLinkMethod) : undefined,
    crmEmailId: normalizeNullableString(data.crmEmailId),
    createdAt: normalizeDateValue(data.createdAt as CrmInboxDateValue),
    updatedAt: normalizeDateValue(data.updatedAt as CrmInboxDateValue),
  }
}

function applyListFilters(items: CrmInboxMessage[], filters: CrmInboxListFilters) {
  return items.filter((item) => {
    if (filters.status && item.status !== filters.status) return false
    if (filters.category && item.category !== filters.category) return false
    if (filters.assignedToUserId && item.assignedToUserId !== filters.assignedToUserId) return false
    if (filters.linkState === "LINKED" && !item.opportunityId) return false
    if (filters.linkState === "UNLINKED" && item.opportunityId) return false
    return true
  })
}

function toOpportunitySummary(
  opportunity: {
    id: string
    code: string
    title: string
    clientId: string
    updatedAt?: CrmInboxDateValue
  },
  clientNameMap: Map<string, string>
): CrmInboxOpportunitySummary {
  return {
    id: opportunity.id,
    code: opportunity.code,
    title: opportunity.title,
    clientId: opportunity.clientId,
    clientName: clientNameMap.get(opportunity.clientId) || undefined,
    updatedAt: opportunity.updatedAt,
  }
}

function getSummaryTime(value: CrmInboxDateValue | undefined) {
  return normalizeDateValue(value)?.getTime() || 0
}

function dedupeSummaries(items: CrmInboxOpportunitySummary[]) {
  const seen = new Set<string>()
  const deduped: CrmInboxOpportunitySummary[] = []

  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue
    seen.add(item.id)
    deduped.push(item)
  }

  return deduped.sort((left, right) => getSummaryTime(right.updatedAt) - getSummaryTime(left.updatedAt))
}

async function getAdminDb() {
  const mod = await import("../firebase/admin")
  return mod.adminDb
}

async function getAdminFirestoreFieldValue() {
  const mod = await import("firebase-admin/firestore")
  return mod.FieldValue
}

async function buildSenderEmailToClientIds(senderEmails: string[]) {
  const normalizedEmails = Array.from(new Set(senderEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)))
  const matches = new Map<string, Set<string>>()

  normalizedEmails.forEach((email) => {
    matches.set(email, new Set<string>())
  })

  if (normalizedEmails.length === 0) {
    return matches
  }

  const adminDb = await getAdminDb()

  const crmContactRows = await adminDb.collection(CRM_COLLECTIONS.clientContacts).limit(3000).get()
  crmContactRows.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>
    const email = extractPrimaryEmail(data.email)
    const clientId = normalizeString(data.clientId)
    if (!email || !clientId || !matches.has(email)) return
    matches.get(email)?.add(clientId)
  })

  const legacyClientRows = await adminDb.collection("clienti").limit(1000).get()
  legacyClientRows.docs.forEach((docSnap) => {
    const rawClient = docSnap.data() as Record<string, unknown>
    const contacts = [
      ...getClientLocationContactsFromRecord(docSnap.id, rawClient),
      ...getClientLevelContactsFromRecord(docSnap.id, rawClient),
    ]

    contacts.forEach((contact) => {
      const email = extractPrimaryEmail(contact.email)
      if (!email || !matches.has(email)) return
      matches.get(email)?.add(docSnap.id)
    })
  })

  return matches
}

/** Admin SDK version for server-side use (API routes). Client SDK has no auth context on server. */
async function listCrmClientsAdmin(): Promise<{ id: string; name: string }[]> {
  const adminDb = await getAdminDb()
  const [crmRows, legacyRows] = await Promise.all([
    adminDb.collection(CRM_COLLECTIONS.clients).orderBy("name", "asc").limit(500).get(),
    adminDb.collection("clienti").orderBy("nume", "asc").limit(500).get(),
  ])
  const result: { id: string; name: string }[] = []
  crmRows.docs.forEach((snap) => {
    const data = snap.data() as Record<string, unknown>
    const name = String(data.name || "").trim()
    if (name) result.push({ id: snap.id, name })
  })
  legacyRows.docs.forEach((snap) => {
    const data = snap.data() as Record<string, unknown>
    const name = String(data.nume || "").trim()
    if (name) result.push({ id: snap.id, name })
  })
  const byId = new Map<string, string>()
  result.forEach((r) => { if (!byId.has(r.id)) byId.set(r.id, r.name) })
  return Array.from(byId.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "ro"))
}

/** Admin SDK version for server-side use. Returns minimal opportunity data for recommendation context. */
async function listCrmOpportunitiesForUserAdmin(userId: string): Promise<{ id: string; code: string; title: string; clientId: string; updatedAt?: CrmInboxDateValue }[]> {
  const adminDb = await getAdminDb()
  const idSet = new Set<string>()

  const ownerRows = await adminDb.collection(CRM_COLLECTIONS.opportunities).where("ownerId", "==", userId).limit(200).get()
  ownerRows.docs.forEach((snap) => idSet.add(snap.id))

  const readRows = await adminDb.collection(CRM_COLLECTIONS.opportunities).where("readUserIds", "array-contains", userId).limit(200).get()
  readRows.docs.forEach((snap) => idSet.add(snap.id))

  const editRows = await adminDb.collection(CRM_COLLECTIONS.opportunities).where("editUserIds", "array-contains", userId).limit(200).get()
  editRows.docs.forEach((snap) => idSet.add(snap.id))

  const accessRows = await adminDb.collection(CRM_COLLECTIONS.opportunityAccess).where("userId", "==", userId).limit(200).get()
  accessRows.docs.forEach((snap) => {
    const data = snap.data() as Record<string, unknown>
    const opportunityId = String(data.opportunityId || "")
    if (opportunityId) idSet.add(opportunityId)
  })

  const opportunityIds = Array.from(idSet)
  if (!opportunityIds.length) return []

  const { FieldPath } = await import("firebase-admin/firestore")
  const result: { id: string; code: string; title: string; clientId: string; updatedAt?: CrmInboxDateValue }[] = []
  for (let i = 0; i < opportunityIds.length; i += 10) {
    const chunk = opportunityIds.slice(i, i + 10)
    const rows = await adminDb.collection(CRM_COLLECTIONS.opportunities).where(FieldPath.documentId(), "in", chunk).get()
    rows.docs.forEach((snap) => {
      const data = snap.data() as Record<string, unknown>
      result.push({
        id: snap.id,
        code: String(data.code || ""),
        title: String(data.title || ""),
        clientId: String(data.clientId || ""),
        updatedAt: data.updatedAt as CrmInboxDateValue | undefined,
      })
    })
  }
  return result
}

async function buildRecommendationContext(items: CrmInboxMessage[], userId?: string): Promise<RecommendationContext> {
  const senderEmails = Array.from(new Set(items.map((item) => extractPrimaryEmail(item.from)).filter(Boolean)))
  const senderClientIds = await buildSenderEmailToClientIds(senderEmails)
  const clientRows = await listCrmClientsAdmin()
  const clientNameMap = new Map(clientRows.map((client) => [client.id, client.name]))

  if (!userId) {
    const draftClientIdBySenderEmail = new Map<string, string>()
    senderClientIds.forEach((clientIds, senderEmail) => {
      if (clientIds.size === 1) {
        draftClientIdBySenderEmail.set(senderEmail, Array.from(clientIds)[0])
      }
    })

    return {
      byId: new Map<string, CrmInboxOpportunitySummary>(),
      byCode: new Map<string, CrmInboxOpportunitySummary>(),
      bySenderEmail: new Map<string, CrmInboxOpportunitySummary[]>(),
      draftClientIdBySenderEmail,
    }
  }

  const opportunities = await listCrmOpportunitiesForUserAdmin(userId)
  const summaries = opportunities.map((opportunity) => toOpportunitySummary(opportunity, clientNameMap))
  const byId = new Map<string, CrmInboxOpportunitySummary>()
  const byCode = new Map<string, CrmInboxOpportunitySummary>()

  summaries.forEach((summary) => {
    byId.set(summary.id, summary)
    if (summary.code) byCode.set(summary.code, summary)
  })

  const summariesByClientId = new Map<string, CrmInboxOpportunitySummary[]>()
  summaries.forEach((summary) => {
    const clientId = summary.clientId || ""
    if (!clientId) return
    if (!summariesByClientId.has(clientId)) {
      summariesByClientId.set(clientId, [])
    }
    summariesByClientId.get(clientId)?.push(summary)
  })

  const bySenderEmail = new Map<string, CrmInboxOpportunitySummary[]>()
  const draftClientIdBySenderEmail = new Map<string, string>()

  senderClientIds.forEach((clientIds, senderEmail) => {
    const orderedClientIds = Array.from(clientIds)
    if (orderedClientIds.length === 1) {
      draftClientIdBySenderEmail.set(senderEmail, orderedClientIds[0])
    }

    const relatedSummaries = dedupeSummaries(
      orderedClientIds.flatMap((clientId) => summariesByClientId.get(clientId) || [])
    ).slice(0, MAX_RECOMMENDATIONS)

    if (relatedSummaries.length > 0) {
      bySenderEmail.set(senderEmail, relatedSummaries)
    }
  })

  return { byId, byCode, bySenderEmail, draftClientIdBySenderEmail }
}

function enrichInboxMessage(item: CrmInboxMessage, context: RecommendationContext): CrmInboxMessageListItem {
  const senderEmail = extractPrimaryEmail(item.from)
  const subjectOpportunityCode = extractOpportunityCodeFromSubject(item.subject)
  const linkedOpportunity =
    (item.opportunityId ? context.byId.get(item.opportunityId) : undefined) ||
    (item.opportunityId ? { id: item.opportunityId, code: item.opportunityCode || undefined } : undefined)

  let recommendedOpportunities: CrmInboxOpportunityRecommendation[] = []

  if (!item.opportunityId) {
    const exactCodeMatch = subjectOpportunityCode ? context.byCode.get(subjectOpportunityCode) : undefined
    const senderMatches = senderEmail ? context.bySenderEmail.get(senderEmail) || [] : []
    const merged = dedupeSummaries([...(exactCodeMatch ? [exactCodeMatch] : []), ...senderMatches]).slice(0, MAX_RECOMMENDATIONS)

    recommendedOpportunities = merged.map((summary) => ({
      ...summary,
      reason: exactCodeMatch && summary.id === exactCodeMatch.id ? "subject_code" : "sender_contact",
    }))
  }

  return {
    ...item,
    linkedOpportunity,
    recommendedOpportunities,
    subjectOpportunityCode,
    draftClientId: senderEmail ? context.draftClientIdBySenderEmail.get(senderEmail) : undefined,
  }
}

export function isCrmInboxEnabled() {
  return process.env.CRM_INBOX_ENABLED === "true"
}

export function getInboxDedupKey(input: Pick<CrmInboxIngestInput, "messageId" | "providerMessageId">) {
  const messageId = normalizeString(input.messageId)
  if (messageId) return `message:${messageId.toLowerCase()}`

  const providerMessageId = normalizeString(input.providerMessageId)
  if (providerMessageId) return `provider:${providerMessageId.toLowerCase()}`

  return null
}

export function buildInboxDocumentId(dedupKey: string) {
  return `inbox_${createHash("sha256").update(dedupKey).digest("hex")}`
}

export function normalizeInboxMessageInput(input: CrmInboxIngestInput) {
  const dedupKey = getInboxDedupKey(input)
  if (!dedupKey) {
    return { ok: false as const, error: "messageId sau providerMessageId este obligatoriu" }
  }

  const from = normalizeString(input.from)
  if (!from) {
    return { ok: false as const, error: "from este obligatoriu" }
  }

  const to = normalizeEmailList(input.to)
  if (!to.length) {
    return { ok: false as const, error: "to trebuie sa contina cel putin o adresa" }
  }

  const receivedAt = normalizeDateValue(input.receivedAt)
  if (!receivedAt) {
    return { ok: false as const, error: "receivedAt este invalid" }
  }

  const subject = normalizeString(input.subject)
  const bodySnippet = normalizeString(input.bodySnippet)

  const message: NormalizedInboxMessage = {
    provider: CRM_INBOX_PROVIDER,
    account: CRM_INBOX_ACCOUNT,
    messageId: normalizeString(input.messageId),
    providerMessageId: normalizeNullableString(input.providerMessageId),
    threadId: normalizeNullableString(input.threadId),
    from,
    to,
    cc: normalizeEmailList(input.cc),
    subject,
    bodySnippet,
    receivedAt,
    status: "NEW",
    category: categorizeCrmInboxMessage(subject, bodySnippet),
  }

  return { ok: true as const, dedupKey, message }
}

export function parseCrmInboxUpdateInput(input: unknown) {
  if (!isRecord(input)) {
    return { ok: false as const, error: "Payload invalid" }
  }

  const allowedKeys = new Set(["id", "status", "category", "assignedToUserId", "assignedTeam", "priority"])
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) {
      return { ok: false as const, error: `Camp nepermis: ${key}` }
    }
  }

  const id = normalizeString(input.id)
  if (!id) {
    return { ok: false as const, error: "id este obligatoriu" }
  }

  const output: CrmInboxUpdateInput = { id }
  let changedFields = 0

  if ("status" in input) {
    const status = normalizeString(input.status)
    if (!isInboxStatus(status)) {
      return { ok: false as const, error: "status invalid" }
    }
    output.status = status
    changedFields += 1
  }

  if ("category" in input) {
    const category = normalizeString(input.category)
    if (!isInboxCategory(category)) {
      return { ok: false as const, error: "category invalida" }
    }
    output.category = category
    changedFields += 1
  }

  if ("assignedToUserId" in input) {
    output.assignedToUserId = normalizeNullableString(input.assignedToUserId) ?? null
    changedFields += 1
  }

  if ("assignedTeam" in input) {
    output.assignedTeam = normalizeNullableString(input.assignedTeam) ?? null
    changedFields += 1
  }

  if ("priority" in input) {
    const priorityValue = input.priority
    if (priorityValue === null || normalizeString(priorityValue) === "") {
      output.priority = null
    } else {
      const priority = normalizeString(priorityValue)
      if (!isInboxPriority(priority)) {
        return { ok: false as const, error: "priority invalida" }
      }
      output.priority = priority
    }
    changedFields += 1
  }

  if (changedFields === 0) {
    return { ok: false as const, error: "Nu exista campuri de actualizat" }
  }

  return { ok: true as const, data: output }
}

export async function ingestCrmInboxMessages(batch: CrmInboxIngestInput[]): Promise<CrmInboxIngestResult> {
  const adminDb = await getAdminDb()
  const FieldValue = await getAdminFirestoreFieldValue()
  const result: CrmInboxIngestResult = { inserted: 0, updated: 0, skipped: 0, errors: [] }

  for (const [index, rawMessage] of batch.entries()) {
    const normalized = normalizeInboxMessageInput(rawMessage)
    if (!normalized.ok) {
      result.skipped += 1
      result.errors.push({ index, reason: normalized.error })
      continue
    }

    const docId = buildInboxDocumentId(normalized.dedupKey)
    const docRef = adminDb.collection(CRM_COLLECTIONS.inboxMessages).doc(docId)
    const existing = await docRef.get()

    const payload = {
      provider: normalized.message.provider,
      account: normalized.message.account,
      messageId: normalized.message.messageId,
      providerMessageId: normalized.message.providerMessageId || null,
      threadId: normalized.message.threadId || null,
      from: normalized.message.from,
      to: normalized.message.to,
      cc: normalized.message.cc || [],
      subject: normalized.message.subject,
      bodySnippet: normalized.message.bodySnippet,
      receivedAt: normalized.message.receivedAt,
      status: existing.exists && isInboxStatus(String(existing.data()?.status || ""))
        ? (String(existing.data()?.status) as CrmInboxStatus)
        : normalized.message.status,
      category: existing.exists && isInboxCategory(String(existing.data()?.category || ""))
        ? (String(existing.data()?.category) as CrmInboxCategory)
        : normalized.message.category,
      assignedToUserId: existing.data()?.assignedToUserId || null,
      assignedTeam: existing.data()?.assignedTeam || null,
      priority: existing.data()?.priority || null,
      createdAt: existing.exists ? existing.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await docRef.set(payload, { merge: true })

    if (existing.exists) {
      result.updated += 1
    } else {
      result.inserted += 1
    }
  }

  return result
}

export async function listCrmInboxMessages(filters: CrmInboxListFilters, userId?: string) {
  const adminDb = await getAdminDb()
  const limit = parseListLimit(filters.limit)
  let query = adminDb.collection(CRM_COLLECTIONS.inboxMessages).orderBy("receivedAt", "desc")

  if (filters.assignedToUserId) {
    query = adminDb.collection(CRM_COLLECTIONS.inboxMessages).where("assignedToUserId", "==", filters.assignedToUserId).orderBy("receivedAt", "desc")
  } else if (filters.status) {
    query = adminDb.collection(CRM_COLLECTIONS.inboxMessages).where("status", "==", filters.status).orderBy("receivedAt", "desc")
  } else if (filters.category) {
    query = adminDb.collection(CRM_COLLECTIONS.inboxMessages).where("category", "==", filters.category).orderBy("receivedAt", "desc")
  }

  const snapshot = await query.limit(MAX_LIST_SCAN).get()
  const mapped = snapshot.docs.map((docSnap) => mapInboxMessage(docSnap.id, docSnap.data() as Record<string, unknown>))
  const filtered = applyListFilters(mapped, filters).slice(0, limit)
  const context = await buildRecommendationContext(filtered, userId)
  const enriched = filtered.map((item) => enrichInboxMessage(item, context))

  return {
    items: enriched,
    meta: {
      scanned: mapped.length,
      returned: enriched.length,
    },
  }
}

export async function getCrmInboxMessageById(id: string, userId?: string) {
  const adminDb = await getAdminDb()
  const docRef = adminDb.collection(CRM_COLLECTIONS.inboxMessages).doc(id)
  const snapshot = await docRef.get()

  if (!snapshot.exists) {
    throw new Error("Mesajul inbox nu exista")
  }

  const item = mapInboxMessage(snapshot.id, snapshot.data() as Record<string, unknown>)
  const context = await buildRecommendationContext([item], userId)
  return enrichInboxMessage(item, context)
}

export async function updateCrmInboxMessage(input: CrmInboxUpdateInput) {
  const adminDb = await getAdminDb()
  const FieldValue = await getAdminFirestoreFieldValue()
  const docRef = adminDb.collection(CRM_COLLECTIONS.inboxMessages).doc(input.id)
  const existing = await docRef.get()

  if (!existing.exists) {
    throw new Error("Mesajul inbox nu exista")
  }

  const patch: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (input.status) patch.status = input.status
  if (input.category) patch.category = input.category
  if ("assignedToUserId" in input) patch.assignedToUserId = input.assignedToUserId || FieldValue.delete()
  if ("assignedTeam" in input) patch.assignedTeam = input.assignedTeam || FieldValue.delete()
  if ("priority" in input) patch.priority = input.priority || FieldValue.delete()

  await docRef.set(patch, { merge: true })
}

async function findExistingCrmEmailIdForInboxMessage(opportunityId: string, inboxMessageId: string) {
  const adminDb = await getAdminDb()
  const snapshot = await adminDb
    .collection(CRM_COLLECTIONS.emails)
    .where("opportunityId", "==", opportunityId)
    .where("sourceInboxMessageId", "==", inboxMessageId)
    .limit(1)
    .get()

  if (snapshot.empty) return undefined
  return snapshot.docs[0].id
}

export async function linkCrmInboxMessageToOpportunity(input: CrmInboxLinkInput): Promise<CrmInboxMessageListItem> {
  const adminDb = await getAdminDb()
  const FieldValue = await getAdminFirestoreFieldValue()
  const docRef = adminDb.collection(CRM_COLLECTIONS.inboxMessages).doc(input.inboxMessageId)
  const existing = await docRef.get()

  if (!existing.exists) {
    throw new Error("Mesajul inbox nu exista")
  }

  const inboxMessage = mapInboxMessage(existing.id, existing.data() as Record<string, unknown>)

  if (inboxMessage.opportunityId) {
    if (inboxMessage.opportunityId === input.opportunityId) {
      return getCrmInboxMessageById(input.inboxMessageId, input.actorId)
    }

    throw new Error("Mesajul inbox este deja legat la o alta oportunitate")
  }

  const opportunity = await getCrmOpportunityById(input.opportunityId, input.actorId)
  if (!opportunity) {
    throw new Error("Oportunitatea nu exista sau nu ai acces la ea")
  }

  let crmEmailId = inboxMessage.crmEmailId || await findExistingCrmEmailIdForInboxMessage(opportunity.id, inboxMessage.id)

  if (!crmEmailId) {
    crmEmailId = await createCrmEmail({
      opportunityId: opportunity.id,
      source: "inbox",
      subject: inboxMessage.subject,
      from: inboxMessage.from,
      to: inboxMessage.to,
      bodySnippet: inboxMessage.bodySnippet,
      sourceInboxMessageId: inboxMessage.id,
      sentAt: getDateValue(inboxMessage.receivedAt) || undefined,
      createdById: input.actorId,
      visibility: "GENERAL",
    })
  }

  await docRef.set(
    {
      opportunityId: opportunity.id,
      opportunityCode: opportunity.code,
      linkedAt: FieldValue.serverTimestamp(),
      linkedByUserId: input.actorId,
      linkMethod: input.linkMethod,
      crmEmailId,
      status: "DONE",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  return getCrmInboxMessageById(input.inboxMessageId, input.actorId)
}
