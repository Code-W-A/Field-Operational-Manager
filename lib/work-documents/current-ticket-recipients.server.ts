import { adminDb } from "@/lib/firebase/admin"
import { currentTicketRecipients } from "./current-ticket-recipients"
import type { SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

export async function loadCurrentTicketRecipients(workId: string, mode: "work-order" | "postponed" | "report") {
  const workSnap = await adminDb.collection("lucrari").doc(workId).get()
  if (!workSnap.exists) throw new Error("Tichetul nu mai este disponibil.")
  const work = { ...workSnap.data(), id: workSnap.id } as SyncRecord
  const id = String(work.clientId || work.clientInfo?.id || "").trim()
  const matches = id
    ? [await adminDb.collection("clienti").doc(id).get()]
    : work.client
      ? (await adminDb.collection("clienti").where("nume", "==", work.client).limit(2).get()).docs
      : []
  if (matches.length !== 1 || !matches[0].exists) throw new Error("Fișa clientului lipsește sau este ambiguă.")
  const client = { ...matches[0].data(), id: matches[0].id } as SyncRecord
  return { work, client, ...currentTicketRecipients(work, client, mode) }
}
