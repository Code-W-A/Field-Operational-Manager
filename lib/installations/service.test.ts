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
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAKCAYAAACjd+4vAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAIElEQVR4nGMQsQj6PxCYYdRikVGLLUYtDhq1+D85FgMAZd7kDNae2IoAAAAASUVORK5CYII=";
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

async function commercialReady() {
  const work = await create();
  const ref = db.collection("lucrari").doc(work.id);
  await ref.update({ statusLucrare: "Finalizat", "installation.closedReason": "completed", "installation.completionDocumentId": "final" });
  await ref.collection("installationCompletion").doc("final").set({ documentSnapshot: { signed: true, equipment: ["e1", "e2"] } });
  return { work, ref };
}

test("archive revalidates installation, pickup and invoicing, preserves signed documents and is idempotent", async () => {
  const work = await create();
  await assert.rejects(service.archive(tech, work.id), /Doar dispecerul/);
  await assert.rejects(service.archive({ uid: tech.uid, role: "admin" }, work.id), /Acces neautorizat/);
  await assert.rejects(service.archive(manager, work.id), /Finalizează instalarea/);
  const { work: ready, ref } = await commercialReady();
  await assert.rejects(service.archive(manager, ready.id), /Preia tichetul/);
  await service.manage(manager, ready.id, { work: { preluatDispecer: true } });
  await assert.rejects(service.archive(manager, ready.id), /factura/);
  await service.manage(manager, ready.id, { work: { statusFacturare: "Nu se facturează", motivNefacturare: "Inclus în contract" } });
  const before = (await ref.get()).data()!;
  const document = (await ref.collection("installationCompletion").doc("final").get()).data();
  const ui = await service.list(manager, ready.id);
  assert.deepEqual(ui.managementActions?.archiveReasons, []);
  await assert.rejects(service.list(tech, ready.id), /acces|atribuit|neautorizat/i);
  await Promise.all([service.archive(manager, ready.id), service.archive(manager, ready.id)]);
  const after = (await ref.get()).data()!;
  assert.equal(after.statusLucrare, "Arhivată");
  assert.equal(after.archivedBy, "Dispecer test");
  assert.ok(after.archivedAt);
  assert.equal(after.anulat, undefined);
  assert.deepEqual(after.installation, before.installation);
  assert.deepEqual((await ref.collection("installationCompletion").doc("final").get()).data(), document);
  assert.equal((await ref.collection("installationAudit").where("action", "==", "archive").get()).size, 1);
});

test("archive rejects missing PV, open sheets, stale sessions and changed commercial settings", async () => {
  const { work, ref } = await commercialReady();
  await ref.update({ preluatDispecer: true, statusFacturare: "Nu se facturează", motivNefacturare: "Contract" });
  const completion = ref.collection("installationCompletion").doc("final");
  const snapshot = (await completion.get()).data()!;
  await completion.delete();
  await assert.rejects(service.archive(manager, work.id), /PV-ul final/);
  await completion.set(snapshot);
  for (const state of ["draft", "awaiting_signature"]) {
    await ref.collection("installationSheets").doc("pending").set({ state });
    await assert.rejects(service.archive(manager, work.id), /toate fișele/);
  }
  await ref.collection("installationSheets").doc("pending").delete();
  const session = db.doc("installationTechnicianSessions/stale");
  await session.set({ workId: work.id });
  await assert.rejects(service.archive(manager, work.id), /sesiunile/);
  await session.delete();
  await ref.update({ necesitaOferta: true });
  await assert.rejects(service.archive(manager, work.id), /Trimite oferta/);
  await db.doc("predefinedSettings/archive_offer_require_offer_sent_when_needed").set({ value: false });
  assert.deepEqual((await service.list(manager, work.id)).managementActions?.archiveReasons, []);
  // A setting changed after GET must be checked again by the POST transaction.
  await db.doc("predefinedSettings/archive_offer_require_offer_sent_when_needed").set({ value: true });
  await assert.rejects(service.archive(manager, work.id), /Trimite oferta/);
  assert.equal((await ref.get()).data()!.statusLucrare, "Finalizat");
  await db.doc("users/dispatcher").update({ disabled: true });
  await assert.rejects(service.archive(manager, work.id), /Acces neautorizat/);
});

