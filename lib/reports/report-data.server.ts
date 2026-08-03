import { Timestamp } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import {
  presentAuditEvent,
  ticketIdFromAuditEvent,
  type AuditPresentationContext,
} from "@/lib/reports/activity-presentation"
import { parseActivityDateRange } from "@/lib/reports/date-range"
import type {
  ActivityReportResponse,
  AuditChange,
  AuditEvent,
  ReportFacet,
  ReportUserOption,
  UninvoicedReportResponse,
  UninvoicedReportRow,
} from "@/lib/reports/types"
import { isUninvoicedWork, toUninvoicedReportRow } from "@/lib/reports/uninvoiced"

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
export const MAX_EXPORT_ROWS = 10_000

function timestampToDate(value: any): Date | null {
  if (!value) return null
  if (typeof value?.toDate === "function") return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function stringifyAuditValue(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (value === null) return "—"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (typeof (value as any)?.toDate === "function") return (value as any).toDate().toISOString()
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function cleanText(value: unknown, fallback = "—") {
  const result = String(value ?? "").trim()
  return result || fallback
}

export function encodeReportCursor(offset: number) {
  return Buffer.from(String(Math.max(0, offset)), "utf8").toString("base64url")
}

export function decodeReportCursor(cursor: string | null | undefined) {
  if (!cursor) return 0
  try {
    const value = Number(Buffer.from(cursor, "base64url").toString("utf8"))
    return Number.isInteger(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

export function parsePageSize(value: string | null | undefined) {
  const parsed = Number(value || DEFAULT_PAGE_SIZE)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(parsed, MAX_PAGE_SIZE)
}

function uniqueFacets(values: string[]): ReportFacet[] {
  return Array.from(new Set(values.filter((value) => value && value !== "—")))
    .sort((a, b) => a.localeCompare(b, "ro"))
    .map((value) => ({ value, label: value }))
}

export interface UninvoicedFilters {
  search?: string
  client?: string
  workType?: string
  workStatus?: string
}

function filterUninvoicedRows(rows: UninvoicedReportRow[], filters: UninvoicedFilters) {
  const search = cleanText(filters.search, "").toLocaleLowerCase("ro-RO")
  return rows.filter((row) => {
    if (filters.client && row.client !== filters.client) return false
    if (filters.workType && row.workType !== filters.workType) return false
    if (filters.workStatus && row.workStatus !== filters.workStatus) return false
    if (!search) return true
    const haystack = [
      row.ticketNumber,
      row.client,
      row.location,
      row.workType,
      row.interventionDate,
      row.technicians.join(" "),
      row.workStatus,
      row.invoiceStatus,
    ]
      .join(" ")
      .toLocaleLowerCase("ro-RO")
    return haystack.includes(search)
  })
}

export async function loadAllUninvoicedRows(filters: UninvoicedFilters = {}) {
  const generatedAt = new Date()
  const snapshot = await adminDb.collection("lucrari").get()
  const allRows = snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter(isUninvoicedWork)
    .map((work) => toUninvoicedReportRow(work, generatedAt))
    .sort((a, b) => {
      const dateDifference = new Date(a.reportDate || 0).getTime() - new Date(b.reportDate || 0).getTime()
      return dateDifference || a.ticketNumber.localeCompare(b.ticketNumber, "ro")
    })

  return {
    generatedAt,
    allRows,
    filteredRows: filterUninvoicedRows(allRows, filters),
    facets: {
      clients: uniqueFacets(allRows.map((row) => row.client)),
      workTypes: uniqueFacets(allRows.map((row) => row.workType)),
      workStatuses: uniqueFacets(allRows.map((row) => row.workStatus)),
    },
  }
}

export async function getUninvoicedReport(params: {
  filters?: UninvoicedFilters
  cursor?: string | null
  pageSize?: number
}): Promise<UninvoicedReportResponse> {
  const { generatedAt, filteredRows, facets } = await loadAllUninvoicedRows(params.filters)
  const offset = decodeReportCursor(params.cursor)
  const pageSize = Math.min(Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  const rows = filteredRows.slice(offset, offset + pageSize)
  const nextOffset = offset + rows.length

  return {
    rows,
    total: filteredRows.length,
    nextCursor: nextOffset < filteredRows.length ? encodeReportCursor(nextOffset) : null,
    generatedAt: generatedAt.toISOString(),
    facets,
  }
}

export async function listReportUsers(): Promise<ReportUserOption[]> {
  const snapshot = await adminDb.collection("users").get()
  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        name: cleanText(data.displayName, cleanText(data.email, doc.id)),
        email: cleanText(data.email, ""),
        role: cleanText(data.role, ""),
      }
    })
    .filter((user) => user.role !== "kiosk")
    .sort((a, b) => a.name.localeCompare(b.name, "ro"))
}

async function getCoverageStartAt() {
  const snapshot = await adminDb.collection("auditMetadata").doc("coverage").get()
  return timestampToDate(snapshot.data()?.coverageStartAt)
}

function moduleFromCategory(category: unknown) {
  const value = cleanText(category, "Sistem")
  if (/pontaj|resurse|hr/i.test(value)) return "Resurse umane"
  if (/crm/i.test(value)) return "CRM"
  if (/client/i.test(value)) return "Clienți"
  if (/contract/i.test(value)) return "Contracte"
  if (/factur/i.test(value)) return "Facturare"
  if (/utiliz/i.test(value)) return "Utilizatori"
  if (/setări|setari/i.test(value)) return "Setări"
  if (/lucrare|tichet/i.test(value)) return "Tichete"
  if (/autentific/i.test(value)) return "Autentificare"
  return value
}

function normalizeChanges(value: unknown): AuditChange[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 50).map((change: any) => ({
    field: cleanText(change?.field, "câmp"),
    label: cleanText(change?.label, cleanText(change?.field, "Câmp")),
    before: stringifyAuditValue(change?.before),
    after: stringifyAuditValue(change?.after),
  }))
}

function normalizeCompleteAudit(doc: FirebaseFirestore.QueryDocumentSnapshot): AuditEvent | null {
  const data = doc.data()
  const occurredAt = timestampToDate(data.occurredAt)
  if (!occurredAt) return null
  return {
    id: doc.id,
    occurredAt: occurredAt.toISOString(),
    actorId: cleanText(data.actorId, "system"),
    actorName: cleanText(data.actorName, "Sistem"),
    actorRole: cleanText(data.actorRole, "") || undefined,
    module: cleanText(data.module, "Sistem"),
    action: cleanText(data.action, "Acțiune"),
    outcome: data.outcome === "fail" ? "fail" : "success",
    entityType: cleanText(data.entityType, "Entitate"),
    entityId: cleanText(data.entityId, "") || undefined,
    entityLabel: cleanText(data.entityLabel, "") || undefined,
    summary: cleanText(data.summary, cleanText(data.action, "Acțiune")),
    changes: normalizeChanges(data.changes),
    source: cleanText(data.source, "auditEvents"),
    coverage: "complete",
  }
}

type LegacyKind = "logs" | "work_modifications" | "crm_activity_logs" | "settingsHistory"

function normalizeLegacyAudit(
  kind: LegacyKind,
  doc: FirebaseFirestore.QueryDocumentSnapshot,
  fallbackUser: ReportUserOption,
): AuditEvent | null {
  const data = doc.data()
  const dateField =
    kind === "logs" ? data.timestamp : kind === "work_modifications" ? data.modifiedAt || data.createdAt : kind === "crm_activity_logs" ? data.createdAt : data.timestamp
  const occurredAt = timestampToDate(dateField)
  if (!occurredAt) return null

  if (kind === "logs") {
    const before = data.before && typeof data.before === "object" ? data.before : {}
    const after = data.after && typeof data.after === "object" ? data.after : {}
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).slice(0, 50)
    return {
      id: `logs:${doc.id}`,
      occurredAt: occurredAt.toISOString(),
      actorId: cleanText(data.utilizatorId, fallbackUser.id),
      actorName: cleanText(data.utilizator, fallbackUser.name),
      actorRole: fallbackUser.role || undefined,
      module: moduleFromCategory(data.categorie),
      action: cleanText(data.actiune, "Acțiune"),
      outcome: data.actionOutcome === "fail" || data.tip === "Eroare" ? "fail" : "success",
      entityType: cleanText(data.entityType, data.lucrareId ? "Tichet" : "Entitate"),
      entityId: cleanText(data.entityId || data.lucrareId, "") || undefined,
      entityLabel: cleanText(data.lucrareTitlu || data.nrLucrare, "") || undefined,
      summary: cleanText(data.detalii, cleanText(data.actiune, "Acțiune")),
      changes: keys.map((field) => ({
        field,
        label: field,
        before: stringifyAuditValue(before[field]),
        after: stringifyAuditValue(after[field]),
      })),
      source: "logs",
      coverage: "legacy_partial",
    }
  }

  if (kind === "work_modifications") {
    return {
      id: `work_modifications:${doc.id}`,
      occurredAt: occurredAt.toISOString(),
      actorId: cleanText(data.modifiedBy, fallbackUser.id),
      actorName: cleanText(data.modifiedByName, fallbackUser.name),
      actorRole: fallbackUser.role || undefined,
      module: "Tichete",
      action: cleanText(data.modificationType, "Actualizare tichet"),
      outcome: "success",
      entityType: "Tichet",
      entityId: cleanText(data.lucrareId, "") || undefined,
      entityLabel: cleanText(data.lucrareTitle, "") || undefined,
      summary: cleanText(data.description, "Actualizare tichet"),
      changes: data.oldValue !== undefined || data.newValue !== undefined
        ? [{ field: cleanText(data.modificationType, "modificare"), label: "Modificare", before: stringifyAuditValue(data.oldValue), after: stringifyAuditValue(data.newValue) }]
        : [],
      source: "work_modifications",
      coverage: "legacy_partial",
    }
  }

  if (kind === "crm_activity_logs") {
    return {
      id: `crm_activity_logs:${doc.id}`,
      occurredAt: occurredAt.toISOString(),
      actorId: cleanText(data.actorId, fallbackUser.id),
      actorName: fallbackUser.name,
      actorRole: fallbackUser.role || undefined,
      module: "CRM",
      action: cleanText(data.type, "Activitate CRM"),
      outcome: "success",
      entityType: "Oportunitate CRM",
      entityId: cleanText(data.opportunityId, "") || undefined,
      entityLabel: cleanText(data.opportunityId, "") || undefined,
      summary: cleanText(data.summary, cleanText(data.type, "Activitate CRM")),
      changes: [],
      source: "crm_activity_logs",
      coverage: "legacy_partial",
    }
  }

  return {
    id: `settingsHistory:${doc.id}`,
    occurredAt: occurredAt.toISOString(),
    actorId: cleanText(data.modifiedBy, fallbackUser.id),
    actorName: cleanText(data.modifiedByName, fallbackUser.name),
    actorRole: fallbackUser.role || undefined,
    module: "Setări",
    action: cleanText(data.action, "Actualizare setare"),
    outcome: "success",
    entityType: "Setare",
    entityId: cleanText(data.settingId, "") || undefined,
    entityLabel: cleanText(data.settingPath, "") || undefined,
    summary: `${cleanText(data.action, "Actualizare")} ${cleanText(data.settingPath, "setare")}`,
    changes: [],
    source: "settingsHistory",
    coverage: "legacy_partial",
  }
}

async function queryByActorAndRange(params: {
  collectionName: string
  actorField: string
  actorId: string
  timeField: string
  from: Date
  toExclusive: Date
}) {
  return adminDb
    .collection(params.collectionName)
    .where(params.actorField, "==", params.actorId)
    .where(params.timeField, ">=", Timestamp.fromDate(params.from))
    .where(params.timeField, "<", Timestamp.fromDate(params.toExclusive))
    .orderBy(params.timeField, "desc")
    .get()
}

function dedupeActivityRows(rows: AuditEvent[]) {
  const completeFingerprints = new Set<string>()
  const result: AuditEvent[] = []
  for (const row of rows.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())) {
    const fingerprint = [
      row.actorId,
      Math.floor(new Date(row.occurredAt).getTime() / 2_000),
      row.entityId || row.entityType,
      row.action.toLocaleLowerCase("ro-RO"),
    ].join("|")
    if (row.coverage === "complete") {
      completeFingerprints.add(fingerprint)
      result.push(row)
    } else if (!completeFingerprints.has(fingerprint)) {
      result.push(row)
    }
  }
  return result
}

