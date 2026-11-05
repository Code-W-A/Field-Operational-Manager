import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { technicianService } from "../technician/service";
import { installationService } from "../installations/service";
import { issueDraftGrant } from "./draft-grant";
import { versionOf, stopIntervals, type Command } from "@/packages/fom-domain";
assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(localhost|127\.0\.0\.1):\d+$/,
);
const projectId = "demo-fom-signing-stop-tests",
  app = initializeApp({ projectId }, projectId),
  db = getFirestore(app);
const svc = technicianService(db),
  installs = installationService(db);
const uid = "offline-tech",
  actor = { uid, role: "tehnician" };
let grant: any, start: Command;
process.env.MOBILE_STOP_FOR_SIGNING_USER_IDS = uid;
beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await db.doc(`users/${uid}`).set({ role: "tehnician", displayName: "Tech" });
  await db.doc("users/admin").set({ role: "admin", displayName: "Admin" });
  await db.doc("settings/mobile-offline-phase2").set({ enabledUserIds: [uid] });
  await db.doc("attendance/attendance-test").set({
    userId: uid,
    sessionStart: Timestamp.fromMillis(Date.now() - 3600000),
    status: "active",
  });
  await db.doc("clienti/client").set({
    nume: "Test",
    cui: "RO1",
    adresa: "Test",
    locatii: [
      {
        id: "loc",
        nume: "Loc",
        adresa: "Addr",
        persoaneContact: [
          {
            id: "contact",
            nume: "Test",
            email: "test@example.invalid",
            telefon: "0700000000",
          },
        ],
        echipamente: [{ id: "eq", cod: "QR1", nume: "Eq" }],
      },
    ],
  });
  await db.doc("lucrari/work").set({
    client: "Test",
    clientId: "client",
    locationId: "loc",
    locatie: "Loc",
    tipLucrare: "Intervenție în garanție",
    nrLucrare: "#1",
    statusLucrare: "Atribuită",
    technicianIds: [uid],
    tehnicieni: ["Tech"],
    equipmentIds: ["eq"],
    equipmentId: "eq",
    echipamentCod: "QR1",
    updatedAt: "v1",
  });
  grant = await issueDraftGrant(db, uid, "attendance-test", ["work"]);
  start = {
    mutationId: "offline-start-123",
    entityId: "work",
    baseVersion: "v1",
    occurredAt: new Date(grant.confirmedAt + 1).toISOString(),
    attendanceId: "attendance-test",
    action: "verify",
    payload: { equipmentId: "eq", code: "QR1", qrRaw: "QR1" },
    offlineWork: {
      sessionId: "offline-start-123",
      deviceId: "device-123",
      grantId: grant.grantId,
      event: "start",
      clockDriftMs: 0,
    },
  };
});
after(async () => {
  await db.terminate();
  await deleteApp(app);
});

async function prepare(kind = "intervention") {
  const startedAt = new Date(Date.now() - 600000).toISOString();
  const extra: any = {
    equipmentVerified: true,
    timpSosire: startedAt,
    statusLucrare: "În lucru",
  };
  if (kind === "revision")
    Object.assign(extra, {
      tipLucrare: "Revizie",
      equipmentIds: ["eq", "eq2"],
      revisionEquipmentTimes: {
        eq: { startIso: startedAt },
        eq2: { startIso: startedAt },
      },
    });
  await db.doc("lucrari/work").update(extra);
  const w = (await db.doc("lucrari/work").get()).data()!;
  return {
    mutationId: "signing-stop-123",
    entityId: "work",
    baseVersion: versionOf(w),
    occurredAt: new Date().toISOString(),
    attendanceId: "attendance-test",
    action: "work.stop",
    payload: { equipmentId: "eq" },
    offlineStop: {
      grantId: grant.grantId,
      deviceId: "device-123",
      clockDriftMs: 0,
      intervals: stopIntervals(w),
    },
  } as Command;
}
test("official start before grant stops without old offline start; receipt handles lost response and concurrent retry", async () => {
  const c = await prepare();
  const [a, b] = await Promise.all([svc.command(uid, c), svc.command(uid, c)]);
  assert.equal(a.version, b.version);
  await svc.command(uid, c);
  assert.equal(
    (await db.doc("lucrari/work").get()).data()?.timpPlecare,
    c.occurredAt,
  );
  assert.equal((await db.collection("mobileOfflineWork").get()).size, 0);
});
test("all active revision intervals stop in one transaction", async () => {
  const c = await prepare("revision");
  await svc.command(uid, c);
  const w = (await db.doc("lucrari/work").get()).data()!;
  assert.equal(w.revisionEquipmentTimes.eq.endIso, c.occurredAt);
  assert.equal(w.revisionEquipmentTimes.eq2.endIso, c.occurredAt);
  assert.equal(w.timpPlecare, c.occurredAt);
});
test("new grant and subsequent depontare preserve historical valid stop", async () => {
  const c = await prepare();
  await issueDraftGrant(db, uid, "attendance-test", ["work"]);
  await db
    .doc("attendance/attendance-test")
    .update({
      status: "closed",
      sessionEnd: Timestamp.fromMillis(Date.parse(c.occurredAt) + 1000),
    });
  await svc.command(uid, c);
});
for (const reason of [
  "reassigned",
  "cancelled",
  "version",
  "externalStop",
  "clock",
  "expired",
  "depontare",
])
  test(`reject ${reason} without overriding official work`, async () => {
    const c = await prepare();
    let change: any = {};
    if (reason === "reassigned")
      change = { technicianIds: ["other"], tehnicieni: ["Other"] };
    if (reason === "cancelled") change = { anulat: true };
    if (reason === "version") change = { updatedAt: "v2" };
    if (reason === "externalStop")
      change = { timpPlecare: new Date().toISOString() };
    if (reason === "clock") c.offlineStop!.clockDriftMs = 300001;
    if (reason === "expired")
      c.occurredAt = new Date(grant.expiresAt).toISOString();
    if (reason === "depontare")
      await db
        .doc("attendance/attendance-test")
        .update({
          sessionEnd: Timestamp.fromMillis(Date.parse(c.occurredAt) - 1),
        });
    if (Object.keys(change).length) await db.doc("lucrari/work").update(change);
    await assert.rejects(svc.command(uid, c));
    assert.equal((await db.collection("mobileCommands").get()).size, 0);
  });
