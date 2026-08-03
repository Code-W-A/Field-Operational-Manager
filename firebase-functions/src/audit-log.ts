import { createHash } from "node:crypto"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import {
  onDocumentWrittenWithAuthContext,
  type FirestoreAuthEvent,
} from "firebase-functions/v2/firestore"

const REGION = "europe-west1"

const AUDITED_COLLECTIONS = new Set([
  "lucrari",
  "clienti",
  "contracts",
  "users",
  "attendance",
  "attendanceActiveSessions",
  "hrDepartments",
  "hrEmployees",
  "hrRequests",
  "hrSettings",
  "hrTimesheets",
  "settings",
  "predefinedSettings",
  "technician_groups",
  "note-interne",
  "documentatii_files",
  "documentatii_folders",
  "documentatii_subfolders",
  "emailEvents",
  "logs",
  "offerEvents",
  "scan_issue_requests",
  "crm_clients",
  "crm_client_contacts",
  "crm_opportunities",
  "crm_opportunity_contacts",
  "crm_opportunity_access",
  "crm_offers",
  "crm_tasks",
  "crm_notes",
  "crm_internal_notes",
  "crm_internal_threads",
  "crm_files",
  "crm_emails",
  "crm_calendar_events",
  "crm_internal_handoffs",
  "crm_visible_to",
  "crm_inbox_messages",
])

const SENSITIVE_FIELD = /password|passphrase|token|secret|credential|kioskpin|signature|semnatura|image|imagine|photo|fotograf|base64|privatekey|mailpassword|filecontent|filedata|attachmentdata/i
const INTERNAL_FIELD = /^(updatedAt|createdAt|notificationRead|notificationReadBy)$/

type ChangeOperation = "create" | "update" | "delete"

interface AuditChangeValue {
  field: string
  label: string
  before?: string
  after?: string
}

function moduleForCollection(collectionName: string) {
  if (collectionName.startsWith("crm_")) return "CRM"
  if (collectionName.startsWith("hr") || collectionName.startsWith("attendance")) return "Resurse umane"
  if (collectionName === "lucrari" || collectionName === "offerEvents" || collectionName === "scan_issue_requests") return "Tichete"
  if (collectionName === "clienti") return "Clienți"
  if (collectionName === "contracts") return "Contracte"
  if (collectionName === "users" || collectionName === "technician_groups") return "Utilizatori"
  if (collectionName === "settings" || collectionName === "predefinedSettings") return "Setări"
  if (collectionName.startsWith("documentatii") || collectionName === "note-interne") return "Documentații"
  if (collectionName === "emailEvents") return "Email"
  return "Sistem"
}

function entityTypeForCollection(collectionName: string) {
  const labels: Record<string, string> = {
    lucrari: "Tichet",
    clienti: "Client",
    contracts: "Contract",
    users: "Utilizator",
    attendance: "Pontaj",
    hrEmployees: "Salariat",
    hrRequests: "Cerere HR",
    hrTimesheets: "Pontaj lunar",
    settings: "Setare",
    predefinedSettings: "Setare predefinită",
    emailEvents: "Email",
    crm_opportunities: "Oportunitate CRM",
    crm_tasks: "Sarcină CRM",
    crm_offers: "Ofertă CRM",
  }
  return labels[collectionName] || collectionName.replace(/_/g, " ")
}

function labelForDocument(collectionName: string, data: Record<string, unknown>, documentId: string) {
  const candidates = collectionName === "lucrari"
    ? [data.nrLucrare, data.numarRaport, data.client]
    : collectionName === "users"
      ? [data.displayName, data.email]
      : collectionName === "clienti"
        ? [data.nume, data.name]
        : collectionName === "contracts"
          ? [data.number, data.numar]
          : [data.title, data.name, data.nume, data.subject, data.code]
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim())
  return String(value || documentId).slice(0, 240)
}

function safeValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (depth >= 2) return "[date complexe]"
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item, depth + 1))
  if (typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (!SENSITIVE_FIELD.test(key)) result[key] = safeValue(item, depth + 1)
    }
    return result
  }
  return String(value)
}

function printable(value: unknown) {
  const safe = safeValue(value)
  if (safe === undefined) return undefined
  if (safe === null) return "—"
  if (typeof safe === "string") return safe
  try {
    return JSON.stringify(safe)
  } catch {
    return String(safe)
  }
}

function printableRevisionSections(value: unknown) {
  if (!Array.isArray(value)) return printable(value)
  const sections = value.slice(0, 30).map((section: any) => ({
    id: String(section?.id || "").slice(0, 160),
    title: String(section?.title || section?.name || "").slice(0, 240),
    items: Array.isArray(section?.items)
      ? section.items.slice(0, 120).map((item: any) => ({
          id: String(item?.id || "").slice(0, 160),
          label: String(item?.label || item?.name || "").slice(0, 300),
          state: item?.state == null ? undefined : String(item.state).slice(0, 60),
          obs: item?.obs == null ? undefined : String(item.obs).slice(0, 1_000),
        }))
      : [],
  }))
  const serialized = JSON.stringify(sections)
  return serialized.length > 40_000 ? `${serialized.slice(0, 40_000)}…` : serialized
}

function printableField(field: string, value: unknown) {
  if (field === "sections") return printableRevisionSections(value)
  return printable(value)
}

export function buildAuditChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  const changes: AuditChangeValue[] = []
  for (const field of fields) {
    if (SENSITIVE_FIELD.test(field) || INTERNAL_FIELD.test(field)) continue
    const oldValue = printableField(field, before[field])
    const newValue = printableField(field, after[field])
    if (oldValue === newValue) continue
    changes.push({ field, label: field, before: oldValue, after: newValue })
    if (changes.length >= 50) break
  }
  return changes
}

