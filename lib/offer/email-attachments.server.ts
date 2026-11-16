import { randomUUID } from "node:crypto"
import { getStorage } from "firebase-admin/storage"
import { adminApp, adminDb } from "@/lib/firebase/admin"
import { hasOpportunityEditAccess, hasOpportunityViewAccess } from "@/lib/crm/access"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { OfferAttachmentError, parseOfferAttachments, validateOfferFile, validateOfferEmailSize, type OfferAttachmentContext, type OfferEmailAttachment } from "./email-attachments"

const collection = "offerEmailAttachments"
const bucket = () => getStorage(adminApp).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
export function parseAttachmentContext(value: any): OfferAttachmentContext {
  if (!value || !["crm", "ticket"].includes(value.kind) || typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,150}$/.test(value.id)) throw new OfferAttachmentError("Oferta asociată este invalidă.")
  return { kind: value.kind, id: value.id }
}
export async function requireAttachmentAccess(context: OfferAttachmentContext, uid: string, edit = true) {
  const record = await adminDb.collection(context.kind === "crm" ? CRM_COLLECTIONS.opportunities : "lucrari").doc(context.id).get()
  if (!record.exists) throw new OfferAttachmentError("Oportunitatea sau tichetul nu există.", 404)
  // Ticket offer editing is restricted to verified admin/dispecer, matching the existing editor routes.
  if (context.kind === "ticket") return
  const data = record.data()!
  const grants = await adminDb.collection(CRM_COLLECTIONS.opportunityAccess).where("opportunityId", "==", context.id).where("userId", "==", uid).limit(5).get()
  const opportunity = { ownerId: String(data.ownerId || ""), readUserIds: data.readUserIds || [], editUserIds: data.editUserIds || [] }
  const allowed = (edit ? hasOpportunityEditAccess : hasOpportunityViewAccess)(opportunity, uid, grants.docs.map(row => row.data().permission))
  if (!allowed) throw new OfferAttachmentError("Nu ai acces la atașamentele acestei oferte.", 403)
}
export async function initiateOfferAttachment(context: OfferAttachmentContext, uid: string, filename: unknown, size: unknown) {
  const file = validateOfferFile(filename, size)
  const id = randomUUID()
  const path = `offer-email-attachments/${uid}/${id}`
  await adminDb.collection(collection).doc(id).create({ ...file, id, path, kind: context.kind, contextId: context.id, ownerUid: uid, expiresAt: Date.now() + 10 * 60_000, ready: false })
  return { ...file, id, path }
}
async function getRecord(context: OfferAttachmentContext, id: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new OfferAttachmentError("Atașament invalid.")
  const snapshot = await adminDb.collection(collection).doc(id).get()
  const data = snapshot.data()
  if (!data || data.kind !== context.kind || data.contextId !== context.id) throw new OfferAttachmentError("Atașamentul nu aparține acestei oferte.", 403)
  return data
}
export async function finalizeOfferAttachment(context: OfferAttachmentContext, uid: string, id: string) {
  const data = await getRecord(context, id)
  if (data.ownerUid !== uid) throw new OfferAttachmentError("Nu ai acces la această încărcare.", 403)
  const [metadata] = await bucket().file(data.path).getMetadata()
  if (Number(metadata.size) !== data.size || metadata.contentType !== data.contentType) throw new OfferAttachmentError(`${data.filename}: încărcarea este incompletă sau invalidă.`)
  await adminDb.collection(collection).doc(id).update({ ready: true, generation: String(metadata.generation) })
  return { id, ...validateOfferFile(data.filename, data.size) }
}
export async function resolveOfferAttachments(context: OfferAttachmentContext, input: unknown): Promise<OfferEmailAttachment[]> {
  const files = parseOfferAttachments(input)
  const result = await Promise.all(files.map(async file => {
    const data = await getRecord(context, file.id)
    if (!data.ready) throw new OfferAttachmentError(`${data.filename}: încărcarea nu este finalizată.`)
    return { id: file.id, ...validateOfferFile(data.filename, data.size) }
  }))
  validateOfferEmailSize(result)
  return result
}
export async function readOfferAttachment(context: OfferAttachmentContext, id: string) {
  const data = await getRecord(context, id)
  if (!data.ready) throw new OfferAttachmentError(`${data.filename}: încărcarea nu este finalizată.`)
  validateOfferFile(data.filename, data.size)
  const file = bucket().file(data.path, { generation: data.generation })
  try {
    const [metadata] = await file.getMetadata()
    if (Number(metadata.size) !== data.size) throw new Error("size mismatch")
    const [content] = await file.download()
    if (content.length !== data.size) throw new Error("size mismatch")
    return { filename: data.filename as string, contentType: data.contentType as string, content }
  } catch { throw new OfferAttachmentError(`${data.filename}: fișierul nu poate fi citit. Reîncărcați-l înainte de trimitere.`) }
}
export async function buildOfferEmailAttachments(context: OfferAttachmentContext, input: unknown, pdf: { filename: string; content: Buffer; contentType: string }) {
  if (!pdf.content.length) throw new OfferAttachmentError("PDF-ul ofertei lipsește. Regenerați oferta.")
  const files = await resolveOfferAttachments(context, input)
  validateOfferEmailSize(files, pdf.content.length)
  const attachments = [pdf]
  // Bound memory to the validated total; do not start unbounded parallel downloads.
  for (const file of files) attachments.push(await readOfferAttachment(context, file.id))
  return attachments
}