test("completed installation supports dispatcher pickup and invoice without changing signed documents", async () => {
  const { work, ref } = await commercialReady();
  const before = (await ref.get()).data()!;
  const signedBefore = (await ref.collection("installationCompletion").doc("final").get()).data();
  await service.manage(manager, work.id, { work: { preluatDispecer: true, preluatDe: "Untrusted client name" } });
  assert.equal((await ref.get()).data()!.preluatDe, "Dispecer test");
  await service.manage(manager, work.id, { work: { facturaDocument: { url: "https://example.invalid/factura.pdf", fileName: "factura.pdf" }, statusFacturare: "Facturat" } });
  const after = (await ref.get()).data()!;
  assert.equal(after.statusFacturare, "Facturat");
  assert.equal(after.preluatDispecer, true);
  assert.equal(after.statusLucrare, "Finalizat");
  assert.deepEqual(after.installation, { ...before.installation, assignmentVersion: 1, lastPickupVersion: 0 });
  assert.deepEqual(after.tehnicieni, []);
  assert.deepEqual((await ref.collection("installationCompletion").doc("final").get()).data(), signedBefore);
  assert.equal(after.raportGenerat, undefined, "No legacy intervention report is created");
  const audit = await ref.collection("installationAudit").where("action", "==", "manage").get();
  assert.equal(audit.size, 2);
});

test("installation commercial transitions reject technicians, forged roles and unfinished pickup", async () => {
  const work = await create();
  await assert.rejects(service.manage(tech, work.id, { work: { necesitaOferta: true } }), /Doar dispecerul/);
  await assert.rejects(service.manage({ uid: tech.uid, role: "dispecer" }, work.id, { work: { necesitaOferta: true } }), /neautorizat/);
  await assert.rejects(service.manage(manager, work.id, { work: { preluatDispecer: true } }), /Finalizează instalarea/);
  await assert.rejects(service.manage(manager, work.id, { work: { statusFacturare: "Facturat" } }), /Preia tichetul/);
  await assert.rejects(service.manage(manager, work.id, { work: { devizProducts: [] } }), /Preia tichetul/);
  await assert.rejects(service.manage(manager, work.id, { work: { statusLucrare: "Finalizat" } }), /nepermis/);
  await assert.rejects(service.manage(manager, work.id, { work: { installation: {} } }), /nepermis/);
  await db.collection("lucrari").doc(work.id).update({ statusLucrare: "Finalizat", "installation.closedReason": "completed" });
  await assert.rejects(service.manage(manager, work.id, { work: { preluatDispecer: true } }), /Procesul-verbal/);
});

