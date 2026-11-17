import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { remoteSigning } from "./service";
import { DECLARATION_VERSION, digest, token } from "./core";
import { remoteSignatureContentChanged } from "@/packages/fom-domain/remote-signatures";

assert.match(
  process.env.FIRESTORE_EMULATOR_HOST || "",
  /^(127\.0\.0\.1|localhost):\d+$/,
);
const projectId = "demo-fom-remote-signing";
const app = initializeApp({ projectId }, "remote-signature-tests"),
  db = getFirestore(app);
const secret = "isolated-test-secret-never-production-123456";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAKCAYAAACjd+4vAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAIElEQVR4nGMQsQj6PxCYYdRikVGLLUYtDhq1+D85FgMAZd7kDNae2IoAAAAASUVORK5CYII=";
let time = Date.parse("2026-11-17T12:00:00Z"),
  messages: any[] = [],
  failMail = false;
const service = remoteSigning(db, {
  secret,
  origin: "https://test.invalid",
  now: () => time,
  send: async (request, stage, link) => {
    messages.push({ request, stage, link });
    if (failMail) throw new Error("SMTP response lost");
    return { status: "simulated" };
  },
});
const identity = {
  version: 1,
  clientId: "client",
  client: "Client test",
  locatie: "Locatie test",
  persoanaContact: "Test",
  telefon: "",
  persoanaContactEmail: "beneficiary@example.invalid",
  clientInfo: {
    nume: "Client test",
    cui: "RO1",
    rc: "",
    adresa: "Test",
    locationName: "Locatie test",
    locationAddress: "Test",
  },
};
const equipment = {
  id: "eq",
  name: "Echipament test",
  code: "QR-TEST",
  model: "Test",
};
const initial = {
  client: "Client test",
  clientId: "client",
  locationId: "loc",
  locatie: "Locatie test",
  technicianIds: ["tech"],
  tehnicieni: ["Tehnician test"],
  nrLucrare: "#TEST",
  statusLucrare: "Fără semnătură",
  tipLucrare: "Intervenție contra cost",
  equipmentVerified: true,
  constatareLaLocatie: "Verificare test",
  descriereInterventie: "Reparație test",
  cauzaPrincipalaDefectId: "uzura",
  products: [],
  timpSosire: "2026-11-17T10:00:00Z",
  timpPlecare: "2026-11-17T11:00:00Z",
  durataInterventie: "1 h",
  updatedAt: "2026-11-17T11:00:00Z",
};
before(async () => {
  const content = await readFile("firestore.rules", "utf8");
  const r = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}:securityRules`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rules: { files: [{ name: "firestore.rules", content }] },
      }),
    },
  );
  assert.ok(r.ok);
});
beforeEach(async () => {
  time = Date.parse("2026-11-17T12:00:00Z");
  messages = [];
  failMail = false;
  const r = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  assert.ok(r.ok);
  await db
    .doc("users/tech")
    .set({ role: "tehnician", displayName: "Tehnician test" });
  await db
    .doc("users/other")
    .set({ role: "tehnician", displayName: "Alt tehnician" });
  await db
    .doc("clienti/client")
    .set({
      nume: "Client test",
      cui: "RO1",
      locatii: [
        {
          id: "loc",
          nume: "Locatie test",
          adresa: "Test",
          persoaneContact: [],
        },
      ],
    });
  await db.doc("lucrari/work").set(initial);
});
after(() => deleteApp(app));
async function create(kind: "report" | "sheet" | "completion" = "report") {
  return service.create("tech", {
    action: "create",
    requestId: randomUUID(),
    workId: "work",
    kind,
    ...(kind === "sheet" ? { sheetId: "sheet" } : {}),
    email: "beneficiary@example.invalid",
    technicianSignature: png,
  });
}
function credentials(r: any, phase = "invite") {
  const m = [...messages]
    .reverse()
    .find(
      (m) =>
        m.request.id === r.id &&
        m.stage === (phase === "invite" ? "invite" : "confirm"),
    );
  return Object.fromEntries(new URLSearchParams(new URL(m.link).hash.slice(1)));
}
async function submit(r: any) {
  const c = credentials(r);
  return service.submit(r.id, c.token, {
    email: "beneficiary@example.invalid",
    beneficiaryName: "Beneficiar test",
    signature: png,
    accepted: true,
  });
}
async function installation(closed = false) {
  await db
    .doc("lucrari/work")
    .set({
      ...initial,
      tipLucrare: "Instalare",
      statusLucrare: "În lucru",
      equipmentIds: ["eq"],
      installation: {
        schemaVersion: 1,
        rootWorkId: "work",
        equipment: [equipment],
        equipmentStatus: { eq: closed ? "done" : "in_progress" },
        activeSheetByEquipment: {},
        awaitingSheetByEquipment: closed ? {} : { eq: "sheet" },
      },
    });
  const document = {
    client: identity,
    workNumber: "#TEST",
    workDate: "2026-11-17",
    equipment: [equipment],
    photos: [],
    finding: "Test constatare",
    operations: "Test montaj",
    installationStatus: "completed",
    blockReason: "",
    principalName: "Tehnician test",
    timeIntervals: [
      {
        uid: "tech",
        startedAt: "2026-11-17T10:00:00Z",
        endedAt: "2026-11-17T11:00:00Z",
      },
    ],
  };
  await db
    .doc("lucrari/work/installationSheets/sheet")
    .set({
      ...document,
      equipmentId: "eq",
      principalUid: "tech",
      revision: 2,
      state: closed ? "closed" : "awaiting_signature",
      frozenDocument: document,
      ...(closed
        ? {
            documentSnapshot: {
              ...document,
              technicianSignature: png,
              beneficiarySignature: png,
              technicianName: "Tehnician test",
              beneficiaryName: "Beneficiar test",
            },
          }
        : {}),
    });
}

test("report: two email stages, read-only views, exact signature, no attendance, idempotent confirmation", async () => {
  const r = await create();
  assert.equal(messages.length, 1);
  const c = credentials(r);
  for (let n = 0; n < 3; n++) await service.access(r!.id, c.token, "invite");
  assert.equal(
    (await db.doc(`remoteSignatures/${r!.id}`).get()).data()!.status,
    "invited",
  );
  await submit(r);
  const final = credentials(r, "confirm");
  await service.access(r!.id, final.token, "confirm");
  assert.equal(
    (await db.doc("lucrari/work").get()).data()!.raportDataLocked,
    undefined,
  );
  await Promise.all([
    service.confirm(r!.id, final.token, true),
    service.confirm(r!.id, final.token, true),
  ]);
  const work = (await db.doc("lucrari/work").get()).data()!;
  assert.equal(work.statusLucrare, "Finalizat");
  assert.equal(work.semnaturaBeneficiar, png);
  assert.equal(work.raportSnapshot.semnaturaBeneficiar, png);
  assert.equal(work.timpPlecare, initial.timpPlecare);
  assert.equal(messages.filter((m) => m.stage === "final").length, 1);
  assert.equal(
    work.remoteSignatureEvidence.declarationVersion,
    DECLARATION_VERSION,
  );
  assert.equal((await db.collection("attendance").get()).size, 0);
});
test("revision: freezes checklist rows and all stopped equipment intervals", async () => {
  await db
    .doc("lucrari/work")
    .update({
      tipLucrare: "Revizie",
      equipmentIds: ["eq"],
      revision: { equipmentStatus: { eq: "done" } },
      revisionEquipmentTimes: {
        eq: { startIso: initial.timpSosire, endIso: initial.timpPlecare },
      },
    });
  await db
    .doc("lucrari/work/revisions/eq")
    .set({
      sections: [{ name: "Test", operations: [{ checked: true }] }],
      checklistVersionId: "large-metadata",
    });
  const r = await create();
  await submit(r);
  await service.confirm(r!.id, credentials(r, "confirm").token, true);
  const w = (await db.doc("lucrari/work").get()).data()!;
  assert.equal(w.raportSnapshot.mobileRevisionSnapshot.length, 1);
  assert.equal(
    w.raportSnapshot.mobileRevisionSnapshot[0].checklistVersionId,
    undefined,
  );
});
test("installation sheet closes only the sheet, preserves timing and signatures", async () => {
  await installation();
  const r = await create("sheet");
  await submit(r);
  await service.confirm(r!.id, credentials(r, "confirm").token, true);
  const sheet = (
    await db.doc("lucrari/work/installationSheets/sheet").get()
  ).data()!;
  assert.equal(sheet.state, "closed");
  assert.equal(sheet.revision, 3);
  assert.equal(sheet.documentSnapshot.beneficiarySignature, png);
  assert.equal(
    (await db.doc("lucrari/work").get()).data()!.statusLucrare,
    "În lucru",
  );
  assert.equal(
    (await db.doc("lucrari/work/installationCompletion/final").get()).exists,
    false,
  );
});
test("completion closes installation once after all sheets signed", async () => {
  await installation(true);
  const r = await create("completion");
  await submit(r);
  await service.confirm(r!.id, credentials(r, "confirm").token, true);
  assert.equal(
    (await db.doc("lucrari/work").get()).data()!.installation.closedReason,
    "completed",
  );
  const final = (
    await db.doc("lucrari/work/installationCompletion/final").get()
  ).data()!;
  assert.equal(final.documentSnapshot.sheetReferences.length, 1);
  assert.equal(final.documentSnapshot.beneficiarySignature, png);
});
for (const change of ["edit", "reassign", "cancel", "disabled"])
  test(`${change} rejects pending confirmation and retains the original evidence`, async () => {
    const r = await create();
    await submit(r);
    const c = credentials(r, "confirm");
    if (change === "edit")
      await db
        .doc("lucrari/work")
        .update({ descriereInterventie: "Modificat" });
    if (change === "reassign")
      await db
        .doc("lucrari/work")
        .update({ technicianIds: ["other"], tehnicieni: ["Alt tehnician"] });
    if (change === "cancel")
      await db.doc("lucrari/work").update({ anulat: true });
    if (change === "disabled")
      await db.doc("users/tech").update({ disabled: true });
    await assert.rejects(service.confirm(r!.id, c.token, true));
    const stored = (await db.doc(`remoteSignatures/${r!.id}`).get()).data()!;
    assert.equal(stored.signature, png);
    assert.equal(
      stored.document.descriereInterventie,
      initial.descriereInterventie,
    );
    assert.notEqual(
      (await db.doc("lucrari/work").get()).data()!.statusLucrare,
      "Finalizat",
    );
  });
test("notification/timestamp changes do not invalidate signed content", async () => {
  const r = await create();
  await submit(r);
  await db
    .doc("lucrari/work")
    .update({
      notificationReadBy: ["tech"],
      updatedAt: "2026-11-17T12:03:00Z",
    });
  await service.confirm(r!.id, credentials(r, "confirm").token, true);
});
test("confirmation link cannot be substituted with the initial link; explicit consent required", async () => {
  const r = await create();
  await submit(r);
  await assert.rejects(service.confirm(r!.id, credentials(r).token, true));
  await assert.rejects(
    service.confirm(r!.id, credentials(r, "confirm").token, false),
  );
});
test("wrong destination, malformed PNG and empty name are rejected", async () => {
  const r = await create(),
    c = credentials(r);
  for (const input of [
    { email: "other@example.invalid", signature: png, beneficiaryName: "Test" },
    {
      email: "beneficiary@example.invalid",
      signature: "data:image/png;base64,AAAA",
      beneficiaryName: "Test",
    },
    {
      email: "beneficiary@example.invalid",
      signature: png,
      beneficiaryName: "",
    },
  ])
    await assert.rejects(
      service.submit(r!.id, c.token, { ...input, accepted: true }),
    );
});
test("creation replay and lost submission response do not send duplicate email", async () => {
  const input = {
    requestId: randomUUID(),
    workId: "work",
    kind: "report",
    email: "beneficiary@example.invalid",
    technicianSignature: png,
  };
  const r = await service.create("tech", input);
  await service.create("tech", input);
  await submit(r);
  await submit(r);
  assert.equal(messages.length, 2);
});
test("resend rotates only final link; initial copy does not disclose final token", async () => {
  const r = await create();
  await submit(r);
  const old = credentials(r, "confirm");
  time += 61000;
  await service.resendConfirmation(r!.id, credentials(r).token);
  await assert.rejects(service.confirm(r!.id, old.token, true));
  const latest = await service.latest("tech", {
    workId: "work",
    kind: "report",
  });
  assert.ok(latest!.url);
  assert.equal(
    JSON.stringify(latest).includes(credentials(r, "confirm").token),
    false,
  );
  await service.confirm(r!.id, credentials(r, "confirm").token, true);
});
test("expires independently from attendance and caps confirmation at request expiry", async () => {
  const r = await create();
  time += 6.5 * 86400000;
  await submit(r);
  const stored = (await db.doc(`remoteSignatures/${r!.id}`).get()).data()!;
  assert.equal(stored.confirmExpiresAt, stored.expiresAt);
  time += 86400000;
  await assert.rejects(
    service.confirm(r!.id, credentials(r, "confirm").token, true),
  );
});
test("email failure preserves signed document and never automatically retries uncertain SMTP", async () => {
  const r = await create();
  await submit(r);
  failMail = true;
  const result = await service.confirm(
    r!.id,
    credentials(r, "confirm").token,
    true,
  );
  assert.equal(result.status, "signed");
  assert.equal(result.delivery.final.status, "unknown");
  await service.confirm(r!.id, credentials(r, "confirm").token, true);
  assert.equal(messages.filter((m) => m.stage === "final").length, 1);
  time += 61000;
  failMail = false;
  await service.resend("tech", r!.id);
  assert.equal(
    (await db.doc("lucrari/work").get()).data()!.raportDataLocked,
    true,
  );
});
test("cancel request prevents later submit and confirm", async () => {
  const r = await create();
  await submit(r);
  await service.cancel("tech", r!.id);
  await assert.rejects(
    service.confirm(r!.id, credentials(r, "confirm").token, true),
  );
  await assert.rejects(submit(r));
});
test("unassigned user cannot inspect, resend, cancel or request", async () => {
  const r = await create();
  await assert.rejects(
    service.latest("other", { workId: "work", kind: "report" }),
  );
  await assert.rejects(service.resend("other", r!.id));
  await assert.rejects(service.cancel("other", r!.id));
  await assert.rejects(
    service.create("other", {
      requestId: randomUUID(),
      workId: "work",
      kind: "report",
      email: "test@example.invalid",
      technicianSignature: png,
    }),
  );
});
test("dedicated collections are denied by Firestore rules for unauthenticated clients", async () => {
  const r = await create();
  for (const document of [
    `remoteSignatures/${r!.id}`,
    `remoteSignatureTargets/${digest({ workId: "work", kind: "report" })}`,
    `remoteSignatures/${r!.id}/testMail/invite`,
  ]) {
    const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${document}`;
    assert.equal((await fetch(url)).status, 403);
    assert.equal(
      (
        await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: { status: { stringValue: "signed" } },
          }),
        })
      ).status,
      403,
    );
  }
});
test("HMAC phase separation and canonical hashing", () => {
  assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 }));
  assert.notEqual(
    token(secret, "id", "invite"),
    token(secret, "id", "confirm"),
  );
});
test("changing and restoring content cannot resurrect an invitation", async () => {
  const r = await create();
  await submit(r);
  await db
    .doc("lucrari/work")
    .update({ descriereInterventie: "Editat", remoteSignatureEpoch: 1 });
  await db
    .doc("lucrari/work")
    .update({
      descriereInterventie: initial.descriereInterventie,
      remoteSignatureEpoch: 2,
    });
  await assert.rejects(
    service.confirm(r!.id, credentials(r, "confirm").token, true),
  );
  assert.equal(
    (await service.latest("tech", { workId: "work", kind: "report" }))!.status,
    "invalidated",
  );
  assert.equal(
    remoteSignatureContentChanged(initial, {
      notificationReadBy: ["tech"],
      updatedAt: "later",
    }),
    false,
  );
  assert.equal(
    remoteSignatureContentChanged(initial, { descriereInterventie: "Editat" }),
    true,
  );
  assert.equal(
    remoteSignatureContentChanged(initial, {
      descriereInterventie: initial.descriereInterventie,
    }),
    false,
  );
});
test("new request invalidates old links and preserves both audit records", async () => {
  const first = await create();
  await submit(first);
  time += 61000;
  const second = await create();
  assert.notEqual(first!.id, second!.id);
  await assert.rejects(
    service.access(first!.id, credentials(first).token, "invite"),
  );
  await assert.rejects(
    service.confirm(first!.id, credentials(first, "confirm").token, true),
  );
  assert.equal(
    (await db.doc(`remoteSignatures/${first!.id}`).get()).data()!.signature,
    png,
  );
});
test("known stale version and id reused with other input are rejected", async () => {
  const input = {
    requestId: randomUUID(),
    workId: "work",
    kind: "report",
    email: "beneficiary@example.invalid",
    technicianSignature: png,
  };
  await assert.rejects(
    service.create("tech", { ...input, expectedVersion: "stale" }),
  );
  await service.create("tech", input);
  await assert.rejects(
    service.create("tech", { ...input, email: "other@example.invalid" }),
  );
});
test("report must be stopped and installation completion must have signed sheets", async () => {
  await db.doc("lucrari/work").update({ timpPlecare: "" });
  await assert.rejects(create());
  await installation();
  await assert.rejects(create("completion"));
});
test("sheet edit and changed completion dependencies reject confirmation", async () => {
  await installation();
  const sheet = await create("sheet");
  await submit(sheet);
  await db
    .doc("lucrari/work/installationSheets/sheet")
    .update({ operations: "Alte operațiuni" });
  await assert.rejects(
    service.confirm(sheet!.id, credentials(sheet, "confirm").token, true),
  );
  await installation(true);
  const completion = await create("completion");
  await submit(completion);
  await db
    .doc("lucrari/work/installationSheets/sheet")
    .update({ "documentSnapshot.operations": "Modificat" });
  await assert.rejects(
    service.confirm(
      completion!.id,
      credentials(completion, "confirm").token,
      true,
    ),
  );
});
test("a signed report cannot be overwritten or evidence forged through client rules", async () => {
  const r = await create();
  await submit(r);
  await service.confirm(r!.id, credentials(r, "confirm").token, true);
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/lucrari/work?updateMask.fieldPaths=raportSnapshot`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: { raportSnapshot: { mapValue: { fields: {} } } },
    }),
  });
  assert.equal(response.status, 403);
});
