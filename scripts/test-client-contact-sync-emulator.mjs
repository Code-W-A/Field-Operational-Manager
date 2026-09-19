// Uses only the explicitly named demo project, never application credentials/production data.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { setTimeout as delay } from 'node:timers/promises'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const require = createRequire(new URL("../firebase-functions/package.json", import.meta.url))
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Start Firestore + Functions emulators first.')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
const { syncOneTicket, processClientContactSyncPage } = require('./lib/client-ticket-sync-worker.js')
initializeApp({ projectId: 'demo-fom-contact-sync' })
const db = getFirestore()
const before = { nume: 'MARF', adresa: 'Sediu', telefon: '100', email: 'office@marf.ro', locatii: [
  { id: 'l', nume: 'Avangarde', adresa: 'Adresa veche', persoaneContact: [{ id: 'p', nume: 'Admin', telefon: '200', email: 'support@marf.ro' }], echipamente: [{ id: 'e', nume: 'Bariera', cod: 'E1' }] },
] }
const base = { clientId: 'c', locationId: 'l', contactId: 'p', client: 'MARF', locatie: 'Avangarde', persoanaContact: 'Admin', telefon: '200', persoanaContactEmail: 'support@marf.ro',
  statusLucrare: 'Finalizat', statusFacturare: 'Nefacturat', tipLucrare: 'Intervenție', tehnicieni: [], dataEmiterii: '2026-09-10T10:00:00Z', dataInterventie: '2026-09-10T10:00:00Z',
  echipament: 'Bariera', echipamentId: 'e', descriere: 'Original', defectReclamat: 'Defect vechi', defectReclamatHistory: ['Primul defect'],
  clientInfo: { locationAddress: 'Adresa veche', custom: 'keep' }, persoaneContact: [{ ...before.locatii[0].persoaneContact[0], custom: 'keep' }],
  reportSnapshot: { telefon: '200' }, offerVersions: [{ total: 100, email: 'support@marf.ro' }] }
async function until(check, label) {
  const deadline = Date.now() + 60000
  do { if (await check()) return; await delay(200) } while (Date.now() < deadline)
  throw new Error(`Timed out: ${label}`)
}
await db.doc('clienti/c').set(before)
const batch = db.batch()
for (let i = 0; i < 102; i++) batch.set(db.doc(`lucrari/active-${String(i).padStart(3, '0')}`), base)
batch.set(db.doc('lucrari/archived'), { ...base, statusLucrare: 'Arhivată', archivedAt: '2026-09-10' })
batch.set(db.doc('lucrari/canceled'), { ...base, anulat: true })
batch.set(db.doc('lucrari/manual'), { ...base, telefon: 'manual', persoanaContactEmail: '', clientInfo: { locationAddress: 'Manual address', custom: 'keep' } })
const legacy = { ...base }; delete legacy.clientId; delete legacy.locationId; delete legacy.contactId
batch.set(db.doc('lucrari/legacy'), legacy)
await batch.commit()
const originalArchive = (await db.doc('lucrari/archived').get()).data()
const current = structuredClone(before)
current.nume = 'MARF nou'; current.locatii[0].nume = 'Avangarde nou'; current.locatii[0].adresa = 'Adresa noua'
Object.assign(current.locatii[0].persoaneContact[0], { nume: 'Admin nou', telefon: '300', email: 'suport@marf.ro' })
await db.doc('clienti/c').set(current)
await until(async () => (await db.doc('lucrari/active-101').get()).get('telefon') === '300' && (await db.doc('lucrari/legacy').get()).get('contactId') === 'p', 'paginated trigger sync')
const active = await db.collection('lucrari').where('clientId', '==', 'c').get()
for (const ticket of active.docs.filter(d => d.id.startsWith('active-'))) {
  assert.equal(ticket.get('persoanaContactEmail'), 'suport@marf.ro')
  assert.equal(ticket.get('clientInfo.locationAddress'), 'Adresa noua')
  assert.deepEqual(ticket.get('reportSnapshot'), base.reportSnapshot)
  assert.deepEqual(ticket.get('offerVersions'), base.offerVersions)
}
assert.deepEqual((await db.doc('lucrari/archived').get()).data(), originalArchive)
assert.equal((await db.doc('lucrari/canceled').get()).get('telefon'), '200')
assert.equal((await db.doc('lucrari/manual').get()).get('telefon'), 'manual')
assert.equal((await db.doc('lucrari/manual').get()).get('persoanaContactEmail'), '')
assert.ok((await db.doc('clientContactSyncIssues/manual').get()).exists)
console.log('PASS actual trigger: 102 tickets across pages, legacy IDs, manual conflicts, archive/canceled/snapshots unchanged')

