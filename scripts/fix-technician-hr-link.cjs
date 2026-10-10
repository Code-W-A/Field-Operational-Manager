// Dry-run by default. --apply requires explicit approval of the displayed correction.
require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const uid = 'h8QLAs0DI7a7qCUKd3BTv0ranfu1';
const keep = 'emp_822f426c1f484a599e0dd46e68dd733a';
const unlink = 'emp_86a1ccf5bfa84526821db43f7051158e';
async function main() {
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 'field-operational-manager');
  assert(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert(process.argv.slice(2).every(arg => arg === '--apply'));
  const app = initializeApp({ credential: cert({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') }) });
  try {
    assert.equal((await getAuth(app).getUserByEmail('mobitoolsro@gmail.com')).uid, uid);
    const db = getFirestore(app), apply = process.argv.includes('--apply');
    const result = await db.runTransaction(async tx => {
      const [linked, kept, other, sessions, timesheets] = await Promise.all([
        tx.get(db.collection('hrEmployees').where('userUid', '==', uid)),
        tx.get(db.doc(`hrEmployees/${keep}`)), tx.get(db.doc(`hrEmployees/${unlink}`)),
        tx.get(db.collection('attendance').where('userId', '==', uid)),
        tx.get(db.collection('hrTimesheets').where('employeeId', '==', unlink)),
      ]);
      assert(kept.exists && other.exists, 'Expected employees missing');
      assert.equal(kept.data().userUid, uid);
      assert.equal(kept.data().active, true);
      if (!other.data().userUid && linked.size === 1) return { status: 'already-correct' };
      assert.equal(other.data().userUid, uid, 'Association changed; stop');
      assert.equal(linked.size, 2, 'Unexpected associations; stop');
      assert.equal(timesheets.size, 0, 'Other employee now has timesheets; stop');
      const tagged = sessions.docs.filter(d => d.data().employeeId);
      assert(tagged.length > 0 && tagged.every(d => d.data().employeeId === keep), 'Attendance history changed; stop');
      if (apply) tx.update(other.ref, { userUid: FieldValue.delete() });
      return { status: apply ? 'applied' : 'dry-run', keep, unlink, field: 'userUid', previousValue: uid,
        sessionsRetained: sessions.size, documentsDeleted: 0 };
    });
    const remaining = await db.collection('hrEmployees').where('userUid', '==', uid).get();
    if (apply) assert.deepEqual(remaining.docs.map(d => d.id), [keep]);
    console.log(JSON.stringify({ ...result, linkedEmployeeIds: remaining.docs.map(d => d.id) }, null, 2));
  } finally { await deleteApp(app); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