function operationFromEvent(beforeExists: boolean, afterExists: boolean): ChangeOperation {
  if (!beforeExists) return "create"
  if (!afterExists) return "delete"
  return "update"
}

function operationLabel(operation: ChangeOperation) {
  if (operation === "create") return "Creare"
  if (operation === "delete") return "Ștergere"
  return "Actualizare"
}

function extractActorId(event: FirestoreAuthEvent<unknown>, data: Record<string, unknown>) {
  if (event.authId) return event.authId
  const candidates = [
    data.updatedBy,
    data.createdBy,
    data.actorId,
    data.modifiedBy,
    data.utilizatorId,
    data.requesterUid,
    data.uploadedById,
  ]
  const value = candidates.find((candidate) => typeof candidate === "string" && candidate.trim())
  return String(value || "system")
}

async function resolveActor(actorId: string, data: Record<string, unknown>) {
  const fallbackName = String(
    data.updatedByName ||
      data.createdByName ||
      data.actorName ||
      data.modifiedByName ||
      data.utilizator ||
      data.uploadedBy ||
      "Sistem",
  )
  if (actorId === "system") return { actorName: fallbackName, actorRole: "system" }
  try {
    const user = await getFirestore().collection("users").doc(actorId).get()
    const userData = user.data()
    return {
      actorName: String(userData?.displayName || userData?.email || fallbackName || actorId),
      actorRole: String(userData?.role || ""),
    }
  } catch {
    return { actorName: fallbackName || actorId, actorRole: "" }
  }
}

function eventDocumentId(eventId: string) {
  return createHash("sha256").update(eventId).digest("hex")
}

async function persistAuditEvent(params: {
  event: FirestoreAuthEvent<any>
  collectionName: string
  documentId: string
  subCollection?: string
}) {
  const change = params.event.data
  const beforeExists = Boolean(change?.before?.exists)
  const afterExists = Boolean(change?.after?.exists)
  if (!beforeExists && !afterExists) return
  const before = (beforeExists ? change.before.data() : {}) as Record<string, unknown>
  const after = (afterExists ? change.after.data() : {}) as Record<string, unknown>
  const operation = operationFromEvent(beforeExists, afterExists)
  const current = afterExists ? after : before
  if (params.collectionName === "logs") {
    const category = String(current.categorie || "")
    if (category !== "Autentificare" && category !== "Descărcări") return
  }
  const actorId = extractActorId(params.event, current)
  const actor = await resolveActor(actorId, current)
  const collectionForLabel = params.subCollection || params.collectionName
  const entityType = params.collectionName === "logs"
    ? String(current.entityType || (current.categorie === "Autentificare" ? "Sesiune" : "Document"))
    : params.subCollection
    ? `${entityTypeForCollection(params.collectionName)} / ${params.subCollection}`
    : entityTypeForCollection(params.collectionName)
  const entityLabel = labelForDocument(params.collectionName, current, params.documentId)
  const action = params.collectionName === "logs"
    ? String(current.actiune || `${operationLabel(operation)} eveniment`)
    : `${operationLabel(operation)} ${entityType.toLocaleLowerCase("ro-RO")}`
  const occurredAt = new Date(params.event.time)
  const db = getFirestore()

  try {
    await db.collection("auditMetadata").doc("coverage").create({
      coverageStartAt: Timestamp.fromDate(occurredAt),
      createdBy: "audit-trigger",
    })
  } catch (error: any) {
    if (error?.code !== 6 && error?.code !== "already-exists") throw error
  }

  await db.collection("auditEvents").doc(eventDocumentId(params.event.id)).create({
    occurredAt: Timestamp.fromDate(occurredAt),
    actorId,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    module: params.collectionName === "logs" ? String(current.categorie || "Sistem") : moduleForCollection(params.collectionName),
    action,
    outcome: current.actionOutcome === "fail" || current.tip === "Eroare" ? "fail" : "success",
    entityType,
    entityId: params.collectionName === "logs" && current.entityId
      ? String(current.entityId)
      : params.collectionName === "logs" && current.lucrareId
        ? String(current.lucrareId)
        : params.subCollection
      ? `${params.collectionName}/${params.documentId}/${params.subCollection}/${params.event.params.subDocumentId}`
      : params.documentId,
    entityLabel,
    summary: params.collectionName === "logs" ? String(current.detalii || action).slice(0, 4_000) : `${action}: ${entityLabel}`,
    changes: params.collectionName === "logs" ? [] : buildAuditChanges(before, after),
    source: `firestore:${collectionForLabel}`,
    coverage: "complete",
    sourceEventId: params.event.id,
  }).catch((error: any) => {
    if (error?.code !== 6 && error?.code !== "already-exists") throw error
  })
}

export const auditTopLevelDocumentWritten = onDocumentWrittenWithAuthContext(
  { document: "{collectionId}/{documentId}", region: REGION },
  async (event) => {
    const collectionName = event.params.collectionId
    if (!AUDITED_COLLECTIONS.has(collectionName)) return
    await persistAuditEvent({ event, collectionName, documentId: event.params.documentId })
  },
)

export const auditNestedDocumentWritten = onDocumentWrittenWithAuthContext(
  { document: "{collectionId}/{documentId}/{subCollection}/{subDocumentId}", region: REGION },
  async (event) => {
    const collectionName = event.params.collectionId
    if (!AUDITED_COLLECTIONS.has(collectionName)) return
    await persistAuditEvent({
      event,
      collectionName,
      documentId: event.params.documentId,
      subCollection: event.params.subCollection,
    })
  },
)
