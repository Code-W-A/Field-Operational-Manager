/** Explicit project + report-only by default. Never run as part of deployment. */
import { applicationDefault, initializeApp } from "firebase-admin/app"
import { FieldPath, getFirestore } from "firebase-admin/firestore"
import { readFile, writeFile } from "node:fs/promises"
import { isContactSyncEligible, type SyncRecord } from "../firebase-functions/src/client-ticket-sync"
import { reportTicketContact, planSelectedContactCorrections, type ContactReconciliation } from "../firebase-functions/src/client-contact-reconciliation"

const args = process.argv.slice(2)
const option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
async function main() {
  const projectId = option("--project")
  if (!projectId || projectId.startsWith("--")) throw new Error("Indicați explicit --project <project-id>.")
  const app = initializeApp({ projectId, ...(process.env.FIRESTORE_EMULATOR_HOST ? {} : { credential: applicationDefault() }) })
  const db = getFirestore(app)
  if (args.includes("--apply")) {
    const selectionPath = option("--selection"), reportPath = option("--report")
    if (!selectionPath || !reportPath) throw new Error("Aplicarea necesită --report raport.json și --selection selectie.json cu ticketId și fields explicite.")
    const report = JSON.parse(await readFile(reportPath, "utf8"))
    if (report.projectId !== projectId) throw new Error("Proiectul nu corespunde raportului.")
    const selections = JSON.parse(await readFile(selectionPath, "utf8")) as { ticketId: string; fields: string[] }[]
    if (!Array.isArray(selections) || selections.some(s => !s.ticketId || !Array.isArray(s.fields) || s.fields.some(f => typeof f !== "string"))) throw new Error("Selecție invalidă.")
    for (const selection of selections) {
      const reviewed: ContactReconciliation = report.tickets.find((t: ContactReconciliation) => t.ticketId === selection.ticketId)
      if (!reviewed) throw new Error(`Tichet absent din raport: ${selection.ticketId}`)
      const result = await db.runTransaction(async tx => {
        const workRef = db.doc(`lucrari/${selection.ticketId}`)
        const [work, client] = await Promise.all([tx.get(workRef), tx.get(db.doc(`clienti/${reviewed.clientId}`))])
        if (!work.exists || !client.exists) return { applied: [], skipped: selection.fields }
        const data = work.data()!
        if (!data.clientId && !data.clientInfo?.id) {
          const clients = await tx.get(db.collection("clienti").where("nume", "==", data.client || "").limit(2))
          if (clients.size !== 1 || clients.docs[0].id !== client.id) return { applied: [], skipped: selection.fields }
        }
        const planned = planSelectedContactCorrections({ ...client.data(), id: client.id }, { ...data, id: work.id }, reviewed, selection.fields)
        if (Object.keys(planned.patch).length) tx.update(workRef, planned.patch)
        return { applied: selection.fields.filter(f => !planned.skipped.includes(f)), skipped: planned.skipped }
      })
      console.log(JSON.stringify({ ticketId: selection.ticketId, ...result }))
    }
    return
  }
  const tickets: ContactReconciliation[] = []
  let cursor = ""
  for (;;) {
    let query = db.collection("lucrari").orderBy(FieldPath.documentId()).limit(100)
    if (cursor) query = query.startAfter(cursor)
    const page = await query.get()
    for (const snapshot of page.docs) {
      const work: SyncRecord = { ...snapshot.data(), id: snapshot.id }
      if (!isContactSyncEligible(work)) continue
      const id = work.clientId || work.clientInfo?.id
      let client: SyncRecord | null = null
      if (id) {
        const value = await db.doc(`clienti/${id}`).get()
        if (value.exists) client = { ...value.data(), id: value.id }
      } else {
        const matches = await db.collection("clienti").where("nume", "==", work.client || "").limit(2).get()
        if (matches.size === 1) client = { ...matches.docs[0].data(), id: matches.docs[0].id }
      }
      tickets.push(client ? reportTicketContact(client, work) : { ticketId: work.id, clientId: id || "", differences: [], issues: ["Client lipsă sau ambiguu"] })
    }
    if (page.size < 100) break
    cursor = page.docs[page.size - 1].id
  }
  const output = JSON.stringify({ projectId, generatedAt: new Date().toISOString(), tickets }, null, 2)
  const destination = option("--output")
  if (destination) await writeFile(destination, output, { flag: "wx" })
  else console.log(output)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