test("pickup releases a signed unfinished team, retains history and commercial access across repeated assignments", async () => {
  const work = await create();
  const ref = db.collection("lucrari").doc(work.id);
  await ref.update({ technicianIds: [tech.uid, tech2.uid] });
  const first = (await start(work.id)).sheet;
  const second = (await start(work.id, "e2", tech2)).sheet;
  await close(work.id, first);
  await service.save(tech2, work.id, {
    sheetId: second.id, revision: second.revision,
    fields: { ...content, installationStatus: "blocked", blockReason: "Lipsă alimentare" }, signatures: signed,
  }, true);
  const before = (await ref.get()).data()!;
  const sheetsBefore = (await ref.collection("installationSheets").get()).docs.map(d => d.data());
  await db.doc("installationTechnicianSessions/stale").set({ workId: work.id });
  await db.doc("installationTechnicianSessions/unrelated").set({ workId: "elsewhere" });
  const pickup = { work: { preluatDispecer: true }, expectedAssignmentVersion: 0 };
  await Promise.all([service.manage(manager, work.id, pickup), service.manage(manager, work.id, pickup)]);
  let after = (await ref.get()).data()!;
  assert.equal(after.statusLucrare, "Listată");
  assert.equal(after.nrLucrare, before.nrLucrare);
  assert.equal(after.preluatDispecer, true);
  assert.deepEqual(after.tehnicieni, []);
  assert.deepEqual(after.technicianIds, []);
  assert.deepEqual(after.installation.equipmentStatus, before.installation.equipmentStatus);
  assert.equal(after.installation.closedReason, undefined);
  assert.equal((await ref.collection("installationCompletion").doc("final").get()).exists, false);
  assert.deepEqual((await ref.collection("installationSheets").get()).docs.map(d => d.data()), sheetsBefore);
  assert.equal((await db.doc("installationTechnicianSessions/stale").get()).exists, false);
  assert.equal((await db.doc("installationTechnicianSessions/unrelated").get()).exists, true);
  assert.equal((await ref.collection("installationAudit").where("action", "==", "pickup").get()).size, 1);
  await assert.rejects(start(work.id), /atribuit/);
  await service.edit(manager, work.id, { tehnicieni: ["Tehnician doi"] });
  after = (await ref.get()).data()!;
  assert.equal(after.statusLucrare, "Atribuită");
  assert.equal(after.preluatDispecer, true);
  assert.equal(after.installation.assignmentVersion, 2);
  await service.manage(manager, work.id, pickup); // Delayed retry must not release the new team.
  assert.deepEqual((await ref.get()).data()!.tehnicieni, ["Tehnician doi"]);
  await service.manage(manager, work.id, { work: { devizTotal: 100, devizProducts: [] } });
  await service.manage(manager, work.id, { work: { statusFacturare: "Nu se facturează", motivNefacturare: "Contract" } });
  const third = (await start(work.id, "e1", tech2)).sheet;
  assert.notEqual(third.id, first.id);
  assert.equal((await ref.get()).data()!.statusLucrare, "În lucru");
  await close(work.id, third);
  await service.manage(manager, work.id, { work: { preluatDispecer: true }, expectedAssignmentVersion: 2 });
  after = (await ref.get()).data()!;
  assert.equal(after.statusLucrare, "Listată");
  assert.deepEqual(after.tehnicieni, []);
  assert.equal(after.devizTotal, 100);
  assert.equal(after.statusFacturare, "Nu se facturează");
  assert.equal((await ref.collection("installationSheets").get()).size, 3);
  assert.equal((await ref.collection("installationAudit").where("action", "==", "pickup").get()).size, 2);
});

test("pickup validates roles, assignment version and actual sheets even when equipment maps are stale", async () => {
  const work = await create();
  const ref = db.collection("lucrari").doc(work.id);
  const input = { work: { preluatDispecer: true }, expectedAssignmentVersion: 0 };
  await assert.rejects(service.manage(tech, work.id, input), /Doar dispecerul/);
  await assert.rejects(service.manage({ uid: tech.uid, role: "admin" }, work.id, input), /neautorizat/);
  await assert.rejects(service.manage(manager, work.id, input), /cel puțin o fișă/);
  const { sheet } = await start(work.id);
  await assert.rejects(service.manage(manager, work.id, input), /fișele active/);
  await service.stop(tech, work.id, { sheetId: sheet.id, revision: sheet.revision, fields: content });
  await assert.rejects(service.manage(manager, work.id, input), /Semnează toate/);
  await ref.update({ "installation.awaitingSheetByEquipment": {} });
  await assert.rejects(service.manage(manager, work.id, input), /Închide și semnează/);
  await ref.collection("installationSheets").doc(sheet.id).update({ state: "closed", documentSnapshot: { technicianSignature: "signed" } });
  await assert.rejects(service.manage(manager, work.id, input), /Închide și semnează/);
  await ref.collection("installationSheets").doc(sheet.id).update({ "documentSnapshot.beneficiarySignature": "signed" });
  await service.edit(manager, work.id, { tehnicieni: ["Tehnician doi"] });
  await assert.rejects(service.manage(manager, work.id, input), /Echipa a fost modificată/);
  await assert.rejects(service.manage(manager, work.id, { ...input, expectedAssignmentVersion: -1 }), /Versiune/);
  await ref.update({ statusLucrare: "Arhivată" });
  await assert.rejects(service.manage(manager, work.id, { ...input, expectedAssignmentVersion: 1 }), /arhivat sau anulat/);
});

