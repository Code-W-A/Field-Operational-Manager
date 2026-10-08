import test, { beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { installationService } from "./service";
import { verifyQr, workDate } from "./validation";
import { validateWorkEquipmentForCreation } from "@/lib/utils/work-equipment-validation";

const projectId = "demo-fom-installation";
assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
const app = initializeApp({ projectId }, "installation-tests");
const db = getFirestore(app);
const service = installationService(db);
const manager = { uid: "dispatcher", role: "dispecer" };
const tech = { uid: "tech1", role: "tehnician" };
const tech2 = { uid: "tech2", role: "tehnician" };
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=";
const signed = {
  beneficiaryName: "Beneficiar test",
  technicianSignature: png,
  beneficiarySignature: png,
};
const content = {
  finding: "Locație pregătită",
  operations: "Montaj echipament",
  installationStatus: "in_progress",
  blockReason: "",
  internalNote: "NOTA PRIVATA",
};
const workInput = {
  client: "Client test",
  clientId: "client1",
  locationId: "location1",
  locatie: "Locație test",
  contactId: "contact1",
  persoanaContact: "Beneficiar test",
  telefon: "0700000000",
  persoanaContactEmail: "test@example.invalid",
  equipmentIds: ["e1", "e2"],
  tehnicieni: ["Tehnician unu", "Tehnician doi"],
  nrLucrare: "#000100",
  dataEmiterii: "03.10.2026 10:00",
  dataInterventie: "03.10.2026 10:00",
};
async function create() {
  return service.create(manager, workInput, randomUUID());
}
async function start(
  workId: string,
  equipmentId = "e1",
  actor = tech,
  requestId = randomUUID(),
) {
  return service.start(actor, workId, {
    equipmentId,
    qrRaw: equipmentId === "e1" ? "QR1" : "QR2",
    requestId,
  });
}
async function close(workId: string, sheet: any, status = "in_progress") {
  return service.save(
    { uid: sheet.principalUid, role: "tehnician" },
    workId,
    {
      sheetId: sheet.id,
      revision: sheet.revision,
      fields: { ...content, installationStatus: status },
      signatures: signed,
    },
    true,
  );
}

before(async()=>{
 const {readFile}=await import("node:fs/promises");
 const rules=await readFile(new URL("../../firestore.rules",import.meta.url),"utf8");
 const response=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}:securityRules`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({rules:{files:[{name:"firestore.rules",content:rules}]}})});assert.ok(response.ok,"Installation tests require their canonical emulator rules");
});
beforeEach(async () => {
  const response = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.ok(response.ok);
  await db
    .collection("users")
    .doc("dispatcher")
    .set({ role: "dispecer", displayName: "Dispecer test" });
  await db
    .collection("users")
    .doc("tech1")
    .set({ role: "tehnician", displayName: "Tehnician unu" });
  await db
    .collection("users")
    .doc("tech2")
    .set({ role: "tehnician", displayName: "Tehnician doi" });
  await db
    .collection("clienti")
    .doc("client1")
    .set({
      nume: "Client test",
      cui: "RO1",
      adresa: "Adresă test",
      locatii: [
        {
          id: "location1",
          nume: "Locație test",
          adresa: "Adresă locație",
          persoaneContact: [
            {
              id: "contact1",
              nume: "Beneficiar test",
              telefon: "0700000000",
              email: "test@example.invalid",
            },
          ],
          echipamente: [
            { id: "e1", nume: "Server", cod: "QR1" },
            { id: "e2", nume: "Cameră", cod: "QR2" },
            { id: "e3", nume: "Senzor", cod: "QR3" },
          ],
        },
      ],
    });
});
after(async () => {
  await db.terminate();
  await deleteApp(app);
});

test("creation is idempotent, rejects outside-location equipment and ignores forged metadata", async () => {
  const requestId = randomUUID();
  const a = await service.create(
    manager,
    {
      ...workInput,
      installation: { closedReason: "completed" },
      statusLucrare: "Finalizat",
    },
    requestId,
  );
  const b = await service.create(manager, workInput, requestId);
  assert.equal(a.id, b.id);
  assert.equal(
    (await db.collection("lucrari").doc(a.id).get()).data()?.statusLucrare,
    "Atribuită",
  );
  await assert.rejects(
    service.create(
      manager,
      { ...workInput, equipmentIds: ["wrong"] },
      randomUUID(),
    ),
    /nu aparține/,
  );
  await assert.rejects(
    service.create(tech, workInput, randomUUID()),
    /Doar dispecerul/,
  );
});
test("QR verifies code, equipment ID, location and Bucharest work date", () => {
  const eq = { id: "e1", name: "Server", code: "QR1", model: "" };
  verifyQr("QR1", eq, "Client test", "Locație test");
  assert.throws(
    () => verifyQr("QR2", eq, "Client test", "Locație test"),
    /nu corespunde/,
  );
  assert.throws(
    () =>
      verifyQr(
        JSON.stringify({ code: "QR1", id: "e2" }),
        eq,
        "Client test",
        "Locație test",
      ),
    /ID-ul/,
  );
  assert.throws(
    () =>
      verifyQr(
        JSON.stringify({ code: "QR1", location: "altă locație" }),
        eq,
        "Client test",
        "Locație test",
      ),
    /Locația/,
  );
  assert.equal(workDate(new Date("2026-10-03T22:10:00Z")), "2026-10-04");
});
test("concurrent starts produce one active sheet and repeated request resumes it", async () => {
  const work = await create();
  const requestId = randomUUID();
  const results = await Promise.all([
    start(work.id, "e1", tech, requestId),
    start(work.id, "e1", tech, requestId),
  ]);
  assert.equal(results[0].sheet.id, results[1].sheet.id);
  const resumed = await start(work.id);
  assert.equal(resumed.sheet.id, results[0].sheet.id);
  assert.equal(
    (
      await db
        .collection("lucrari")
        .doc(work.id)
        .collection("installationSheets")
        .get()
    ).size,
    1,
  );
});
test("global principal lock and equipment lock hold under competing requests", async () => {
  const work = await create();
  const results = await Promise.allSettled([
    start(work.id, "e1"),
    start(work.id, "e2"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const active = (
    await db.collection("installationTechnicianSessions").doc("tech1").get()
  ).data()!;
  const other = await create();
  await assert.rejects(start(other.id), /fișă activă/);
  const secondary = await start(work.id, active.equipmentId, tech2);
  assert.equal(secondary.sheet.id, active.sheetId);
  assert.equal(
    (
      await db.collection("installationTechnicianSessions").doc("tech2").get()
    ).data()?.role,
    "secondary",
  );
});
test("only assigned unique technician may start; only principal may save; stale drafts cannot overwrite", async () => {
  const work = await create();
  await db
    .collection("users")
    .doc("outsider")
    .set({ role: "tehnician", displayName: "Străin" });
  await assert.rejects(
    start(work.id, "e1", { uid: "outsider", role: "tehnician" }),
    /atribuit/,
  );
  const { sheet } = await start(work.id);
  await assert.rejects(
    service.save(tech2, work.id, {
      sheetId: sheet.id,
      revision: 0,
      fields: content,
    }),
    /principalul/,
  );
  await service.save(tech, work.id, {
    sheetId: sheet.id,
    revision: 0,
    fields: content,
  });
  await assert.rejects(
    service.save(tech, work.id, {
      sheetId: sheet.id,
      revision: 0,
      fields: content,
    }),
    /altă fereastră/,
  );
});
test("daily close requires both signatures and blocked reason; new sheet starts empty", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  await assert.rejects(
    service.save(
      tech,
      work.id,
      { sheetId: sheet.id, revision: 0, fields: content, signatures: {} },
      true,
    ),
    /beneficiarului/,
  );
  await assert.rejects(close(work.id, sheet, "blocked"), /motivul blocajului/);
  const closed = await close(work.id, sheet);
  assert.equal(closed.sheet.state, "closed");
  assert.equal(
    (await db.collection("installationTechnicianSessions").doc("tech1").get())
      .exists,
    false,
  );
  assert.equal(
    (await db.collection("lucrari").doc(work.id).get()).data()?.installation
      .equipmentStatus.e1,
    "in_progress",
  );
  const next = await start(work.id);
  assert.notEqual(next.sheet.id, sheet.id);
  assert.equal(next.sheet.finding, "");
  assert.deepEqual(next.sheet.photos, []);
  assert.equal(next.sheet.documentSnapshot, undefined);
});
test("closed sheet remains immutable and snapshot excludes private fields", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  const closed = await close(work.id, sheet, "completed");
  assert.ok(
    !JSON.stringify(closed.sheet.documentSnapshot).includes("NOTA PRIVATA"),
  );
  await assert.rejects(
    service.save(tech, work.id, {
      sheetId: sheet.id,
      fields: content,
      revision: 1,
    }),
    /semnată/,
  );
  await assert.rejects(start(work.id), /deja finalizat/);
  const duplicate = await close(work.id, sheet, "completed");
  assert.equal(duplicate.sheet.id, sheet.id);
  const client = (await db.collection("clienti").doc("client1").get()).data()!;
  await db
    .collection("clienti")
    .doc("client1")
    .update({ nume: "Client redenumit" });
  const result = await service.list(manager, work.id, undefined, sheet.id);
  assert.equal(result.sheets[0].documentSnapshot!.client.client, client.nume);
});
test("photo cap is cumulative and enforced transactionally; closed photos cannot change", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  for (let i = 0; i < 4; i++)
    await service.attachPhoto(tech, work.id, sheet.id, {
      id: `p${i}`,
      path: `installations/${work.id}/${sheet.id}/p${i}`,
      name: "test.jpg",
      contentType: "image/jpeg",
    });
  await assert.rejects(
    service.attachPhoto(tech, work.id, sheet.id, { id: "p5" }),
    /maximum 4/,
  );
  const current = (await service.list(tech, work.id, undefined, sheet.id))
    .sheets[0];
  await close(work.id, current);
  await assert.rejects(
    service.attachPhoto(tech, work.id, sheet.id, { id: "p0" }, true),
    /semnată/,
  );
});
test("adding equipment preserves progress, prevents removal and locks location after start", async () => {
  const work = await create();
  await start(work.id);
  const edited = await service.edit(manager, work.id, {
    equipmentIds: ["e1", "e2", "e3"],
  });
  assert.equal(edited.installation.equipmentStatus.e1, "in_progress");
  assert.equal(edited.installation.equipmentStatus.e3, "pending");
  await assert.rejects(
    service.edit(manager, work.id, { equipmentIds: ["e2"] }),
    /ne peuvent|nu pot fi eliminate/,
  );
  await assert.rejects(
    service.edit(manager, work.id, { locationId: "other" }),
    /blocate/,
  );
});
test("continuation works with zero finished equipment, no assignments and is idempotent", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  await assert.rejects(service.continueWork(manager, work.id), /fișele active/);
  await close(work.id, sheet);
  await assert.rejects(service.continueWork(tech, work.id), /dispecerul/);
  const results = await Promise.all([
    service.continueWork(manager, work.id),
    service.continueWork(manager, work.id),
  ]);
  assert.equal(results[0].workId, results[1].workId);
  const next = (
    await db.collection("lucrari").doc(results[0].workId).get()
  ).data()!;
  assert.equal(next.tipLucrare, "Instalare");
  assert.equal(next.statusLucrare, "Listată");
  assert.deepEqual(next.tehnicieni, []);
  assert.deepEqual(next.equipmentIds, ["e1", "e2"]);
  assert.equal(next.installation.rootWorkId, work.id);
  assert.deepEqual(next.installation.inheritedStartedEquipmentIds, ["e1"]);
  await assert.rejects(
    service.edit(manager, results[0].workId, { equipmentIds: ["e2"] }),
    /nu pot fi eliminate/,
  );
  await assert.rejects(
    service.edit(manager, results[0].workId, { clientId: "other-client" }),
    /blocate/,
  );
});
test("complete end-to-end across continuation retains all sheets and separate final signatures", async () => {
  const root = await create();
  const first = await start(root.id);
  await close(root.id, first.sheet, "completed");
  await assert.rejects(
    service.complete(tech, root.id, { signatures: signed }),
    /Toate echipamentele/,
  );
  const continuation = await service.continueWork(manager, root.id);
  await service.edit(manager, continuation.workId, {
    tehnicieni: ["Tehnician unu", "Tehnician doi"],
  });
  const second = await start(continuation.workId, "e2");
  await close(continuation.workId, second.sheet, "completed");
  const done = await service.complete(tech, continuation.workId, {
    signatures: signed,
    observations: "Predat beneficiarului",
  });
  assert.equal(done.document?.documentSnapshot.equipment.length, 2);
  assert.equal(done.document?.documentSnapshot.sheetReferences.length, 2);
  assert.equal(
    (await db.collection("lucrari").doc(continuation.workId).get()).data()
      ?.statusLucrare,
    "Finalizat",
  );
  const again = await service.complete(tech, continuation.workId, {
    signatures: signed,
  });
  assert.deepEqual(
    again.document?.documentSnapshot,
    done.document?.documentSnapshot,
  );
});
test("secondary viewers cannot read internal note; paginated history keeps independent sheets", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  await close(work.id, sheet);
  const other = await service.list(tech2, work.id);
  assert.equal(other.sheets[0]!.internalNote, undefined);
  const principal = await service.list(tech, work.id);
  assert.equal(principal.sheets[0]!.internalNote, "NOTA PRIVATA");
  assert.equal(
    (await service.list(manager, work.id)).sheets[0]!.internalNote,
    "NOTA PRIVATA",
  );
  for (let i = 0; i < 27; i++) {
    const next = await start(work.id);
    await close(work.id, next.sheet);
  }
  const page = await service.list(manager, work.id);
  assert.equal(page.sheets.length, 25);
  assert.ok(page.nextCursor);
  const tail = await service.list(manager, work.id, page.nextCursor!);
  assert.equal(tail.sheets.length, 3);
  assert.equal(
    new Set([...page.sheets, ...tail.sheets].map((s) => s.id)).size,
    28,
  );
});
test("installation multiple equipment validation preserves revision and legacy single equipment", () => {
  assert.equal(
    validateWorkEquipmentForCreation({
      tipLucrare: "Instalare",
      equipmentIds: [],
    }).valid,
    false,
  );
  assert.equal(
    validateWorkEquipmentForCreation({
      tipLucrare: "Instalare",
      equipmentIds: ["e1"],
    }).valid,
    true,
  );
  assert.equal(
    validateWorkEquipmentForCreation({
      tipLucrare: "Instalare",
      echipamentId: "legacy",
    }).valid,
    true,
  );
  assert.equal(
    validateWorkEquipmentForCreation({
      tipLucrare: "Revizie",
      equipmentIds: [],
    }).valid,
    false,
  );
  assert.equal(
    validateWorkEquipmentForCreation({
      tipLucrare: "Revizie",
      equipmentIds: ["e1"],
    }).valid,
    true,
  );
});
test("rules deny direct writes/reads to installation sheets and protected parent metadata; legacy remains writable", async () => {
  const work = await create();
  const root = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents`;
  const patch = async (path: string, fields: any) =>
    fetch(`${root}/${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
  for(const collection of ["mobileCommands","mobileFiles","mobileEffects","installationCommands"]){assert.equal((await patch(`${collection}/forged`,{uid:{stringValue:"tech1"}})).status,403);assert.equal((await fetch(`${root}/${collection}/forged`)).status,403);}
  assert.equal(
    (
      await patch(`lucrari/${work.id}/installationSheets/forged`, {
        state: { stringValue: "closed" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await patch(`installationTechnicianSessions/tech1`, {
        sheetId: { stringValue: "forged" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${root}/lucrari/${work.id}`, { method: "DELETE" })).status,
    403,
  );
  const statusPatch = await fetch(
    `${root}/lucrari/${work.id}?updateMask.fieldPaths=statusLucrare`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: { statusLucrare: { stringValue: "Finalizat" } },
      }),
    },
  );
  assert.equal(statusPatch.status, 403);
  const { sheet } = await start(work.id);
  assert.equal(
    (await fetch(`${root}/lucrari/${work.id}/installationSheets/${sheet.id}`))
      .status,
    403,
  );
  assert.equal(
    (await patch("lucrari/legacy", { tipLucrare: { stringValue: "Revizie" } }))
      .status,
    200,
  );
  assert.equal(
    (
      await patch("lucrari/legacy/revisions/e1", {
        state: { stringValue: "done" },
      })
    ).status,
    200,
  );
});