await until(async () => (await db.collection('clientContactSyncJobs').where('status', '==', 'pending').get()).empty, 'all pages completed')
const completed = (await db.collection('clientContactSyncJobs').get()).docs[0]
const version = (await db.doc('lucrari/active-000').get()).updateTime.toMillis()
await processClientContactSyncPage.run(completed)
await syncOneTicket(db, 'c', before, 'active-000')
assert.equal((await db.doc('lucrari/active-000').get()).updateTime.toMillis(), version)
console.log('PASS duplicate event and completed-page replay: no ticket write')

await db.doc('lucrari/concurrent').set(base)
await Promise.all([syncOneTicket(db, 'c', before, 'concurrent'), db.doc('lucrari/concurrent').update({ telefon: 'concurrent manual' })])
assert.equal((await db.doc('lucrari/concurrent').get()).get('telefon'), 'concurrent manual')
await Promise.all([syncOneTicket(db, 'c', before, 'concurrent'), db.doc('lucrari/concurrent').update({ statusLucrare: 'Arhivată', archivedAt: '2026-09-16' })])
const concurrentArchive = (await db.doc('lucrari/concurrent').get()).data()
await syncOneTicket(db, 'c', before, 'concurrent')
assert.deepEqual((await db.doc('lucrari/concurrent').get()).data(), concurrentArchive)
console.log('PASS concurrent manual edit and archive transaction protection')

// Reverse-order events use the latest client even if their before-snapshots are older.
await db.doc('lucrari/reversed').set(base)
const intermediate = structuredClone(before); intermediate.locatii[0].persoaneContact[0].email = 'intermediate@marf.ro'
await syncOneTicket(db, 'c', intermediate, 'reversed')
await syncOneTicket(db, 'c', before, 'reversed')
assert.equal((await db.doc('lucrari/reversed').get()).get('persoanaContactEmail'), 'suport@marf.ro')
console.log('PASS reverse-order events converge to current source')

await db.doc('lucrari/reconcile').set(base)
await db.doc('lucrari/reconcile-archive').set(base)
const reviewedVersion = (await db.doc('lucrari/reconcile').get()).updateTime.toMillis()
const directory = await mkdtemp(path.join(tmpdir(), 'fom-contact-report-'))
const reportPath = path.join(directory, 'report.json'), selectionPath = path.join(directory, 'selection.json')
const cli = (...args) => execFileSync('./node_modules/.bin/tsx', ['scripts/reconcile-ticket-contacts.ts', '--project', 'demo-fom-contact-sync', ...args], { encoding: 'utf8', timeout: 60000 })
cli('--output', reportPath)
assert.equal((await db.doc('lucrari/reconcile').get()).updateTime.toMillis(), reviewedVersion)
await writeFile(selectionPath, JSON.stringify([{ ticketId: 'reconcile', fields: ['telefon', 'persoanaContactEmail'] }, { ticketId: 'reconcile-archive', fields: ['telefon'] }]))
await db.doc('lucrari/reconcile').update({ telefon: 'manual since report' })
await db.doc('lucrari/reconcile-archive').update({ archivedAt: '2026-09-16' })
const applied = cli('--apply', '--report', reportPath, '--selection', selectionPath).trim().split('\n').map(line => JSON.parse(line))
assert.deepEqual(applied[0].applied, ['persoanaContactEmail']); assert.deepEqual(applied[0].skipped, ['telefon'])
assert.deepEqual(applied[1].applied, []); assert.deepEqual(applied[1].skipped, ['telefon'])
const reconciled = (await db.doc('lucrari/reconcile').get()).data()
assert.equal(reconciled.telefon, 'manual since report'); assert.equal(reconciled.persoanaContactEmail, 'suport@marf.ro')
assert.equal(reconciled.clientInfo.locationAddress, 'Adresa veche')
console.log('PASS reconciliation CLI: default report only; selected fields only; concurrent edits and archive skipped')
await db.terminate()