test("offer versions append atomically before pickup; sent offers cannot be disabled", async () => {
  const work = await create();
  const ref = db.collection("lucrari").doc(work.id);
  await service.manage(manager, work.id, { work: { necesitaOferta: true, comentariiOferta: "Montaj suplimentar" } });
  await Promise.all([1, 2].map(number => service.manage(manager, work.id, {
    work: {}, append: { offerVersions: [{ savedAt: `version-${number}`, products: [], total: number }] },
  })));
  assert.equal((await ref.get()).data()!.offerVersions.length, 2);
  await service.manage(manager, work.id, { work: {}, append: { offerVersions: [{ savedAt: "version-1", products: [], total: 1 }] } });
  assert.equal((await ref.get()).data()!.offerVersions.length, 2, "Retry does not duplicate a version");
  await ref.update({ offerSendCount: 1 });
  await assert.rejects(service.manage(manager, work.id, { work: { necesitaOferta: false } }), /nu poate fi dezactivată/);
  await assert.rejects(service.manage(manager, work.id, { work: { offerVersions: [] } }), /doar completat/);
  await assert.rejects(service.manage(manager, work.id, { work: {}, append: { installation: [] } }), /nepermis/);
});

test("invoice and no-invoice transitions validate documents and support removal", async () => {
  const { work, ref } = await commercialReady();
  await service.manage(manager, work.id, { work: { preluatDispecer: true } });
  await assert.rejects(service.manage(manager, work.id, { work: { statusFacturare: "Nu se facturează", motivNefacturare: "  " } }), /Completează motivul/);
  await assert.rejects(service.manage(manager, work.id, { work: { statusFacturare: "Facturat" } }), /Încarcă factura/);
  await service.manage(manager, work.id, { work: { statusFacturare: "Nu se facturează", motivNefacturare: "Inclus în contract" } });
  await service.manage(manager, work.id, { work: { facturaDocument: { url: "https://example.invalid/invoice", fileName: "invoice" }, statusFacturare: "Facturat" } });
  await service.manage(manager, work.id, { work: { statusFacturare: "Nu se facturează" }, remove: ["facturaDocument"] });
  assert.equal((await ref.get()).data()!.facturaDocument, undefined);
  assert.equal((await ref.get()).data()!.statusFacturare, "Nu se facturează");
  await service.manage(manager, work.id, { work: { devizTotal: 100 }, append: { devizVersions: [{ total: 100 }] } });
  assert.equal((await ref.get()).data()!.devizVersions.length, 1);
  await ref.update({ statusLucrare: "Arhivată" });
  await assert.rejects(service.manage(manager, work.id, { work: { necesitaOferta: true } }), /arhivat sau anulat/);
});

const admin = { uid: "admin", role: "admin" };
async function seedAdmin() {
  await db.doc("users/admin").set({ role: "admin", displayName: "Admin test" });
}

test("termination enforces roles, verified identity and a nonempty cancellation reason", async () => {
  const work = await create();
  await assert.rejects(() => service.cancel(tech, work.id, "Motiv"), /dreptul/);
  await assert.rejects(() => service.delete(manager, work.id), /dreptul/);
  await assert.rejects(() => service.delete(tech, work.id), /dreptul/);
  await assert.rejects(() => service.cancel(manager, work.id, "  "), /obligatoriu/);
  await assert.rejects(() => service.cancel({ ...tech, role: "admin" }, work.id, "Motiv"), /neautorizat/);
  assert.equal((await db.doc(`lucrari/${work.id}`).get()).data()!.anulat, undefined);
});