test("automatic allocation excludes occupied, missing and ambiguous technicians and never leaks private notes on join", async () => {
  await db
    .collection("users")
    .doc("busy")
    .set({ role: "tehnician", displayName: "Ocupat" });
  const busyWork = await service.create(
    manager,
    { ...workInput, tehnicieni: ["Ocupat"] },
    randomUUID(),
  );
  await start(busyWork.id, "e1", { uid: "busy", role: "tehnician" });
  for (const uid of ["ambiguous1", "ambiguous2"])
    await db
      .collection("users")
      .doc(uid)
      .set({ role: "tehnician", displayName: "Ambiguu" });
  const work = await service.create(
    manager,
    {
      ...workInput,
      tehnicieni: [...workInput.tehnicieni, "Ocupat", "Lipsă", "Ambiguu"],
    },
    randomUUID(),
  );
  const { sheet } = await start(work.id);
  assert.deepEqual(sheet.participantUids, ["tech1", "tech2"]);
  assert.equal(sheet.allocationWarnings!.length, 3);
  await service.save(tech, work.id, {
    sheetId: sheet.id,
    revision: 0,
    fields: content,
  });
  const resumed = await start(work.id, "e1", tech2);
  assert.equal(resumed.sheet.internalNote, undefined);
  assert.equal(
    (
      await db.collection("installationTechnicianSessions").doc("busy").get()
    ).data()?.workId,
    busyWork.id,
  );
});
test("secondary moves alone, and stopping the source never releases a moved technician", async () => {
  const root = await create();
  const first = await start(root.id);
  const requestId = randomUUID();
  const moved = await start(root.id, "e2", tech2, requestId);
  assert.equal(moved.sheet.principalUid, "tech2");
  assert.deepEqual(moved.sheet.participantUids, ["tech2"]);
  assert.equal(
    (
      await service.list(tech, root.id, undefined, first.sheet.id)
    ).sheets[0]!.participants!.find((p) => p.uid === "tech2")!.moved,
    true,
  );
  const replay = await start(root.id, "e2", tech2, requestId);
  assert.equal(replay.sheet.id, moved.sheet.id);
  await service.stop(tech, root.id, {
    sheetId: first.sheet.id,
    revision: 0,
    fields: content,
  });
  assert.equal(
    (await db.collection("installationTechnicianSessions").doc("tech1").get())
      .exists,
    false,
  );
  assert.equal(
    (
      await db.collection("installationTechnicianSessions").doc("tech2").get()
    ).data()?.sheetId,
    moved.sheet.id,
  );
});
test("a secondary can transfer across assigned tickets, join an existing sheet and return without duplication", async () => {
  const firstWork = await create();
  const first = await start(firstWork.id);
  await db
    .collection("users")
    .doc("tech3")
    .set({ role: "tehnician", displayName: "Tehnician trei" });
  const secondWork = await service.create(
    manager,
    { ...workInput, tehnicieni: ["Tehnician trei", "Tehnician doi"] },
    randomUUID(),
  );
  const second = await start(secondWork.id, "e1", {
    uid: "tech3",
    role: "tehnician",
  });
  const joined = await start(secondWork.id, "e1", tech2);
  assert.equal(joined.sheet.id, second.sheet.id);
  assert.equal(joined.sheet.principalUid, "tech3");
  assert.equal(
    (
      await db.collection("installationTechnicianSessions").doc("tech2").get()
    ).data()?.role,
    "secondary",
  );
  const returned = await start(firstWork.id, "e1", tech2);
  assert.equal(returned.sheet.id, first.sheet.id);
  assert.equal(
    returned.sheet.participants!.filter((p) => p.uid === "tech2").length,
    1,
  );
  assert.equal(
    returned.sheet.participants!.find((p) => p.uid === "tech2")!.moved,
    false,
  );
});
test("a free scanner joins the existing principal and automatically allocates other available colleagues", async () => {
  const work = await service.create(
    manager,
    { ...workInput, tehnicieni: ["Tehnician unu"] },
    randomUUID(),
  );
  const first = await start(work.id);
  await db
    .collection("users")
    .doc("tech3")
    .set({ role: "tehnician", displayName: "Tehnician trei" });
  await service.edit(manager, work.id, {
    tehnicieni: ["Tehnician unu", "Tehnician doi", "Tehnician trei"],
  });
  const joined = await start(work.id, "e1", tech2);
  assert.equal(joined.sheet.id, first.sheet.id);
  assert.equal(joined.sheet.principalUid, "tech1");
  assert.deepEqual(
    new Set(joined.sheet.participantUids),
    new Set(["tech1", "tech2", "tech3"]),
  );
  assert.equal(
    (
      await db.collection("installationTechnicianSessions").doc("tech3").get()
    ).data()?.role,
    "secondary",
  );
});
test("concurrent team starts and repeated scans preserve one session per technician", async () => {
  const work = await create();
  const results = await Promise.all([
    start(work.id, "e1", tech),
    start(work.id, "e1", tech2),
  ]);
  assert.equal(results[0].sheet.id, results[1].sheet.id);
  const saved = (await service.list(manager, work.id)).sheets[0]!;
  assert.equal(saved.participants!.length, 2);
  assert.equal(
    (await db.collection("installationTechnicianSessions").get()).size,
    2,
  );
  assert.equal(
    (
      await db
        .collection("lucrari")
        .doc(work.id)
        .collection("installationSheets")
        .get()
    ).size,
    1,
  );
});
test("stop freezes content and photos, releases the team and blocks equipment, continuation and final handover", async () => {
  const work = await create();
  const first = await start(work.id);
  await assert.rejects(
    service.stop(tech2, work.id, {
      sheetId: first.sheet.id,
      revision: 0,
      fields: content,
    }),
    /principalul/,
  );
  await assert.rejects(
    service.stop(tech, work.id, {
      sheetId: first.sheet.id,
      revision: 0,
      fields: { ...content, operations: "" },
    }),
    /operațiunile/i,
  );
  const pending = await service.stop(tech, work.id, {
    sheetId: first.sheet.id,
    revision: 0,
    fields: { ...content, installationStatus: "completed" },
  });
  assert.equal(pending.sheet.state, "awaiting_signature");
  assert.equal(pending.sheet.documentSnapshot, undefined);
  assert.ok(
    !JSON.stringify(pending.sheet.frozenDocument).includes("NOTA PRIVATA"),
  );
  assert.equal(
    (await db.collection("installationTechnicianSessions").get()).size,
    0,
  );
  await assert.rejects(
    service.save(tech, work.id, {
      sheetId: first.sheet.id,
      revision: 1,
      fields: content,
    }),
    /semnată/,
  );
  await assert.rejects(
    service.attachPhoto(tech, work.id, first.sheet.id, { id: "forged" }),
    /semnată/,
  );
  await assert.rejects(start(work.id), /Echipa este liberă/);
  await assert.rejects(
    service.continueWork(manager, work.id),
    /Echipa este liberă/,
  );
  await assert.rejects(
    service.complete(tech, work.id, { signatures: signed }),
    /Echipa este liberă/,
  );
  const repeated = await service.stop(tech, work.id, {
    sheetId: first.sheet.id,
    revision: 0,
    fields: content,
  });
  assert.equal(repeated.sheet.revision, 1);
  const other = await start(work.id, "e2");
  assert.equal(other.sheet.state, "draft");
});
test("a historical moved participant signs in own name after assignment removal; new work stays active and snapshot stays frozen", async () => {
  const work = await create();
  const first = await start(work.id);
  const moved = await start(work.id, "e2", tech2);
  await service.stop(tech, work.id, {
    sheetId: first.sheet.id,
    revision: 0,
    fields: { ...content, installationStatus: "completed" },
  });
  await close(work.id, moved.sheet);
  await service.edit(manager, work.id, { tehnicieni: ["Tehnician unu"] });
  await db
    .collection("clienti")
    .doc("client1")
    .update({ nume: "Nume schimbat după oprire" });
  const historical = await service.list(
    tech2,
    work.id,
    undefined,
    first.sheet.id,
  );
  assert.equal(historical.sheets[0]!.canSign, true);
  assert.equal(historical.sheets[0]!.internalNote, undefined);
  await db
    .collection("users")
    .doc("tech2")
    .update({ displayName: "Tehnician redenumit" });
  const requestId = randomUUID();
  const result = await service.sign(tech2, work.id, {
    sheetId: first.sheet.id,
    revision: 1,
    requestId,
    signatures: signed,
    fields: { finding: "FORGED" },
  });
  assert.equal(
    result.sheet.documentSnapshot!.technicianName,
    "Tehnician redenumit",
  );
  assert.equal(result.sheet.documentSnapshot!.principalName, "Tehnician unu");
  assert.equal(result.sheet.documentSnapshot!.client.client, "Client test");
  assert.equal(result.sheet.documentSnapshot!.finding, content.finding);
  assert.equal(result.sheet.documentSnapshot!.signedByUid, "tech2");
  assert.equal(
    (await db.collection("lucrari").doc(work.id).get()).data()!.installation
      .equipmentStatus.e1,
    "done",
  );
  const retry = await service.sign(tech2, work.id, {
    sheetId: first.sheet.id,
    revision: 1,
    requestId,
    signatures: signed,
  });
  assert.equal(retry.sheet.revision, result.sheet.revision);
  await assert.rejects(
    service.sign(tech, work.id, {
      sheetId: first.sheet.id,
      revision: 1,
      requestId: randomUUID(),
      signatures: signed,
    }),
    /nu mai așteaptă/,
  );
});
test("signing does not release the signer's current session and rejects managers, outsiders and incomplete signatures", async () => {
  const work = await create();
  const first = await start(work.id);
  await service.stop(tech, work.id, {
    sheetId: first.sheet.id,
    revision: 0,
    fields: content,
  });
  const current = await start(work.id, "e2", tech2);
  await db
    .collection("users")
    .doc("outsider")
    .set({ role: "tehnician", displayName: "Străin" });
  const input = {
    sheetId: first.sheet.id,
    revision: 1,
    requestId: randomUUID(),
    signatures: signed,
  };
  await assert.rejects(service.sign(manager, work.id, input), /participant/);
  await assert.rejects(
    service.sign({ uid: "outsider", role: "tehnician" }, work.id, input),
    /participant/,
  );
  await assert.rejects(
    service.sign(tech2, work.id, { ...input, signatures: {} }),
    /beneficiarului/,
  );
  await service.sign(tech2, work.id, input);
  assert.equal(
    (
      await db.collection("installationTechnicianSessions").doc("tech2").get()
    ).data()?.sheetId,
    current.sheet.id,
  );
});
test("two participants signing concurrently produce one immutable signed document", async () => {
  const work = await create();
  const first = await start(work.id);
  await service.stop(tech, work.id, {
    sheetId: first.sheet.id,
    revision: 0,
    fields: content,
  });
  const results = await Promise.allSettled(
    [tech, tech2].map((actor) =>
      service.sign(actor, work.id, {
        sheetId: first.sheet.id,
        revision: 1,
        requestId: randomUUID(),
        signatures: signed,
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const saved = (await service.list(manager, work.id)).sheets[0]!;
  assert.equal(saved.state, "closed");
  assert.equal(saved.revision, 2);
});
test("legacy 1A drafts keep the original principal and can stop/sign without inventing secondaries", async () => {
  const work = await service.create(
    manager,
    { ...workInput, tehnicieni: ["Tehnician unu"] },
    randomUUID(),
  );
  const first = await start(work.id);
  await db
    .collection("lucrari")
    .doc(work.id)
    .collection("installationSheets")
    .doc(first.sheet.id)
    .update({
      participants: (
        await import("firebase-admin/firestore")
      ).FieldValue.delete(),
      participantUids: (
        await import("firebase-admin/firestore")
      ).FieldValue.delete(),
    });
  await db
    .collection("installationTechnicianSessions")
    .doc("tech1")
    .update({
      role: (await import("firebase-admin/firestore")).FieldValue.delete(),
    });
  const legacy = await service.list(tech, work.id, undefined, first.sheet.id);
  assert.deepEqual(
    legacy.sheets[0]!.participants!.map((p) => p.uid),
    ["tech1"],
  );
  await service.stop(tech, work.id, {
    sheetId: first.sheet.id,
    revision: 0,
    fields: content,
  });
  const signedSheet = await service.sign(tech, work.id, {
    sheetId: first.sheet.id,
    revision: 1,
    requestId: randomUUID(),
    signatures: signed,
  });
  assert.equal(signedSheet.sheet.state, "closed");
});

test('save with requestId replays the original result after lost response without another sheet revision',async()=>{
 const w=await create(),started=await start(w.id),requestId=randomUUID();
 const input={requestId,sheetId:started.sheet.id,revision:started.sheet.revision,fields:content};
 const first=await service.save(tech,w.id,input),replay=await service.save(tech,w.id,input);
 assert.deepEqual(replay,first);
 const stored=(await db.doc(`lucrari/${w.id}/installationSheets/${started.sheet.id}`).get()).data()!;assert.equal(stored.revision,first.sheet.revision);
 await assert.rejects(()=>service.save(tech,w.id,{...input,fields:{...content,operations:'Altă comandă'}}),/reutilizat/);
});
