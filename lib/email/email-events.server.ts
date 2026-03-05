import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"

export type EmailEventType = "REPORT" | "OFFER" | "GENERIC" | "TECH_NOTIFY" | "INVITE" | "TEST" | "HR_REQUEST" | "CRM_TASK"
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

export async function updateEmailEventServer(emailEventId: string, patch: Partial<EmailEventServer>): Promise<void> {
  if (!emailEventId) return
  const clean = stripUndefinedDeep({
    ...patch,
    ...(patch.to ? { to: normalizeEmails((patch as any).to) } : {}),
    ...(patch.cc ? { cc: normalizeEmails((patch as any).cc) } : {}),
    ...(patch.bcc ? { bcc: normalizeEmails((patch as any).bcc) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  })
  await adminDb.collection("emailEvents").doc(String(emailEventId)).set(clean, { merge: true })
}

