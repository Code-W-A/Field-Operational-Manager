#!/usr/bin/env node
// Explicit project/client; read-only prepare, reviewed report required for apply.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
require('@next/env').loadEnvConfig(root);
require('tsx/cjs');
const { planLegacyRevisionLocationRepair } = require('../firebase-functions/src/work-location-association.ts');
const { resolveTicketLocation } = require('../firebase-functions/src/client-ticket-sync.ts');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp, GeoPoint, DocumentReference } = require('firebase-admin/firestore');
const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
const projectId = args.includes('--project') && option('--project');
const clientId = args.includes('--client') && option('--client');
const directory = args.includes('--backup') && option('--backup');
if (!projectId || !clientId || !directory || projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIRESTORE_EMULATOR_HOST) throw Error('Explicit matching --project, --client and --backup required.');
initializeApp({ credential: cert({ projectId, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
const db = getFirestore(), clientRef = db.doc(`clienti/${clientId}`);
function encode(v) {
  if (v instanceof Timestamp) return { $type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof GeoPoint) return { $type: 'geopoint', latitude: v.latitude, longitude: v.longitude };
  if (v instanceof DocumentReference) return { $type: 'reference', path: v.path };
  if (Buffer.isBuffer(v)) return { $type: 'bytes', base64: v.toString('base64') };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, encode(v[k])]));
  return v;
}
const hash = data => crypto.createHash('sha256').update(JSON.stringify(encode(data))).digest('hex');
const record = d => ({ path: d.ref.path, updateTime: encode(d.updateTime), data: encode(d.data()), hash: hash(d.data()) });
const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
async function snapshot() {
  const [clients, works] = await Promise.all([db.collection('clienti').get(), db.collection('lucrari').where('clientId', '==', clientId).get()]);
  const revisions = []; let index = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (index < works.docs.length) {
      const d = works.docs[index++];
      revisions.push(...(await d.ref.collection('revisions').get()).docs.map(record));
    }
  }));
  return { clients: clients.docs.map(record), works: works.docs.map(record), revisions };
}
function compare(before, after) {
  const old = new Map(before.map(d => [d.path, d])), now = new Map(after.map(d => [d.path, d]));
  return { removed: [...old.keys()].filter(k => !now.has(k)), added: [...now.keys()].filter(k => !old.has(k)), changed: [...old.keys()].filter(k => now.has(k) && (old.get(k).hash !== now.get(k).hash || JSON.stringify(old.get(k).updateTime) !== JSON.stringify(now.get(k).updateTime))) };
}
(async () => {
  if (!args.includes('--apply')) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const client = await clientRef.get(); if (!client.exists) throw Error('Client missing');
    const c = { ...client.data(), id: client.id }, before = await snapshot();
    if (before.clients.find(d => d.path === clientRef.path)?.hash !== hash(client.data())) throw Error('Client changed during snapshot');
    const selection = [];
    for (const row of before.works) {
      try { resolveTicketLocation(c, row.data); continue; } catch {}
      const patch = planLegacyRevisionLocationRepair(c, row.data);
      if (before.revisions.some(r => r.path.startsWith(row.path + '/revisions/'))) throw Error(`Saved revision exists: ${row.path}`);
      selection.push({ path: row.path, nr: row.data.nrLucrare, old: row.data.locationId, next: patch.locationId, updateTime: row.updateTime, hash: row.hash });
    }
    if (selection.length !== Number(option('--expect-count'))) throw Error(`Unexpected selection size: ${selection.length}`);
    save('before.json', { projectId, clientId, client: record(client), ...before });
    save('selection.json', { projectId, clientId, generatedAt: new Date().toISOString(), selection });
    console.log(JSON.stringify({ prepared: true, selected: selection.length, works: before.works.length, clients: before.clients.length, revisions: before.revisions.length, directory }));
    return;
  }
  const before = read('before.json'), reviewed = read('selection.json');
  if (before.projectId !== projectId || before.clientId !== clientId || reviewed.projectId !== projectId || reviewed.clientId !== clientId || reviewed.selection.length !== Number(option('--expect-count'))) throw Error('Reviewed target/count mismatch');
  if (fs.existsSync(path.join(directory, 'write-receipt.json'))) throw Error('Already applied; inspect verification before retrying');
  const expected = new Map(before.works.map(row => [row.path, row]));
  const selection = reviewed.selection;
  if (new Set(selection.map(row => row.path)).size !== selection.length) throw Error('Duplicate selection');
  await db.runTransaction(async tx => {
    const client = await tx.get(clientRef);
    if (!client.exists || hash(client.data()) !== before.client.hash || JSON.stringify(encode(client.updateTime)) !== JSON.stringify(before.client.updateTime)) throw Error('Client changed after review');
    const docs = await tx.getAll(...selection.map(row => db.doc(row.path)));
    for (let i = 0; i < selection.length; i++) {
      const row = selection[i], d = docs[i], original = expected.get(row.path);
      if (!original || !d.exists || hash(d.data()) !== row.hash || original.hash !== row.hash || JSON.stringify(encode(d.updateTime)) !== JSON.stringify(row.updateTime)) throw Error(`Concurrent ticket change: ${row.path}`);
      const patch = planLegacyRevisionLocationRepair({ ...client.data(), id: client.id }, d.data());
      if (patch.locationId !== row.next || d.get('locationId') !== row.old) throw Error(`Mapping changed: ${row.path}`);
      if (!(await tx.get(d.ref.collection('revisions').limit(1))).empty) throw Error(`Revision started after review: ${row.path}`);
    }
    // All reads precede writes; do not touch updatedAt, contacts, dates, statuses or notification flags.
    for (const row of selection) tx.update(db.doc(row.path), { locationId: row.next });
  });
  save('write-receipt.json', { appliedAt: new Date().toISOString(), projectId, clientId, selection });
  const after = await snapshot(); save('after.json', after);
  const selected = new Set(selection.map(row => row.path));
  const changedFields = selection.map(row => {
    const old = expected.get(row.path).data, actual = after.works.find(d => d.path === row.path)?.data;
    const changed = actual ? [...new Set([...Object.keys(old), ...Object.keys(actual)])].filter(key => JSON.stringify(old[key]) !== JSON.stringify(actual[key])) : ['document-missing'];
    return { path: row.path, fields: changed, correctId: actual?.locationId === row.next };
  });
  const report = { applied: selection.length, changedFields, clients: compare(before.clients, after.clients), otherWorks: compare(before.works.filter(d => !selected.has(d.path)), after.works.filter(d => !selected.has(d.path))), revisions: compare(before.revisions, after.revisions), verifiedAt: new Date().toISOString() };
  report.verified = changedFields.every(r => r.correctId && JSON.stringify(r.fields) === '["locationId"]') && [report.clients, report.otherWorks, report.revisions].every(d => !d.changed.length && !d.added.length && !d.removed.length);
  save('verification.json', report);
  console.log(JSON.stringify(report));
  if (!report.verified) process.exitCode = 2;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