test("cancellation archives once, releases its team and preserves other sessions and signed documents", async () => {
  const work = await create();
  const signedSheet = await start(work.id);
  await close(work.id, signedSheet.sheet);
  const signedBefore = (await db.doc(`lucrari/${work.id}/installationSheets/${signedSheet.sheet.id}`).get()).data();
  const active = await start(work.id, "e2");
  await start(work.id, "e2", tech2);
  await db.doc("installationTechnicianSessions/other").set({ workId: "another", sheetId: "other" });
  await service.cancel(manager, work.id, "  Beneficiarul a renunțat  ");
  const stored = (await db.doc(`lucrari/${work.id}`).get()).data()!;
  assert.equal(stored.statusLucrare, "Arhivată");
  assert.equal(stored.anulat, true);
  assert.equal(stored.motivAnulare, "Beneficiarul a renunțat");
  assert.equal(stored.anulatDeId, manager.uid);
  assert.equal(stored.archivedBy, "Dispecer test");
  assert.ok(stored.archivedAt.toMillis());
  assert.ok(stored.anulatAt.toMillis());
  assert.equal(stored.notificationRead, false);
  assert.deepEqual(stored.notificationReadBy, []);
  assert.deepEqual(stored.installation.activeSheetByEquipment, {});
  assert.deepEqual(stored.installation.awaitingSheetByEquipment, {});
  for (const uid of [tech.uid, tech2.uid]) assert.equal((await db.doc(`installationTechnicianSessions/${uid}`).get()).exists, false);
  assert.equal((await db.doc("installationTechnicianSessions/other").get()).exists, true);
  const stopped = (await db.doc(`lucrari/${work.id}/installationSheets/${active.sheet.id}`).get()).data()!;
  assert.ok(stopped.stoppedAt);
  assert.ok(stopped.participants.every((member: any) => !member.active));
  assert.equal(stopped.documentSnapshot, undefined);
  assert.deepEqual((await db.doc(`lucrari/${work.id}/installationSheets/${signedSheet.sheet.id}`).get()).data(), signedBefore);
  const listing = await service.list(tech, work.id);
  assert.equal(listing.canStart, false);
  assert.equal(listing.work.motivAnulare, stored.motivAnulare);
  await seedAdmin();
  await service.cancel(admin, work.id, "Alt motiv");
  assert.deepEqual((await db.doc(`lucrari/${work.id}`).get()).data(), stored);
  assert.equal((await db.collection(`lucrari/${work.id}/installationAudit`).where("action", "==", "cancel").get()).size, 1);
  const next = await create();
  await start(next.id);
});

test("canceled installations reject work operations and cannot sign pending sheets", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  await service.stop(tech, work.id, { sheetId: sheet.id, revision: sheet.revision, fields: content });
  await service.cancel(manager, work.id, "Anulare");
  const list = await service.list(tech, work.id);
  assert.equal(list.sheets[0].canSign, false);
  await assert.rejects(() => start(work.id), /închis sau anulat/);
  await assert.rejects(() => service.edit(manager, work.id, {}), /închis sau anulat/);
  await assert.rejects(() => service.sign(tech, work.id, { sheetId: sheet.id, revision: 1, requestId: randomUUID(), signatures: signed }), /închis sau anulat/);
  await assert.rejects(() => service.save(tech, work.id, { sheetId: sheet.id, revision: 1, fields: content }), /închis sau anulat/);
  await assert.rejects(() => service.continueWork(manager, work.id), /închis sau anulat/);
  await assert.rejects(() => service.complete(tech, work.id, { signatures: signed }), /închis sau anulat/);
});

test("delete removes only the ticket, releases stale sessions and retains files, continuations and actor audit", async () => {
  await seedAdmin();
  const work = await create();
  const { sheet } = await start(work.id);
  await db.doc(`lucrari/${work.id}/installationSheets/${sheet.id}`).update({ photos: [{ id: "photo", path: "keep/photo", name: "photo", contentType: "image/png" }] });
  await db.doc("installationTechnicianSessions/stale").set({ workId: work.id, sheetId: "missing" });
  await db.doc("installationTechnicianSessions/unrelated").set({ workId: "unrelated", sheetId: sheet.id });
  await db.doc("lucrari/continuation").set({ installation: { rootWorkId: work.id }, lucrareOriginala: work.id });
  await service.delete(admin, work.id);
  assert.equal((await db.doc(`lucrari/${work.id}`).get()).exists, false);
  assert.equal((await db.doc("lucrari/continuation").get()).exists, true);
  assert.equal((await db.doc(`lucrari/${work.id}/installationSheets/${sheet.id}`).get()).data()!.photos[0].path, "keep/photo");
  for (const uid of [tech.uid, "stale"]) assert.equal((await db.doc(`installationTechnicianSessions/${uid}`).get()).exists, false);
  assert.equal((await db.doc("installationTechnicianSessions/unrelated").get()).exists, true);
  const logs = await db.collection("logs").where("entityId", "==", work.id).get();
  assert.equal(logs.size, 1);
  assert.equal(logs.docs[0].data().utilizatorId, admin.uid);
  assert.equal(logs.docs[0].data().nrLucrare, work.nrLucrare);
  await service.delete(admin, work.id);
  assert.equal((await db.collection("logs").where("entityId", "==", work.id).get()).size, 1);
});

