import { adminDb } from "@/lib/firebase/admin"
import { canResendReport, resolveResendRecipients } from "./report-resend"

export async function loadResendReport(workId: string) {
  if (!workId || workId.includes("/") || workId.length > 128) throw new Error("ID-ul tichetului este invalid.")
  const snap = await adminDb.collection("lucrari").doc(workId).get()
  if (!snap.exists || !canResendReport(snap.data()!)) throw new Error("Raportul nu este disponibil pentru retrimitere.")
  return { ...snap.data()!, id: snap.id }
}

export async function loadResendRecipients(workId: string) {
  const work: Record<string, any> = await loadResendReport(workId)
  const id = String(work.clientId || work.clientInfo?.id || "").trim()
  const docs = id
    ? [await adminDb.collection("clienti").doc(id).get()]
    : work.client
      ? (await adminDb.collection("clienti").where("nume", "==", work.client).limit(2).get()).docs
      : []
  return resolveResendRecipients(work, docs.filter(doc => doc.exists).map(doc => ({ ...doc.data(), id: doc.id })))
}
