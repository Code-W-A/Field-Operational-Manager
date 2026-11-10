/** Runs only inside test-invoice-xml's isolated Auth/Firestore emulators. Never loads .env. */
import assert from "node:assert/strict";
import type { Firestore } from "firebase-admin/firestore";
import type { SagaConfig } from "../lib/saga/config.server";
import { importPolicy } from "../lib/saga/import";
import { createInvoiceFinalizationService } from "../lib/invoicing/finalization.server";
import type { createInvoiceNumberingService } from "../lib/invoicing/numbering.server";
import type { createInvoiceXmlService } from "../lib/invoicing/xml.server";
import { createInvoiceSagaService } from "../lib/invoicing/saga-transfer.server";
import { isUninvoicedWork } from "../lib/reports/uninvoiced";
import {
  invoiceContent,
  type InvoiceDraftResponse,
} from "../lib/invoicing/draft";

type Actor = { uid: string; role: string };
export async function finalizationCases({
  db,
  config,
  actor,
  dispatcher,
  seed,
  numbering,
  xml,
  finalization,
  request,
  tokens,
  projectId,
  firestoreHost,
  work,
}: {
  db: Firestore;
  config: SagaConfig;
  actor: Actor;
  dispatcher: Actor;
  seed: (id: string) => Promise<InvoiceDraftResponse>;
  numbering: ReturnType<typeof createInvoiceNumberingService>;
  xml: ReturnType<typeof createInvoiceXmlService>;
  finalization: ReturnType<typeof createInvoiceFinalizationService>;
  request: (
    path: string,
    role?: string,
    body?: unknown,
    method?: string,
  ) => Promise<Response>;
  tokens: Record<string, string>;
  projectId: string;
  firestoreHost: string;
  work: Record<string, unknown>;
}) {
  assert.ok(projectId.startsWith("demo-"));
  const count = async () =>
    (await numbering.get(actor)).counter!.allocationCount;
  const before = await count();
  const preview = async (id: string, svc = finalization) => {
    const p = await svc.preview(actor, id, { expectedRevision: 1 });
    assert.ok("previewId" in p);
    return p as Extract<typeof p, { previewId: string }>;
  };
  const absent = async (id: string) => {
    assert.equal((await db.doc(`invoices/${id}`).get()).exists, false);
    assert.equal((await db.doc(`invoiceArtifacts/${id}`).get()).exists, false);
    assert.equal(
      (
        await db
          .collection("invoiceSagaSimulations")
          .where("workId", "==", id)
          .get()
      ).size,
      0,
    );
    assert.equal(
      (
        await db
          .collection("invoiceSagaTransfers")
          .where("workId", "==", id)
          .get()
      ).size,
      0,
    );
  };
  const conflict = (e: any) => e.status === 409;
  for (const id of [
    "final-cancel",
    "final-concurrent",
    "final-stale",
    "final-expired",
    "final-mode",
    "final-rollback",
    "final-stock",
    "final-legacy",
  ])
    await seed(id);
  for (const role of ["", "tehnician", "client"]) {
    for (const suffix of ["/preview", ""]) {
      const r = await request(
        `/api/lucrari/final-cancel/invoice-finalization${suffix}`,
        role,
        suffix
          ? { expectedRevision: 1 }
          : { previewId: "fake", operationId: "fake" },
      );
      assert.equal(r.status, role ? 403 : 401);
    }
  }
  const cancel = await preview("final-cancel");
  assert.equal(cancel.mode, "dry-run");
  assert.equal(cancel.groups[0].before, null);
  await absent("final-cancel");
  assert.equal(await count(), before);
  const quoteRef = db.doc(
    `sagaCatalogs/123456/finalizationPreviews/${cancel.previewId}`,
  );
  assert.equal((await quoteRef.get()).data()!.uid, actor.uid);
  for (const token of ["", tokens.admin])
    for (const method of ["GET", "PATCH"]) {
      const r = await fetch(
        `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${quoteRef.path}`,
        {
          method,
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            "Content-Type": "application/json",
          },
          body: method === "PATCH" ? "{}" : undefined,
        },
      );
      assert.equal(r.status, 403);
    }
  await assert.rejects(
    finalization.confirm(dispatcher, "final-cancel", {
      previewId: cancel.previewId,
      operationId: "foreign",
    }),
    conflict,
  );
  await assert.rejects(
    finalization.confirm(actor, "final-stale", {
      previewId: cancel.previewId,
      operationId: "wrong-work",
    }),
    conflict,
  );
  const stale = await preview("final-stale");
  await db.doc("invoiceDrafts/final-stale").update({ revision: 2 });
  await assert.rejects(
    finalization.confirm(actor, "final-stale", {
      previewId: stale.previewId,
      operationId: "stale",
    }),
    conflict,
  );
  await absent("final-stale");
  assert.equal(await count(), before);
  await db.doc("invoiceDrafts/final-stale").update({ revision: 1 });
  const issuerChange = await preview("final-stale");
  const issuerRef = db.doc("invoiceIssuerProfiles/123456"),
    issuer = (await issuerRef.get()).data()!;
  await issuerRef.update({ revision: issuer.revision + 1 });
  await assert.rejects(
    finalization.confirm(actor, "final-stale", {
      previewId: issuerChange.previewId,
      operationId: "issuer-change",
    }),
    conflict,
  );
  await absent("final-stale");
  assert.equal(await count(), before);
  await db.doc("users/admin").update({ disabled: true });
  await assert.rejects(
    finalization.confirm(actor, "final-cancel", {
      previewId: cancel.previewId,
      operationId: "disabled",
    }),
    (e: any) => e.status === 403,
  );
  await db.doc("users/admin").update({ disabled: false });
  const expired = await preview("final-expired");
  await db
    .doc(`sagaCatalogs/123456/finalizationPreviews/${expired.previewId}`)
    .update({ expiresAt: 0 });
  await assert.rejects(
    finalization.confirm(actor, "final-expired", {
      previewId: expired.previewId,
      operationId: "expired",
    }),
    conflict,
  );
  const base = { config: () => config };
  let mode = importPolicy({});
  const switching = createInvoiceFinalizationService(db, {
    ...base,
    policy: () => mode,
  });
  const mp = await preview("final-mode", switching);
  mode = { ...mode, mode: "production", enabled: true };
  await assert.rejects(
    switching.confirm(actor, "final-mode", {
      previewId: mp.previewId,
      operationId: "mode",
    }),
    conflict,
  );
  await absent("final-mode");

  // Failure of the queue write aborts the SAME transaction, including allocated counter/XML.
  const rollback = await preview("final-rollback");
  const failingDb = new Proxy(db, {
    get(target, key) {
      if (key === "runTransaction")
        return (fn: any) =>
          target.runTransaction(async (tx) => {
            const set = tx.set.bind(tx);
            tx.set = ((ref: any, ...args: any[]) => {
              if (ref.parent.id === "invoiceSagaSimulations")
                throw Error("Injected queue failure");
              return (set as any)(ref, ...args);
            }) as typeof tx.set;
            return fn(tx);
          });
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const failure = createInvoiceFinalizationService(failingDb, {
    ...base,
    policy: () => importPolicy({}),
  });
  await assert.rejects(
    failure.confirm(actor, "final-rollback", {
      previewId: rollback.previewId,
      operationId: "rollback",
    }),
    /Injected queue failure/,
  );
  await absent("final-rollback");
  assert.equal(await count(), before);
  assert.equal(
    (
      await db
        .doc(`sagaCatalogs/123456/finalizationPreviews/${rollback.previewId}`)
        .get()
    ).data()!.completed,
    undefined,
  );

  // Pretend-live transport is injected, never HTTP. Repeated lines must share one exact stock reading.
  const draftRef = db.doc("invoiceDrafts/final-stock"),
    draft = (await draftRef.get()).data()!;
  await draftRef.update({
    lines: [draft.lines[0], { ...draft.lines[0], id: "repeated" }],
  });
  let available = "1",
    failRead = false,
    reads = 0,
    imports = 0;
  const livePolicy = () =>
    importPolicy({
      SAGA_IMPORT_MODE: "production",
      SAGA_IMPORTS_ENABLED: "true",
    });
  const gateway = {
    readForInvoice: async (_actor: Actor, input: any) => {
      reads++;
      assert.equal(input.code, "0001");
      assert.equal(input.warehouse, "01");
      assert.equal(input.date, undefined);
      if (failRead) throw Error("mock stock error");
      return {
        quantity: available,
        checkedAt: new Date().toISOString(),
      } as any;
    },
    importForInvoice: async () => {
      imports++;
      throw Error("Imports forbidden in preview/confirm tests");
    },
  };
  const live = createInvoiceFinalizationService(db, {
    ...base,
    policy: livePolicy,
    gateway,
  });
  const low = await preview("final-stock", live);
  assert.equal(reads, 1);
  assert.equal(low.groups.length, 1);
  assert.equal(low.groups[0].expected, "2.5");
  assert.equal(low.canConfirm, false);
  assert.match(low.issues.join(" "), /insuficient/);
  await assert.rejects(
    live.confirm(actor, "final-stock", {
      previewId: low.previewId,
      operationId: "shortage",
    }),
    conflict,
  );
  failRead = true;
  const unavailable = await preview("final-stock", live);
  assert.equal(unavailable.groups[0].before, null);
  assert.equal(unavailable.canConfirm, false);
  await absent("final-stock");
  assert.equal(await count(), before);
  available = "10";
  failRead = false;
  const stocked = await preview("final-stock", live);
  assert.equal(stocked.canConfirm, true);
  const liveResult = await live.confirm(actor, "final-stock", {
    previewId: stocked.previewId,
    operationId: "live-mocked",
  });
  assert.equal(liveResult.transfer.groups[0].before, null); // Worker must recapture baseline, never reuse preview.
  assert.equal(liveResult.transfer.phase, "baseline");
  assert.equal(imports, 0);
  const stockWorker = createInvoiceSagaService(db, {
    ...base,
    policy: livePolicy,
    gateway,
  });
  available = "0";
  await stockWorker.process(liveResult.transfer.id, false);
  assert.equal(
    (await stockWorker.state(actor, "final-stock")).transfer!.phase,
    "blocked",
  );
  assert.equal(imports, 0);
  available = "10";
  const retryPreview = await preview("final-stock", live);
  const resumed = await live.confirm(actor, "final-stock", {
    previewId: retryPreview.previewId,
    operationId: "resume-baseline",
  });
  assert.equal(resumed.document.number, liveResult.document.number);
  assert.equal(resumed.transfer.id, liveResult.transfer.id);
  assert.equal(resumed.transfer.phase, "baseline");
  assert.equal(await count(), before + 1);
  const repeatResume = await live.confirm(actor, "final-stock", {
    previewId: retryPreview.previewId,
    operationId: "resume-baseline",
  });
  assert.equal(repeatResume.document.number, liveResult.document.number);

  const first = await preview("final-concurrent"),
    second = await preview("final-concurrent");
  const results = await Promise.all(
    [first, first, second].map((p, i) =>
      finalization.confirm(actor, "final-concurrent", {
        previewId: p.previewId,
        operationId: `concurrent-${i}`,
      }),
    ),
  );
  assert.equal(new Set(results.map((r) => r.document.number)).size, 1);
  assert.equal(new Set(results.map((r) => r.transfer.id)).size, 1);
  assert.equal(await count(), before + 2);
  const bytes = await xml.download(actor, "final-concurrent");
  assert.equal(
    (await db.doc("invoiceArtifacts/final-concurrent").get()).data()!.xml,
    bytes.xml,
  );
  const retry = await finalization.confirm(actor, "final-concurrent", {
    previewId: first.previewId,
    operationId: "retry-lost-response",
  });
  assert.deepEqual(retry.document, results[0].document);
  assert.equal(retry.transfer.id, results[0].transfer.id);
  const reopened = await finalization.preview(dispatcher, "final-concurrent", {
    expectedRevision: 1,
  });
  assert.ok("alreadyStarted" in reopened);
  assert.equal(await count(), before + 2);
  // Prepared historical XML is used byte-for-byte and never consumes an additional number.
  const historical = await xml.preview(actor, "final-legacy", {
    expectedRevision: 1,
  });
  assert.ok("previewHash" in historical);
  const original = await xml.prepare(actor, "final-legacy", {
    expectedRevision: 1,
    previewHash: (historical as any).previewHash,
    operationId: "legacy",
  });
  const originalBytes = await xml.download(actor, "final-legacy");
  const hp = await preview("final-legacy");
  assert.equal(hp.prepared, true);
  const reused = await finalization
    .confirm(dispatcher, "final-legacy", {
      previewId: hp.previewId,
      operationId: "other-user",
    })
    .catch((e) => {
      assert.equal(e.status, 409);
      return null;
    });
  assert.equal(reused, null);
  const preserved = await finalization.confirm(actor, "final-legacy", {
    previewId: hp.previewId,
    operationId: "historical",
  });
  assert.deepEqual(preserved.document, original.document);
  assert.equal(
    (await xml.download(actor, "final-legacy")).xml,
    originalBytes.xml,
  );
  assert.equal(await count(), before + 3);
  for (const id of ["final-concurrent", "final-stock", "final-legacy"]) {
    assert.deepEqual((await db.doc(`lucrari/${id}`).get()).data(), work);
    assert.equal(
      isUninvoicedWork((await db.doc(`lucrari/${id}`).get()).data()),
      true,
    );
  }
  assert.equal((await db.collection("sagaConnections").get()).size, 0);
  assert.equal(imports, 0);
  console.log(
    "PASS unified finalization: authorization/private quotes, ownership, cancel, expiry/mode/revision conflicts, cumulative shortage/read errors, transaction rollback on queue failure, concurrent confirms/retry, recovery after commit, pre-import shortage/resume, original historical bytes, unchanged accounting; zero external traffic.",
  );
}
