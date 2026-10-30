import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { technicianService } from "../technician/service";
import { installationService } from "../installations/service";
import { issueDraftGrant } from "./draft-grant";
import { versionOf, type Command } from "@/packages/fom-domain";
assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(localhost|127\.0\.0\.1):\d+$/,
);
const projectId = "demo-fom-offline-phase2-tests",
  app = initializeApp({ projectId }, projectId),
  db = getFirestore(app);
const svc = technicianService(db),
  installs = installationService(db);
const uid = "offline-tech",
  actor = { uid, role: "tehnician" };
let grant: any, start: Command;
beforeEach(async () => {
  await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  await db.doc(`users/${uid}`).set({ role: "tehnician", displayName: "Tech" });
  await db.doc("users/admin").set({ role: "admin", displayName: "Admin" });
  await db.doc("settings/mobile-offline-phase2").set({ enabledUserIds: [uid] });
  await db
    .doc("attendance/attendance-test")
    .set({
      userId: uid,
      sessionStart: Timestamp.fromMillis(Date.now() - 3600000),
      status: "active",
    });
  await db
    .doc("clienti/client")
    .set({
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
  await db
    .doc("lucrari/work")
    .set({
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
function stop(c = start): Command {
  return {
    ...c,
    mutationId: c.mutationId + "_stop",
    predecessorId: c.mutationId,
    occurredAt: new Date(Date.parse(c.occurredAt) + 20000).toISOString(),
    action: "work.stop",
    payload: { equipmentId: "eq" },
    offlineWork: { ...c.offlineWork!, event: "stop" },
  };
}
test("start/stop receipt and time survive duplicate and concurrent delivery", async () => {
  const [a, b] = await Promise.all([
    svc.command(uid, start),
    svc.command(uid, start),
  ]);
  assert.equal(a.version, b.version);
  await svc.command(uid, stop());
  await svc.command(uid, stop());
  const w = (await db.doc("lucrari/work").get()).data()!;
  assert.equal(w.timpSosire, start.occurredAt);
  assert.equal(w.timpPlecare, stop().occurredAt);
  assert.equal(
    (
      await db
        .doc(`mobileOfflineWork/${uid}/sessions/${start.mutationId}`)
        .get()
    ).data()?.durationSeconds,
    20,
  );
  assert.equal((await db.collection("mobileCommands").get()).size, 2);
});
test("new grant does not invalidate older pending events", async () => {
  await issueDraftGrant(db, uid, "attendance-test", ["work"]);
  await svc.command(uid, start);
  await svc.command(uid, stop());
});
test("reassignment, clock change and cancellation reject without partial writes", async () => {
  await assert.rejects(
    svc.command(uid, {
      ...start,
      offlineWork: { ...start.offlineWork!, clockDriftMs: 300001 },
    }),
    /verificare/,
  );
  await db
    .doc("lucrari/work")
    .update({ technicianIds: [uid, "other"], tehnicieni: ["Tech", "Other"] });
  await assert.rejects(svc.command(uid, start), /exclusiv/);
  await db
    .doc("lucrari/work")
    .update({ technicianIds: [uid], tehnicieni: ["Tech"], anulat: true });
  await assert.rejects(svc.command(uid, start), /reconcilierea/);
  assert.equal((await db.collection("mobileCommands").get()).size, 0);
});
test("a second device cannot start overlapping work", async () => {
  await svc.command(uid, start);
  const other = {
    ...start,
    mutationId: "second-device-123",
    offlineWork: {
      ...start.offlineWork!,
      sessionId: "second-device-123",
      deviceId: "device-456",
    },
  };
  await assert.rejects(svc.command(uid, other));
  assert.equal(
    (await db.doc(`mobileOfflineWork/${uid}`).get()).data()?.activeSessionId,
    start.mutationId,
  );
});
test("external checkout rejects events after checkout but retains historical eligibility", async () => {
  await db
    .doc("attendance/attendance-test")
    .update({
      status: "completed",
      sessionEnd: Timestamp.fromMillis(Date.parse(start.occurredAt) + 1000),
    });
  await svc.command(uid, start);
  await assert.rejects(svc.command(uid, stop()), /pontaj/);
});
test("installation records offline start and stop atomically with the actual sheet", async () => {
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
      dataInterventie: "30.10.2026 10:00",
    },
    "create-offline-123",
  );
  const ref = db.doc(`lucrari/${made.id}`);
  await ref.update({ technicianIds: [uid] });
  const version = versionOf((await ref.get()).data()!);
  const g = await issueDraftGrant(db, uid, "attendance-test", [made.id]);
  const c: Command = {
    ...start,
    entityId: made.id,
    baseVersion: version,
    occurredAt: new Date(g.confirmedAt + 1).toISOString(),
    action: "installation",
    payload: { action: "start", equipmentId: "eq", qrRaw: "QR1" },
    offlineWork: { ...start.offlineWork!, grantId: g.grantId! },
  };
  const a = await svc.command(uid, c);
  const end = {
    ...stop(c),
    action: "installation" as const,
    payload: {
      action: "stop",
      sheetId: a.sheet.id,
      revision: a.sheet.revision,
      fields: {
        finding: "Test",
        operations: "Montaj",
        installationStatus: "completed",
        blockReason: "",
        internalNote: "",
      },
    },
  };
  const result = await svc.command(uid, end);
  assert.equal(result.sheet.stoppedAt, end.occurredAt);
  assert.equal(result.sheet.timeIntervals[0].startedAt, c.occurredAt);
  assert.equal(result.sheet.timeIntervals[0].endedAt, end.occurredAt);
  assert.equal(
    (await db.doc(`installationTechnicianSessions/${uid}`).get()).exists,
    false,
  );
  await svc.command(uid, end);
});

test("successive revision equipment reconciles in order and freezes the summed duration", async () => {
  const client = (await db.doc("clienti/client").get()).data()!;
  client.locatii[0].echipamente.push({ id: "eq2", cod: "QR2", nume: "Eq2" });
  await db.doc("clienti/client").set(client);
  await db
    .doc("lucrari/work")
    .update({
      tipLucrare: "Revizie",
      equipmentIds: ["eq", "eq2"],
      revision: { equipmentStatus: { eq: "pending", eq2: "pending" } },
    });
  await svc.command(uid, start);
  const stopped = await svc.command(uid, stop());
  const next: Command = {
    ...start,
    mutationId: "second-equipment",
    predecessorId: stop().mutationId,
    occurredAt: new Date(Date.parse(stop().occurredAt) + 1000).toISOString(),
    payload: { equipmentId: "eq2", code: "QR2", qrRaw: "QR2" },
    offlineWork: { ...start.offlineWork!, sessionId: "second-equipment" },
  };
  await svc.command(uid, next);
  const end = { ...stop(next), payload: { equipmentId: "eq2" } };
  await svc.command(uid, end);
  const work = (await db.doc("lucrari/work").get()).data()!;
  assert.equal(work.timpPlecare, end.occurredAt);
  assert.equal(work.durataInterventie, "0h 1m");
  assert.equal(
    (await db.doc(`mobileOfflineWork/${uid}`).get()).data()?.activeSessionId,
    null,
  );
});

test("installation start survives a response lost between transaction and outer receipt", async () => {
  const made = await installs.create({uid:"admin",role:"admin"},{clientId:"client",locationId:"loc",client:"Test",locatie:"Loc",equipmentIds:["eq"],tehnicieni:["Tech"],nrLucrare:"#3",dataInterventie:"30.10.2026 10:00"},"lost-installation-123");
  const ref=db.doc(`lucrari/${made.id}`); await ref.update({technicianIds:[uid]});
  const g=await issueDraftGrant(db,uid,"attendance-test",[made.id]);
  const c:Command={...start,entityId:made.id,baseVersion:versionOf((await ref.get()).data()!),occurredAt:new Date(g.confirmedAt+1).toISOString(),action:"installation",payload:{action:"start",equipmentId:"eq",qrRaw:"QR1"},offlineWork:{...start.offlineWork!,grantId:g.grantId!}};
  const first=await svc.command(uid,c);
  await db.doc(`mobileCommands/${uid}_${c.mutationId}`).delete();
  const retried=await svc.command(uid,c);
  assert.equal(retried.sheet.id,first.sheet.id); assert.equal(retried.version,first.version);
  assert.equal((await ref.collection("installationSheets").get()).size,1);
});
