import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { mobileService } from "../../lib/mobile/service";
import {
  versionOf,
  checklistFromSettings,
  validateRevision,
} from "../../packages/fom-domain";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw new Error("Local Firestore Emulator is required.");
const app = initializeApp(
  { projectId: "demo-fom-mobile-auth" },
  "mobile-service-tests",
);
const db = getFirestore(app),
  svc = mobileService(db),
  uid = "mobile-test-tech";
let sequence = Date.now();
const now = () => new Date().toISOString();
const command = (
  action: any,
  entityId: string,
  payload: any = {},
  baseVersion: string | null = null,
  extra: any = {},
) => ({
  mutationId: `mobile_test_${++sequence}`,
  action,
  entityId,
  payload,
  occurredAt: now(),
  baseVersion,
  ...extra,
});
async function work(id: string, extra: any = {}) {
  await db.doc(`lucrari/${id}`).set({
    clientId: "mobile-test-client",
    client: "Client test",
    locationId: "loc1",
    locatie: "Sediu test",
    equipmentId: "eq1",
    echipamentCod: "EQ1",
    echipament: "Unitate test",
    tipLucrare: "Intervenție",
    statusLucrare: "Atribuită",
    tehnicieni: ["Mobile Test Technician"],
    updatedAt: Timestamp.now(),
    ...extra,
  });
  return versionOf((await db.doc(`lucrari/${id}`).get()).data()!)!;
}
before(async () => {
  await db.doc("hrEmployees/mobile-test-employee").delete();
  const oldRequests = await db
    .collection("hrRequests")
    .where("employeeId", "==", "mobile-test-employee")
    .get();
  for (const d of oldRequests.docs) await d.ref.delete();
  const previous = await db
    .collection("lucrari")
    .where("tehnicieni", "array-contains", "Mobile Test Technician")
    .get();
  for (const d of previous.docs) await d.ref.delete();
  await db.doc(`attendanceActiveSessions/${uid}`).delete();
  await db
    .doc(`users/${uid}`)
    .set({ uid, displayName: "Mobile Test Technician", role: "tehnician" });
  await db.doc("clienti/mobile-test-client").set({
    nume: "Client test",
    locatii: [
      {
        id: "loc1",
        nume: "Sediu test",
        adresa: "Adresă test",
        echipamente: [
          {
            id: "eq1",
            cod: "EQ1",
            denumire: "Unitate test",
            dynamicSettings: {
              "revision.checklistParentId": "mobile-test-root",
            },
          },
        ],
      },
    ],
  });
  await db.doc("settings/mobile-test-root").set({
    name: "Verificări",
    assignedTargets: ["revisions.checklist.sections"],
    type: "category",
  });
  await db.doc("settings/mobile-test-point").set({
    name: "Alimentare",
    type: "variable",
    parentId: "mobile-test-root",
  });
});
after(() => deleteApp(app));
test("same timestamp millisecond with different nanos has different versions", () => {
  assert.notEqual(
    versionOf({ updatedAt: new Timestamp(1, 100000) }),
    versionOf({ updatedAt: new Timestamp(1, 200000) }),
  );
});
test("configured checklist and exact item validation", () => {
  const s = checklistFromSettings([
    {
      id: "root",
      type: "category",
      name: "Test",
      assignedTargets: ["revisions.checklist.sections"],
    },
    { id: "point", parentId: "root", type: "variable", name: "Control" },
  ]);
  assert.equal(s[0].items[0].id, "point");
  assert.throws(() => validateRevision([{ ...s[0], items: [] }], s));
});
test("unauthorized actor rejected", async () => {
  await db.doc("users/mobile-test-admin").set({ role: "admin" });
  await assert.rejects(() => svc.bundle("mobile-test-admin"), /exclusiv/);
});
test("bootstrap resolves live equipment and filters assigned works", async () => {
  await work("mobile-test-visible");
  await work("mobile-test-hidden", { tehnicieni: ["Other technician"] });
  const b = await svc.bundle(uid);
  assert(b.works.some((w) => w.id === "mobile-test-visible"));
  assert(!b.works.some((w) => w.id === "mobile-test-hidden"));
  assert.equal(
    b.works.find((w) => w.id === "mobile-test-visible")!.mobileEquipment![0]
      .rootId,
    "mobile-test-root",
  );
});
test("ambiguous HR association preserves tickets and blocks attendance without choosing an employee", async () => {
  const refs = ["mobile-test-ambiguous-hr-a", "mobile-test-ambiguous-hr-b"].map(id => db.doc(`hrEmployees/${id}`));
  try {
    for (const ref of refs) await ref.set({ userUid: uid });
    await work("mobile-test-hr-visible");
    const b = await svc.bundle(uid);
    assert(b.works.some(w => w.id === "mobile-test-hr-visible"));
    assert.equal(b.employee, null);
    assert.match(b.employeeAssociationError!, /mai multor salariați/);
    await assert.rejects(() => svc.command(uid, command("attendance.start", "mobile-test-ambiguous-attendance", { specialDayConfirmed: true })), /Asociere HR ambiguă/);
    assert.equal((await db.doc("attendance/mobile-test-ambiguous-attendance").get()).exists, false);
  } finally {
    for (const ref of refs) await ref.delete();
  }
});
let attendanceId = `mobile-test-attendance-${Date.now()}`;
test("attendance start idempotent and only one active session", async () => {
  const c = command("attendance.start", attendanceId, {}, null, {
    occurredAt: new Date(Date.now() - 120000).toISOString(),
  });
  const a = await svc.command(uid, c),
    b = await svc.command(uid, c);
  assert.equal(a.id, b.id);
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command("attendance.start", "mobile-test-other-session"),
      ),
    /deja/,
  );
});
test("intervention needs QR and attendance, then persists canonical fields once", async () => {
  const v = await work("mobile-test-work");
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command(
          "intervention.save",
          "mobile-test-work",
          { constatareLaLocatie: "Test" },
          v,
          { attendanceId },
        ),
      ),
    /Verifică/,
  );
  const q = await svc.command(
    uid,
    command(
      "verify",
      "mobile-test-work",
      { code: "EQ1", equipmentId: "eq1" },
      v,
      { attendanceId },
    ),
  );
  const c = command(
    "intervention.save",
    "mobile-test-work",
    {
      constatareLaLocatie: "Constatare",
      descriereInterventie: "Operațiuni",
      notaInternaTehnician: "Secret",
      necesitaOferta: true,
      statusEchipament: "Funcțional",
    },
    q.version,
    { attendanceId },
  );
  const saved = await svc.command(uid, c);
  assert.equal(saved.work.descriereInterventie, "Operațiuni");
  assert.deepEqual(await svc.command(uid, c), saved);
  assert.equal(
    (await db.doc("lucrari/mobile-test-work").get()).data()!.notificationRead,
    false,
  );
});
test("concurrent changes reject and preserve external values", async () => {
  const s = (await db.doc("lucrari/mobile-test-work").get()).data()!,
    v = versionOf(s);
  await db
    .doc("lucrari/mobile-test-work")
    .update({ updatedAt: Timestamp.now(), descriereInterventie: "Web edit" });
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command(
          "intervention.save",
          "mobile-test-work",
          { descriereInterventie: "Stale mobile" },
          v,
          { attendanceId },
        ),
      ),
    /modificat/,
  );
  assert.equal(
    (await db.doc("lucrari/mobile-test-work").get()).data()!
      .descriereInterventie,
    "Web edit",
  );
});
test("later signing preserves official number and snapshot excludes internal note", async () => {
  let v = versionOf((await db.doc("lucrari/mobile-test-work").get()).data()!);
  const later = await svc.command(
    uid,
    command(
      "report.later",
      "mobile-test-work",
      { cauzaPrincipalaDefectId: "uzura", products: [] },
      v,
      { attendanceId },
    ),
  );
  assert.equal(later.work.statusLucrare, "Fără semnătură");
  const c = command(
    "report.finalize",
    "mobile-test-work",
    {
      cauzaPrincipalaDefectId: "uzura",
      products: [{ id: "p", name: "Piesă", um: "buc", quantity: 2, price: 10 }],
      numeBeneficiar: "Beneficiar",
    },
    later.version,
    { attendanceId },
  );
  const report = await svc.command(uid, c);
  assert.equal(report.work.raportGenerat, true);
  assert.equal(report.work.raportSnapshot.products[0].total, 20);
  assert(!("notaInternaTehnician" in report.work.raportSnapshot));
  assert.deepEqual(await svc.command(uid, c), report);
  assert.equal(
    (await db.doc("lucrari/mobile-test-work").get()).data()!.numarRaport,
    report.work.numarRaport,
  );
});
test("postpone validates reason then deassigns without rescheduling", async () => {
  const v = await work("mobile-test-postpone", {
    dataInterventie: "2026-10-07",
  });
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command(
          "postpone",
          "mobile-test-postpone",
          { motivAmanare: "scurt" },
          v,
        ),
      ),
    /minimum/,
  );
  await svc.command(
    uid,
    command(
      "postpone",
      "mobile-test-postpone",
      { motivAmanare: "Acces indisponibil la locație" },
      v,
    ),
  );
  const w = (await db.doc("lucrari/mobile-test-postpone").get()).data()!;
  assert.deepEqual(w.tehnicieni, []);
  assert.equal(w.dataInterventie, "2026-10-07");
});
test("revision persisted with states, timing and progress in canonical subcollection", async () => {
  const v = await work("mobile-test-revision", {
    tipLucrare: "Revizie",
    equipmentIds: ["eq1"],
    revision: {
      equipmentStatus: { eq1: "pending" },
      equipment: [
        {
          equipmentId: "eq1",
          equipmentCode: "EQ1",
          revisionChecklistTemplateId: "mobile-test-root",
        },
      ],
    },
  });
  const verified = await svc.command(
    uid,
    command(
      "verify",
      "mobile-test-revision",
      { equipmentId: "eq1", code: "EQ1" },
      v,
      { attendanceId },
    ),
  );
  const saved = await svc.command(
    uid,
    command(
      "revision.save",
      "mobile-test-revision",
      {
        equipmentId: "eq1",
        sections: [
          {
            id: "mobile-test-root__root",
            title: "Verificări",
            items: [
              {
                id: "mobile-test-point",
                label: "Alimentare",
                state: "na",
                obs: "Nu se aplică",
              },
            ],
          },
        ],
        finalObservations: "Verificare terminată",
        photos: [],
      },
      verified.version,
      { attendanceId },
    ),
  );
  const rev = (
    await db.doc("lucrari/mobile-test-revision/revisions/eq1").get()
  ).data()!;
  assert.equal(rev.sections[0].items[0].state, "na");
  assert.equal(
    (await db.doc("lucrari/mobile-test-revision").get()).data()!.revision
      .equipmentStatus.eq1,
    "done",
  );
  assert(rev.qrVerified);
});
test("reassignment and foreign photos rejected", async () => {
  let v = await work("mobile-test-foreign", { equipmentVerified: true });
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command(
          "intervention.save",
          "mobile-test-foreign",
          {
            imaginiDefecte: [
              {
                id: "evil-photo",
                path: "other-secret",
                url: "http://localhost/secret",
              },
            ],
          },
          v,
          { attendanceId },
        ),
      ),
    /neautorizată/,
  );
  await db.doc("lucrari/mobile-test-foreign").update({ tehnicieni: ["Other"] });
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command("intervention.save", "mobile-test-foreign", {}, v, {
          attendanceId,
        }),
      ),
    /atribuit/,
  );
});
test("offline ordered commands use predecessor version and closed attendance interval", async () => {
  const v = await work("mobile-test-offline");
  const at = new Date().toISOString(),
    verify = command(
      "verify",
      "mobile-test-offline",
      { code: "EQ1", equipmentId: "eq1" },
      v,
      { attendanceId, occurredAt: at },
    );
  await svc.command(uid, verify);
  const stop = command("attendance.stop", attendanceId);
  await svc.command(uid, stop);
  await svc.command(
    uid,
    command(
      "intervention.save",
      "mobile-test-offline",
      { descriereInterventie: "Offline saved" },
      v,
      { attendanceId, predecessorId: verify.mutationId, occurredAt: at },
    ),
  );
  assert.equal(
    (await db.doc("lucrari/mobile-test-offline").get()).data()!
      .descriereInterventie,
    "Offline saved",
  );
});