async function getDocumentsInChunks(refs: FirebaseFirestore.DocumentReference[]) {
  const snapshots: FirebaseFirestore.DocumentSnapshot[] = []
  for (let index = 0; index < refs.length; index += 100) {
    const chunk = refs.slice(index, index + 100)
    if (chunk.length) snapshots.push(...await adminDb.getAll(...chunk))
  }
  return snapshots
}

function ticketDisplayLabel(data: FirebaseFirestore.DocumentData | undefined, fallback: string) {
  const value = cleanText(data?.nrLucrareDisplay || data?.nrLucrare || data?.numarRaport, fallback)
  if (!value || value === "—") return fallback
  return value.startsWith("#") ? value : `#${value}`
}

function addEquipmentLabels(target: Record<string, string>, equipments: unknown) {
  if (!Array.isArray(equipments)) return
  for (const equipment of equipments) {
    if (!equipment || typeof equipment !== "object") continue
    const item = equipment as Record<string, unknown>
    const id = cleanText(item.id, "")
    const code = cleanText(item.cod || item.code, "")
    const name = cleanText(item.nume || item.name || item.model, "")
    const label = [name, code && code !== name ? `(${code})` : ""].filter(Boolean).join(" ") || code || id
    if (!label) continue
    if (id) target[id] = label
    if (code) target[code] = label
  }
}