test("concurrent cancellation and start never leave a session on a canceled ticket", async () => {
  const work = await create();
  const results = await Promise.allSettled([start(work.id), service.cancel(manager, work.id, "Anulare concurentă")]);
  assert.equal(results[1].status, "fulfilled");
  assert.equal((await db.doc(`lucrari/${work.id}`).get()).data()!.anulat, true);
  assert.equal((await db.collection("installationTechnicianSessions").where("workId", "==", work.id).get()).empty, true);
  assert.deepEqual((await db.doc(`lucrari/${work.id}`).get()).data()!.installation.activeSheetByEquipment, {});
});

test("concurrent cancellation and save preserve the last committed draft and release its session", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  const results = await Promise.allSettled([
    service.save(tech, work.id, { sheetId: sheet.id, revision: sheet.revision, fields: content }),
    service.cancel(manager, work.id, "Anulare concurentă"),
  ]);
  assert.equal(results[1].status, "fulfilled");
  const stored = (await db.doc(`lucrari/${work.id}/installationSheets/${sheet.id}`).get()).data()!;
  assert.ok(stored.stoppedAt);
  assert.ok(stored.participants.every((member: any) => !member.active));
  assert.equal((await db.doc(`installationTechnicianSessions/${tech.uid}`).get()).exists, false);
  if (results[0].status === "fulfilled") assert.equal(stored.operations, content.operations);
  await assert.rejects(() => service.save(tech, work.id, { sheetId: sheet.id, revision: stored.revision, fields: content }), /închis sau anulat/);
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
  const [done, concurrent] = await Promise.all([service.complete(tech, continuation.workId, {
    signatures: signed,
    observations: "Predat beneficiarului",
  }), service.complete(tech, continuation.workId, { signatures: signed })]);
  assert.equal(concurrent.document?.deliveryEffectId, done.document?.deliveryEffectId);
  const effects = await db.collection("mobileEffects").where("rootWorkId", "==", root.id).get();
  assert.equal(effects.size, 1);
  assert.equal(effects.docs[0].data().status, "pending");
  assert.equal(effects.docs[0].data().workId, continuation.workId);
  const listed = await service.list(tech, continuation.workId);
  assert.equal(listed.completion?.delivery?.status, "pending");
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
test("assigned later cannot sign a stopped sheet; list reads preserve old data and authorization", async () => {
  const work = await service.create(manager, { ...workInput, tehnicieni: ["Tehnician unu"] }, randomUUID());
  const first = await start(work.id);
  await service.stop(tech, work.id, { sheetId: first.sheet.id, revision: 0, fields: content });
  await service.edit(manager, work.id, { tehnicieni: ["Tehnician unu", "Tehnician doi"] });
  const ref = db.doc(`lucrari/${work.id}/installationSheets/${first.sheet.id}`);
  const before = await ref.get();
  const auditBefore = await db.doc(`lucrari/${work.id}`).collection("installationAudit").get();
  for (const [actor, canSign] of [[tech, true], [tech2, false], [manager, false]] as const) {
    const result = await service.list(actor, work.id);
    assert.equal(result.sheets[0].canSign, canSign);
    assert.deepEqual(result.sheets[0].participants!.map(p => p.uid), [tech.uid]);
  }
  await assert.rejects(service.sign(tech2, work.id, {
    sheetId: first.sheet.id, revision: 1, requestId: randomUUID(), signatures: signed,
  }), /participant/);
  await assert.rejects(service.sign(tech, work.id, {
    sheetId: first.sheet.id, revision: 0, requestId: randomUUID(), signatures: signed,
  }), /altă fereastră/);
  const after = await ref.get();
  assert.deepEqual(after.data(), before.data());
  assert.equal(after.updateTime!.toMillis(), before.updateTime!.toMillis());
  assert.equal((await db.doc(`lucrari/${work.id}`).collection("installationAudit").get()).size, auditBefore.size);
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

test("web and mobile PV delivery share one real PDF and one isolated email event", async () => {
  const work = await create();
  for (const equipmentId of ["e1", "e2"]) {
    const started = await start(work.id, equipmentId);
    await close(work.id, started.sheet, "completed");
  }
  const completed = await service.complete(tech, work.id, { signatures: signed });
  const { NextRequest } = await import("next/server");
  const keys = ["MAIL_TRANSPORT_MODE", "MAIL_SINK_ALLOWED_DOMAINS", "APP_DEPLOYMENT_ENV"] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.MAIL_TRANSPORT_MODE = "sink";
  process.env.MAIL_SINK_ALLOWED_DOMAINS = "example.invalid";
  process.env.APP_DEPLOYMENT_ENV = "staging";
  try {
    const { sendInstallationCompletion } = await import("./delivery.server");
    const effectId = completed.document?.deliveryEffectId;
    const results = await Promise.all([
      sendInstallationCompletion(new NextRequest(`http://localhost/api/lucrari/${work.id}/installation`), work.id, effectId),
      sendInstallationCompletion(new NextRequest("http://localhost/api/mobile/commands"), work.id, effectId),
    ]);
    assert(results.some(result => result?.status === "simulated"), JSON.stringify(results));
    assert.equal((await service.list(tech, work.id)).completion?.delivery?.status, "simulated");
    const events = await db.collection("emailEvents").where("lucrareId", "==", work.id).get();
    assert.equal(events.size, 1);
    const email = events.docs[0].data();
    assert.equal(email.provider, "sink");
    assert.equal(email.subject, "Proces-verbal de instalare — #000100");
    assert.deepEqual(email.to, ["test@example.invalid"]);
    assert.match(email.meta.pdfName, /^Proces_verbal_instalare_.*\.pdf$/);
    assert(email.meta.pdfBytes > 1000);
    await sendInstallationCompletion(new NextRequest("http://localhost/api/mobile/commands"), work.id, effectId);
    assert.equal((await db.collection("emailEvents").where("lucrareId", "==", work.id).get()).size, 1);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("orphan principal session from a deleted ticket does not block listing or starting another installation", async () => {
  const previous = await create();
  const old = await start(previous.id);
  await db.doc(`lucrari/${previous.id}`).delete(); // Firestore preserves subcollections.
  assert.equal((await db.doc(`lucrari/${previous.id}/installationSheets/${old.sheet.id}`).get()).exists, true);
  const next = await create();
  assert.equal((await service.list(tech, next.id)).currentSession, null);
  // Listing is read-only; repair happens only in the successful start transaction.
  assert.equal((await db.doc(`installationTechnicianSessions/${tech.uid}`).get()).data()!.workId, previous.id);
  const result = await start(next.id);
  assert.equal(result.sheet.principalUid, tech.uid);
  assert.equal((await db.doc(`installationTechnicianSessions/${tech.uid}`).get()).data()!.workId, next.id);
  assert.equal((await db.doc(`installationTechnicianSessions/${tech2.uid}`).get()).data()!.workId, next.id);
  assert.equal((await service.list(tech, next.id)).currentSession?.sheetId, result.sheet.id);
});

test("terminal or missing source sheets no longer lock a technician, while valid principal sessions stay protected", async () => {
  const previous = await create();
  const old = await start(previous.id);
  const next = await create();
  assert.equal((await service.list(tech, next.id)).currentSession?.sheetId, old.sheet.id);
  await assert.rejects(() => start(next.id), /fișă activă ca principal/);
  await db.doc(`lucrari/${previous.id}/installationSheets/${old.sheet.id}`).update({state:"awaiting_signature"});
  assert.equal((await service.list(tech, next.id)).currentSession, null);
  await db.doc(`lucrari/${previous.id}/installationSheets/${old.sheet.id}`).delete();
  assert.equal((await service.list(tech, next.id)).currentSession, null);
  await start(next.id);
});

test("timing follows team joins, transfers, return and deferred signing without duplication", async () => {
  const work = await create();
  const first = (await start(work.id)).sheet;
  assert.equal(first.timeIntervals!.length, 2);
  assert.equal(first.timeIntervals![0].startedAt, first.timeIntervals![1].startedAt);
  await start(work.id);
  const second = (await start(work.id, "e2", tech2)).sheet;
  let old = (await service.list(manager, work.id)).sheets.find(s => s.id === first.id)!;
  const departure = old.timeIntervals!.find(i => i.uid === tech2.uid)!;
  assert.equal(departure.endedAt, second.timeIntervals![0].startedAt);
  assert.equal(old.timeIntervals!.find(i => i.uid === tech.uid)!.endedAt, undefined);
  await close(work.id, second);
  const returned = (await start(work.id, "e1", tech2)).sheet;
  assert.equal(returned.timeIntervals!.filter(i => i.uid === tech2.uid).length, 2);
  await assert.rejects(service.stop(tech, work.id, {sheetId: first.id, revision: 99, fields: content}));
  const pending = (await service.stop(tech, work.id, {sheetId: first.id, revision: 0, fields: content})).sheet;
  assert.ok(pending.timeIntervals!.every((i: import("@/types/installation").InstallationTimeInterval) => i.endedAt));
  assert.deepEqual(pending.frozenDocument!.timeIntervals, pending.timeIntervals);
  const signedSheet = (await service.sign(tech, work.id, {sheetId: first.id, revision: pending.revision, requestId: randomUUID(), signatures: signed})).sheet;
  assert.deepEqual(signedSheet.documentSnapshot!.timeIntervals, pending.timeIntervals);
  assert.equal(signedSheet.timeIntervals!.length, 3);
});
test("historical sheets stay untracked and concurrent scans create one interval per participant", async () => {
  const work = await create();
  const results = await Promise.all([start(work.id), start(work.id, "e1", tech2)]);
  const sheet = results[0].sheet;
  const ref = db.doc(`lucrari/${work.id}/installationSheets/${sheet.id}`);
  assert.equal((await ref.get()).data()!.timeIntervals.length, 2);
  const {FieldValue} = await import('firebase-admin/firestore');
  await ref.update({timeIntervals: FieldValue.delete()});
  const closed = (await close(work.id, sheet)).sheet;
  assert.equal(closed.timeIntervals, undefined);
  assert.equal(closed.documentSnapshot!.timeIntervals, undefined);
});
for (const mode of ['cancel', 'delete'] as const) test(`timing closes on ${mode}`, async () => {
  const work = await create();
  const sheet = (await start(work.id)).sheet;
  if (mode === 'cancel') await service.cancel(manager, work.id, 'Test');
  else {
    await db.doc('users/dispatcher').update({role: 'admin'});
    await service.delete({...manager, role: 'admin'}, work.id);
  }
  const saved = (await db.doc(`lucrari/${work.id}/installationSheets/${sheet.id}`).get()).data()!;
  assert.ok(saved.timeIntervals.every((i: any) => i.endedAt === saved.stoppedAt));
  assert.equal((await db.collection('installationTechnicianSessions').get()).size, 0);
});

test("photo upload checks the sheet version transactionally and idempotent retry still succeeds", async () => {
  const work = await create();
  const { sheet } = await start(work.id);
  const photo = {id:'offline-photo',path:'mobile/tech1/photo',name:'photo.jpg',contentType:'image/jpeg'};
  const attached = await service.attachPhoto(tech,work.id,sheet.id,photo,false,sheet.revision);
  assert.equal(attached.sheet.revision,sheet.revision+1);
  const retry = await service.attachPhoto(tech,work.id,sheet.id,photo,false,sheet.revision);
  assert.equal(retry.sheet.revision,attached.sheet.revision);
  await assert.rejects(service.attachPhoto(tech,work.id,sheet.id,{...photo,id:'other-photo'},false,sheet.revision),/modificată/);
  assert.equal((await db.doc(`lucrari/${work.id}/installationSheets/${sheet.id}`).get()).data()!.photos.length,1);
});