test("personal request preserves canonical HR identity and counter without duplicate creation", async () => {
  await db
    .doc("hrEmployees/mobile-test-employee")
    .set({
      userUid: uid,
      nume: "Mobile",
      prenume: "Test",
      sectorIds: ["mobile-test-sector"],
      managerUidBySector: { "mobile-test-sector": "mobile-test-manager" },
    });
  await db
    .doc("hrDepartments/mobile-test-sector")
    .set({ name: "Service test" });
  const c = command("request.create", "request_test", {
    kind: "CO",
    sectorId: "mobile-test-sector",
    payload: {
      kind: "CO",
      startDate: "2026-12-10",
      endDate: "2026-12-12",
      reason: "Test",
    },
  });
  const saved = await svc.command(uid, c);
  assert.equal(saved.request.status, "pending");
  assert.equal(saved.request.managerUid, "mobile-test-manager");
  assert.deepEqual(await svc.command(uid, c), saved);
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command("request.create", "request_overlap", {
          kind: "CO",
          sectorId: "mobile-test-sector",
          payload: {
            kind: "CO",
            startDate: "2026-12-11",
            endDate: "2026-12-13",
          },
        }),
      ),
    /deja/,
  );
  await assert.rejects(
    () =>
      svc.command(
        uid,
        command("request.create", "request_medical", {
          kind: "CM",
          sectorId: "mobile-test-sector",
          payload: {
            kind: "CM",
            startDate: "2026-12-15",
            endDate: "2026-12-16",
            medicalDocumentUrl: "https://example.com/arbitrary.pdf",
          },
        }),
      ),
    /neautorizat/,
  );
});