function addEquipmentLabelsFromOwner(target: Record<string, string>, owner: FirebaseFirestore.DocumentData | undefined) {
  if (!owner) return
  addEquipmentLabels(target, owner.echipamente)
  const locations = Array.isArray(owner.locatii) ? owner.locatii : []
  for (const location of locations) addEquipmentLabels(target, location?.echipamente)
}

async function buildAuditPresentationContexts(rows: AuditEvent[]) {
  const ticketIds = Array.from(new Set(rows.map(ticketIdFromAuditEvent).filter((id): id is string => Boolean(id))))
  if (!ticketIds.length) return new Map<string, AuditPresentationContext>()

  const workSnapshots = await getDocumentsInChunks(ticketIds.map((id) => adminDb.collection("lucrari").doc(id)))
  const works = new Map(workSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data() || {}]))
  const clientIds = Array.from(new Set(Array.from(works.values()).map((work) => cleanText(work.clientId, "")).filter(Boolean)))
  const clientSnapshots = await getDocumentsInChunks(clientIds.map((id) => adminDb.collection("clienti").doc(id)))
  const clients = new Map(clientSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data() || {}]))

  const revisionPaths = Array.from(new Set(rows
    .map((row) => String(row.entityId || ""))
    .filter((path) => /^lucrari\/[^/]+\/revisions\/[^/]+$/.test(path))))
  const revisionSnapshots = await getDocumentsInChunks(revisionPaths.map((path) => adminDb.doc(path)))
  const revisions = new Map(revisionSnapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.ref.path, snapshot.data() || {}]))

  const result = new Map<string, AuditPresentationContext>()
  for (const row of rows) {
    const ticketId = ticketIdFromAuditEvent(row)
    if (!ticketId) continue
    const work = works.get(ticketId)
    const equipmentLabels: Record<string, string> = {}
    addEquipmentLabelsFromOwner(equipmentLabels, work?.clientInfo)
    const clientId = cleanText(work?.clientId, "")
    if (clientId) addEquipmentLabelsFromOwner(equipmentLabels, clients.get(clientId))

    const revisionList = Array.isArray(work?.revision?.equipment) ? work.revision.equipment : []
    addEquipmentLabels(equipmentLabels, revisionList.map((item: any) => ({
      id: item?.equipmentId,
      cod: item?.equipmentCode,
      nume: item?.equipmentName || item?.name,
    })))

    const path = String(row.entityId || "")
    const revision = revisions.get(path)
    const revisionEquipmentId = /^lucrari\/[^/]+\/revisions\/([^/]+)$/.exec(path)?.[1]
    const revisionEquipmentName = cleanText(
      revision?.equipmentName || revision?.name || (revisionEquipmentId ? equipmentLabels[revisionEquipmentId] : ""),
      "",
    ) || undefined
    if (revisionEquipmentId && revisionEquipmentName) equipmentLabels[revisionEquipmentId] = revisionEquipmentName

    result.set(row.id, {
      ticketLabel: ticketDisplayLabel(work, cleanText(row.entityLabel, ticketId)),
      revisionEquipmentName,
      equipmentLabels,
    })
  }
  return result
}

