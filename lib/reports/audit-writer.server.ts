import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import type { AuditChange, AuditOutcome } from "@/lib/reports/types"

const SENSITIVE_KEY = /password|passphrase|token|secret|credential|kioskpin|signature|semnatura|image|imagine|base64|privatekey/i

function sanitizeChange(change: AuditChange): AuditChange | null {
  if (SENSITIVE_KEY.test(change.field) || SENSITIVE_KEY.test(change.label)) return null
  return {
    field: String(change.field).slice(0, 120),
    label: String(change.label).slice(0, 160),
    before: change.before === undefined ? undefined : String(change.before).slice(0, 2_000),
    after: change.after === undefined ? undefined : String(change.after).slice(0, 2_000),
  }
}

export async function writeServerAuditEvent(params: {
  actorId: string
  actorName?: string
  actorRole?: string
  module: string
  action: string
  outcome?: AuditOutcome
  entityType: string
  entityId?: string
  entityLabel?: string
  summary: string
  changes?: AuditChange[]
  source?: string
}) {
  let actorName = params.actorName
  let actorRole = params.actorRole
  if ((!actorName || !actorRole) && params.actorId && params.actorId !== "system") {
    const user = await adminDb.collection("users").doc(params.actorId).get()
    const data = user.data()
    actorName ||= String(data?.displayName || data?.email || params.actorId)
    actorRole ||= String(data?.role || "")
  }

  const payload = {
    occurredAt: FieldValue.serverTimestamp(),
    actorId: params.actorId || "system",
    actorName: actorName || "Sistem",
    actorRole: actorRole || "system",
    module: params.module,
    action: params.action,
    outcome: params.outcome || "success",
    entityType: params.entityType,
    ...(params.entityId ? { entityId: params.entityId } : {}),
    ...(params.entityLabel ? { entityLabel: params.entityLabel } : {}),
    summary: params.summary.slice(0, 4_000),
    changes: (params.changes || []).map(sanitizeChange).filter(Boolean).slice(0, 50),
    source: params.source || "next-api",
    coverage: "complete",
  }
  const ref = await adminDb.collection("auditEvents").add(payload)
  return ref.id
}
