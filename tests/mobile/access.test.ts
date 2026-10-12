import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { mobileAccessService } from "../../lib/mobile/access";
import {
  MOBILE_TERMS_VERSION,
  FOM_CONTRACT_VERSION,
} from "../../packages/fom-domain";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw new Error("Local Emulator only");
const uid = `access-${Date.now()}`,
  app = initializeApp({ projectId: "demo-fom-mobile-auth" }, uid),
  db = getFirestore(app),
  service = mobileAccessService(db);
before(async () => {
  await db
    .doc(`users/${uid}`)
    .set({ uid, role: "tehnician", displayName: uid });
  await db
    .doc(`hrEmployees/${uid}`)
    .set({ userUid: uid, nume: "Test", salary: "DO-NOT-EXPOSE" });
  await db.doc(`lucrari/${uid}`).set({
    tehnicieni: [uid],
    statusLucrare: "Atribuită",
    client: "PRIVATE-WORK",
  });
});
after(() => deleteApp(app));
test("terms acceptance is explicit, versioned, idempotent and account scoped", async () => {
  await assert.rejects(
    () => service.requireAccess(uid, false),
    /Acceptă termenii/,
  );
  for (const input of [
    { version: MOBILE_TERMS_VERSION, accepted: false },
    { version: "old", accepted: true },
    null,
  ])
    await assert.rejects(() => service.accept(uid, input));
  await service.accept(uid, { version: MOBILE_TERMS_VERSION, accepted: true });
  const ref = db.doc(
      `mobileTermsAcceptances/${uid}/versions/${MOBILE_TERMS_VERSION}`,
    ),
    first = (await ref.get()).data();
  await service.accept(uid, { version: MOBILE_TERMS_VERSION, accepted: true });
  assert.deepEqual((await ref.get()).data(), first);
  assert.equal((await service.status(`${uid}-other`)).termsAccepted, false);
  assert.equal(first?.uid, uid);
  assert(first?.acceptedAt);
});
test("minimal attendance bundle never returns company data or unrelated employee fields", async () => {
  const bundle = await service.attendanceBundle(uid);
  assert.deepEqual(bundle.works, []);
  assert.deepEqual(bundle.procedures, []);
  assert.deepEqual(bundle.clients, []);
  assert(!JSON.stringify(bundle).includes("DO-NOT-EXPOSE"));
  assert(bundle.employee);
});
test("active attendance is required and completed or foreign sessions do not grant access", async () => {
  await assert.rejects(() => service.requireAccess(uid), /Pontează-te/);
  await db
    .doc(`attendance/${uid}`)
    .set({ userId: uid, status: "active", sessionStart: new Date() });
  assert.equal((await service.requireAccess(uid)).activeSessionId, uid);
  await db
    .doc(`attendance/${uid}`)
    .update({ status: "completed", sessionEnd: new Date() });
  await db
    .doc(`attendance/${uid}-other`)
    .set({ userId: `${uid}-other`, status: "active" });
  await assert.rejects(() => service.requireAccess(uid), /Pontează-te/);
});
test(
  "mobile HTTP gates protect reads and writes while leaving web CRM and attendance available",
  { skip: process.env.FOM_TEST_HTTP !== "true" },
  async () => {
    assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9199");
    await getAuth(app).createUser({
      uid,
      email: `${uid}@fom.test`,
      password: "FomTest123!",
    });
    const login = await fetch(
      "http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `${uid}@fom.test`,
          password: "FomTest123!",
          returnSecureToken: true,
        }),
      },
    );
    const token = (await login.json()).idToken;
    const call = (path: string, body?: unknown) =>
      fetch(`http://127.0.0.1:3000/api/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let response = await call("mobile/bootstrap"),
      data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.access.activeSessionId, null);
    assert.deepEqual(data.bundle.works, []);
    for (const path of [
      "mobile/bootstrap?code=QR",
      "mobile/bootstrap?installation=work",
      "mobile/document?workId=work",
      "mobile/files?workId=work&path=photo",
      "mobile/crm/opportunities",
    ]) {
      response = await call(path);
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).code, "MOBILE_ATTENDANCE_REQUIRED");
    }
    response = await call("mobile/commands", {
      contractVersion: FOM_CONTRACT_VERSION,
      action: "notification.read",
      mutationId: `${uid}-blocked`,
      entityId: uid,
      occurredAt: new Date().toISOString(),
      baseVersion: null,
      payload: {},
    });
    assert.equal(response.status, 403);
    response = await call("mobile/commands", {
      contractVersion: FOM_CONTRACT_VERSION,
      action: "attendance.start",
    });
    assert.notEqual(response.status, 403); // payload validation remains in canonical service
    response = await call("technician/crm/opportunities");
    assert.equal(response.status, 200);
    await db
      .doc(`attendance/${uid}`)
      .update({ status: "active", sessionEnd: FieldValue.delete() });
    response = await call("mobile/bootstrap");
    data = await response.json();
    assert.equal(response.status, 200);
    assert(data.bundle.works.length > 0);
    await db.doc(`attendance/${uid}`).update({ status: "completed" });
    response = await call("mobile/crm/opportunities");
    assert.equal(response.status, 403);
    response = await call("mobile/tracking", {
      sessionId: uid,
      points: [],
      state: "stopped",
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).sessionActive, false);
    await db
      .doc(`mobileTermsAcceptances/${uid}/versions/${MOBILE_TERMS_VERSION}`)
      .delete();
    response = await call("mobile/bootstrap");
    assert.equal((await response.json()).code, "MOBILE_TERMS_REQUIRED");
    response = await call("mobile/terms", {
      version: MOBILE_TERMS_VERSION,
      accepted: true,
    });
    assert.equal(response.status, 200);
  },
);