test("installation uploads before stop, preserves photo and freezes official interval; duplicate does not stop twice", async () => {
  const made = await installs.create(
    { uid: "admin", role: "admin" },
    {
      client: "Test",
      clientId: "client",
      locationId: "loc",
      locatie: "Loc",
      contactId: "contact",
      persoanaContact: "Test",
      telefon: "0700000000",
      persoanaContactEmail: "test@example.invalid",
      equipmentIds: ["eq"],
      tehnicieni: ["Tech"],
      nrLucrare: "#2",
      dataInterventie: "05.11.2026 10:00",
    },
    "create-signing-test",
  );
  const ref = db.doc(`lucrari/${made.id}`);
  await ref.update({ technicianIds: [uid] });
  const begin: Command = {
    mutationId: "online-installation-start",
    entityId: made.id,
    baseVersion: versionOf((await ref.get()).data()!),
    occurredAt: new Date().toISOString(),
    attendanceId: "attendance-test",
    action: "installation",
    payload: { action: "start", equipmentId: "eq", qrRaw: "QR1" },
  };
  const started = await svc.command(uid, begin);
  assert.equal(started.version, versionOf((await ref.get()).data()!));
  assert.equal((await svc.command(uid, begin)).version, started.version);
  const g = await issueDraftGrant(db, uid, "attendance-test", [made.id]);
  const w = (await ref.get()).data()!;
  const c: Command = {
    mutationId: "offline-installation-stop",
    entityId: made.id,
    baseVersion: versionOf(w),
    occurredAt: new Date().toISOString(),
    attendanceId: "attendance-test",
    action: "installation",
    payload: {
      action: "stop",
      sheetId: started.sheet.id,
      revision: started.sheet.revision,
      fields: {
        finding: "Test",
        operations: "Montaj",
        installationStatus: "completed",
        blockReason: "",
        internalNote: "",
      },
    },
    offlineStop: {
      grantId: g.grantId!,
      deviceId: "device-signing-test",
      clockDriftMs: 0,
      intervals: stopIntervals(w, started.sheet),
    },
  };
  const photo = {
    id: "photo-signing-test",
    path: "test/photo.jpg",
    name: "photo.jpg",
    contentType: "image/jpeg",
  };
  const uploaded = await installs.attachPhoto(
    actor,
    made.id,
    started.sheet.id,
    photo,
    false,
    started.sheet.revision,
    c,
  );
  assert.equal(
    (
      await installs.attachPhoto(
        actor,
        made.id,
        started.sheet.id,
        photo,
        false,
        started.sheet.revision,
        c,
      )
    ).sheet.revision,
    uploaded.sheet.revision,
  );
  c.payload.revision = uploaded.sheet.revision;
  const done = await svc.command(uid, c);
  const again = await svc.command(uid, c);
  assert.equal(done.sheet.stoppedAt, c.occurredAt);
  assert.equal(again.sheet.revision, done.sheet.revision);
  assert.equal(done.sheet.photos[0].id, photo.id);
  assert.equal(done.sheet.timeIntervals[0].endedAt, c.occurredAt);
});
