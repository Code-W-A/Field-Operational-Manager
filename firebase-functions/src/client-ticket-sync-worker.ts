import * as functions from "firebase-functions"
import { createHash } from "crypto"
import { FieldPath, FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore"
import { isContactSyncEligible, planClientTicketSync, type SyncRecord } from "./client-ticket-sync"

export async function syncOneTicket(db: Firestore, clientId: string, before: SyncRecord, workId: string) {
  const clientRef = db.doc(`clienti/${clientId}`), workRef = db.doc(`lucrari/${workId}`)
  return db.runTransaction(async tx => {
    const [client, work] = await Promise.all([tx.get(clientRef), tx.get(workRef)])
    if (!client.exists || !work.exists) return { skipped: true }
    const record = work.data()!
    if (!isContactSyncEligible(record)) return { skipped: true }
    const linkedId = record.clientId || record.clientInfo?.id
    if (linkedId && linkedId !== clientId) return { skipped: true }
    if (!linkedId) {
      // Name-only tickets are never assigned if another client has that exact name.
      const matches = await tx.get(db.collection("clienti").where("nume", "==", record.client).limit(2))
      if (record.client !== before.nume) return { skipped: true }
      if (matches.docs.some(d => d.id !== clientId)) {
        tx.set(db.doc(`clientContactSyncIssues/${workId}`), { clientId, workId,
          conflicts: ["Client ambiguu: selectați clientul explicit."], checkedAt: FieldValue.serverTimestamp() })
        return { skipped: true }
      }
    }
    const result = planClientTicketSync({ ...before, id: clientId }, { ...client.data(), id: clientId }, record)
    if (Object.keys(result.patch).length) tx.update(workRef, result.patch)
    const issueRef = db.doc(`clientContactSyncIssues/${workId}`)
    if (result.conflicts.length) {
      tx.set(issueRef, { clientId, workId, conflicts: result.conflicts, checkedAt: FieldValue.serverTimestamp() })
    } else tx.delete(issueRef)
    return result
  })
}

// Jobs retain only the source fields required for matching and comparison, not equipment/history.
const projectContactSource = (c: SyncRecord): SyncRecord => {
  const contact = (p: SyncRecord) => ({ id: p.id || "", nume: p.nume || "", telefon: p.telefon || "", email: p.email || "" })
  return { nume: c.nume || "", adresa: c.adresa || "", telefon: c.telefon || "", email: c.email || "",
    persoaneContact: (c.persoaneContact || []).map(contact),
    locatii: (c.locatii || []).map((l: SyncRecord) => ({ id: l.id || "", nume: l.nume || "", adresa: l.adresa || "", email: l.email || "", persoaneContact: (l.persoaneContact || []).map(contact) })) }
}
const relevant = (c: SyncRecord) => JSON.stringify(projectContactSource(c))

export const onClientContactDetailsChanged = functions.region("europe-west1")
  .runWith({ failurePolicy: true }).firestore.document("clienti/{clientId}").onUpdate(async (change, context) => {
    if (relevant(change.before.data()) === relevant(change.after.data())) return
    const db = getFirestore()
    const ref = db.collection("clientContactSyncJobs").doc(context.eventId)
    await db.runTransaction(async tx => {
      if ((await tx.get(ref)).exists) return
      tx.create(ref, { clientId: context.params.clientId, before: projectContactSource(change.before.data()), stage: 0, cursor: "", status: "pending", createdAt: FieldValue.serverTimestamp() })
    })
  })

// Each page creates its successor atomically. Failed pages retry safely and completed pages are no-ops.
export const processClientContactSyncPage = functions.region("europe-west1")
  .runWith({ failurePolicy: true, timeoutSeconds: 540 }).firestore.document("clientContactSyncJobs/{jobId}").onCreate(async (snapshot) => {
    const db = getFirestore()
    try {
      const job = (await snapshot.ref.get()).data()!
      if (job.status === "done") return
      const selectors = [["clientId", job.clientId], ["clientInfo.id", job.clientId], ["client", job.before.nume]]
      const [field, value] = selectors[job.stage]
      let query = db.collection("lucrari").where(field, "==", value || "").orderBy(FieldPath.documentId()).limit(100)
      if (job.cursor) query = query.startAfter(job.cursor)
      const page = await query.get()
      for (const ticket of page.docs) await syncOneTicket(db, job.clientId, job.before, ticket.id)
      await db.runTransaction(async tx => {
        if ((await tx.get(snapshot.ref)).get("status") === "done") return
        tx.update(snapshot.ref, { status: "done", processed: page.size, finishedAt: FieldValue.serverTimestamp() })
        const stage = page.size === 100 ? job.stage : job.stage + 1
        const nextId = createHash("sha256").update(snapshot.id).digest("hex")
        if (stage < selectors.length) tx.create(db.collection("clientContactSyncJobs").doc(nextId), {
          clientId: job.clientId, before: job.before, stage,
          cursor: page.size === 100 ? page.docs[page.size - 1].id : "", status: "pending",
        })
      })
    } catch (error) {
      await snapshot.ref.set({ lastError: error instanceof Error ? error.message : String(error),
        lastFailedAt: FieldValue.serverTimestamp(), failedAttempts: FieldValue.increment(1) }, { merge: true })
      throw error
    }
  })