export async function loadAllActivityRows(params: { userId: string; from: string; to: string }) {
  const range = parseActivityDateRange(params.from, params.to)
  const userSnapshot = await adminDb.collection("users").doc(params.userId).get()
  if (!userSnapshot.exists) throw new Error("Utilizatorul selectat nu există.")
  const userData = userSnapshot.data() || {}
  const fallbackUser: ReportUserOption = {
    id: userSnapshot.id,
    name: cleanText(userData.displayName, cleanText(userData.email, userSnapshot.id)),
    email: cleanText(userData.email, ""),
    role: cleanText(userData.role, ""),
  }
  const coverageStart = await getCoverageStartAt()

  const completePromise = queryByActorAndRange({
    collectionName: "auditEvents",
    actorField: "actorId",
    actorId: params.userId,
    timeField: "occurredAt",
    from: range.from,
    toExclusive: range.toExclusive,
  })

  const legacyTo = coverageStart && coverageStart < range.toExclusive ? coverageStart : range.toExclusive
  const shouldLoadLegacy = legacyTo > range.from
  const legacyPromises: Array<Promise<FirebaseFirestore.QuerySnapshot>> = shouldLoadLegacy
    ? [
        queryByActorAndRange({ collectionName: "logs", actorField: "utilizatorId", actorId: params.userId, timeField: "timestamp", from: range.from, toExclusive: legacyTo }),
        queryByActorAndRange({ collectionName: "work_modifications", actorField: "modifiedBy", actorId: params.userId, timeField: "modifiedAt", from: range.from, toExclusive: legacyTo }),
        queryByActorAndRange({ collectionName: "crm_activity_logs", actorField: "actorId", actorId: params.userId, timeField: "createdAt", from: range.from, toExclusive: legacyTo }),
        queryByActorAndRange({ collectionName: "settingsHistory", actorField: "modifiedBy", actorId: params.userId, timeField: "timestamp", from: range.from, toExclusive: legacyTo }),
      ]
    : []

  const [completeSnapshot, ...legacySnapshots] = await Promise.all([completePromise, ...legacyPromises])
  const completeRows = completeSnapshot.docs.map(normalizeCompleteAudit).filter((row): row is AuditEvent => Boolean(row))
  const kinds: LegacyKind[] = ["logs", "work_modifications", "crm_activity_logs", "settingsHistory"]
  const legacyRows = legacySnapshots.flatMap((snapshot, index) =>
    snapshot.docs
      .map((doc) => normalizeLegacyAudit(kinds[index], doc, fallbackUser))
      .filter((row): row is AuditEvent => Boolean(row)),
  )
  const dedupedRows = dedupeActivityRows([...completeRows, ...legacyRows])
  const presentationContexts = await buildAuditPresentationContexts(dedupedRows)
  const rows = dedupedRows
    .map((row) => presentAuditEvent(row, presentationContexts.get(row.id)))
    .filter((row) => !(
      row.coverage === "complete" &&
      row.module === "Tichete" &&
      /actualiz|modific/i.test(row.action) &&
      row.changes.length === 0
    ))

  return {
    rows,
    coverageStartAt: coverageStart?.toISOString() || null,
    includesLegacyPartial: legacyRows.length > 0,
  }
}

export async function getActivityReport(params: {
  userId: string
  from: string
  to: string
  cursor?: string | null
  pageSize?: number
}): Promise<ActivityReportResponse> {
  const loaded = await loadAllActivityRows(params)
  const offset = decodeReportCursor(params.cursor)
  const pageSize = Math.min(Math.max(1, params.pageSize || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  const rows = loaded.rows.slice(offset, offset + pageSize)
  const nextOffset = offset + rows.length
  return {
    rows,
    total: loaded.rows.length,
    nextCursor: nextOffset < loaded.rows.length ? encodeReportCursor(nextOffset) : null,
    generatedAt: new Date().toISOString(),
    coverageStartAt: loaded.coverageStartAt,
    includesLegacyPartial: loaded.includesLegacyPartial,
  }
}
