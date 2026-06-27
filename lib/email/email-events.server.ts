import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"

export type EmailEventType =
  | "REPORT"
  | "OFFER"
  | "OFFER_CODE"
  | "DEVIZ"
  | "GENERIC"
  | "TECH_NOTIFY"
  | "INVITE"
  | "TEST"
  | "HR_REQUEST"
  | "CRM_TASK"
  | "CRM_EMAIL"
export type EmailEventStatus = "queued" | "sent" | "failed" | "bounced" | "delivered" | "skipped"

export interface EmailEventServer {
  id?: string
  type: EmailEventType
  lucrareId?: string
  clientId?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  status: EmailEventStatus
  messageId?: string
  error?: string
  provider?: string
  meta?: Record<string, any>
  createdAt?: any
  updatedAt?: any
}

function stripUndefinedDeep(input: any): any {
  if (input === null || input === undefined) return input
  if (Array.isArray(input)) return input.map(stripUndefinedDeep).filter((v) => v !== undefined)
  if (typeof input !== "object") return input
  const out: any = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue
    const vv = stripUndefinedDeep(v)
    if (vv === undefined) continue
    out[k] = vv
  }
  return out
}

function normalizeEmails(arr: any): string[] {
  if (!Array.isArray(arr)) return []
  const out: string[] = []
  for (const v of arr) {
    const s = typeof v === "string" ? v.trim() : ""
    if (!s) continue
    out.push(s)
  }
  return Array.from(new Set(out.map((x) => x.toLowerCase())))
}

export async function logEmailEventServer(
  event: Omit<EmailEventServer, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const clean = stripUndefinedDeep({
    ...event,
    to: normalizeEmails(event.to),
    cc: normalizeEmails((event as any).cc),
    bcc: normalizeEmails((event as any).bcc),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
  const ref = await adminDb.collection("emailEvents").add(clean)
  return ref.id
}

/** Merge recursiv pentru obiecte; `imapSentCopy` se înlocuiește întreg (nu se amestecă ok/error între rulări). */
function deepMergeRecord(existing: Record<string, any> | undefined, patch: Record<string, any>): Record<string, any> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {}
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    if (k === "imapSentCopy" && typeof v === "object" && v !== null && !Array.isArray(v)) {
      base[k] = { ...(v as Record<string, any>) }
      continue
    }
    const prev = base[k]
    if (
      prev !== undefined &&
      typeof prev === "object" &&
      prev !== null &&
      !Array.isArray(prev) &&
      typeof v === "object" &&
      v !== null &&
      !Array.isArray(v)
    ) {
      base[k] = deepMergeRecord(prev as Record<string, any>, v as Record<string, any>)
    } else {
      base[k] = v
    }
  }
  return base
}

export async function updateEmailEventServer(emailEventId: string, patch: Partial<EmailEventServer>): Promise<void> {
  if (!emailEventId) return

  const ref = adminDb.collection("emailEvents").doc(String(emailEventId))

  if (patch.meta === undefined) {
    const clean = stripUndefinedDeep({
      ...patch,
      ...(patch.to ? { to: normalizeEmails((patch as any).to) } : {}),
      ...(patch.cc ? { cc: normalizeEmails((patch as any).cc) } : {}),
      ...(patch.bcc ? { bcc: normalizeEmails((patch as any).bcc) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await ref.set(clean, { merge: true })
    return
  }

  const { meta: metaPatch, ...restPatch } = patch
  const mergedFromPatch = stripUndefinedDeep({
    ...restPatch,
    ...(restPatch.to ? { to: normalizeEmails((restPatch as any).to) } : {}),
    ...(restPatch.cc ? { cc: normalizeEmails((restPatch as any).cc) } : {}),
    ...(restPatch.bcc ? { bcc: normalizeEmails((restPatch as any).bcc) } : {}),
  })

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.exists ? (snap.data() as Record<string, any>) : {}
    const existingMeta =
      data.meta && typeof data.meta === "object" && !Array.isArray(data.meta) ? (data.meta as Record<string, any>) : {}
    const patchMeta =
      metaPatch && typeof metaPatch === "object" && !Array.isArray(metaPatch) ? (metaPatch as Record<string, any>) : {}
    const mergedMeta = deepMergeRecord(existingMeta, patchMeta)

    const payload = stripUndefinedDeep({
      ...mergedFromPatch,
      meta: mergedMeta,
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.set(ref, payload, { merge: true })
  })
}
