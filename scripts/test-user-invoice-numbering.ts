import { numberingHandlers } from "../lib/invoicing/numbering-http";
import { createSagaReferencesService } from "../lib/saga/references.server";
/** Isolated Auth + Firestore emulators, real HTTP handlers/service and editor.
 * No production credentials or live SAGA calls. Upstream transport is injected; Auth/Firestore and UI are real. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { sagaConfig } from "../lib/saga/config.server";

import { createSagaCatalogService } from "../lib/saga/catalog.server";
import { createInvoiceDraftService } from "../lib/invoicing/service";
import { invoiceDraftHandlers } from "../lib/invoicing/http";
import { randomUUID, createHash } from "node:crypto";
import { createInvoiceNumberingService } from "../lib/invoicing/numbering.server";
import { InvoiceNumberingError } from "../lib/invoicing/numbering";
import { createInvoiceXmlService } from "../lib/invoicing/xml.server";
import { invoiceXmlHandlers } from "../lib/invoicing/xml-http";
import { issuerFixture, contentFixture } from "../lib/invoicing/xml.fixtures";
import { isUninvoicedWork } from "../lib/reports/uninvoiced";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-user-numbering",
  firestoreHost = "127.0.0.1:8388",
  authHost = "127.0.0.1:9388";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8388 },
          auth: { host: "127.0.0.1", port: 9388 },
          hub: { port: 4488 },
          logging: { port: 4588 },
          ui: { enabled: false },
          singleProjectMode: true,
        },
      }),
    );
    const child = spawn(
      "firebase",
      [
        "emulators:exec",
        "--config",
        config,
        "--project",
        projectId,
        "--only",
        "auth,firestore",
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-user-invoice-numbering.ts")}\"`,
      ],
      {
        cwd: directory,
        env: {
          ...process.env,
          DEBUG: "",
          GCLOUD_PROJECT: projectId,
          FIREBASE_EMULATORS_PATH: path.join(root, ".firebase-emulators"),
        },
        stdio: "inherit",
      },
    );
    const code = await new Promise<number>((resolve) =>
      child.on("exit", (c) => resolve(c || 0)),
    );
    process.exitCode = code;
    return;
  }
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, firestoreHost);
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, authHost);
  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  const app = initializeApp({ projectId }, "invoice-xml-test"),
    db = getFirestore(app),
    auth = getAuth(app);
  let server: ReturnType<typeof createServer> | undefined,
    browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    const tokens: Record<string, string> = {};
    for (const role of ["admin", "dispecer", "tehnician", "client"]) {
      await auth.createUser({
        uid: role,
        email: `${role}@invoice.test`,
        password: "InvoiceTest123!",
      });
      await db.doc(`users/${role}`).set({ role, displayName: role });
      const signed = await fetch(
        `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `${role}@invoice.test`,
            password: "InvoiceTest123!",
            returnSecureToken: true,
          }),
        },
      ).then((r) => r.json());
      tokens[role] = signed.idToken;
    }
    const config = sagaConfig({
      SAGA_READS_ENABLED: "true",
      SAGA_API_KEY: "unused-local-fixture",
      SAGA_COD_FISCAL: "123456",
      SAGA_API_BASE_URL: "https://web.sagasoft.ro/api/v20260225",
      SAGA_TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      assert.ok(
        ["localhost", "127.0.0.1"].includes(
          new URL(
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.href
                : input.url,
          ).hostname,
        ),
        "No external HTTP traffic",
      );
      return originalFetch(input, init);
    };
    const actor = { uid: "admin", role: "admin" },
      dispatcher = { uid: "dispecer", role: "dispecer" };
    const service = createInvoiceXmlService(db, () => config),
      numbering = createInvoiceNumberingService(db, () => config);
    const catalog = createSagaCatalogService(
      db,
      async () => {
        throw new Error("NO SAGA");
      },
      () => config,
    );
    const draftService = createInvoiceDraftService(
      db,
      () => new Date("2026-11-07T12:00:00Z"),
      catalog,
    );
    const authenticate = async (r: Request) => {
      const token = r.headers.get("Authorization")?.replace(/^Bearer /, "");
      if (!token)
        throw new InvoiceNumberingError(
          "UNAUTHENTICATED",
          "Autentificare necesară.",
          401,
        );
      const u = await auth.verifyIdToken(token);
      return {
        uid: u.uid,
        role: (await db.doc(`users/${u.uid}`).get()).data()?.role || "",
      };
    };
    const handlers = invoiceXmlHandlers(service, authenticate),
      drafts = invoiceDraftHandlers(draftService, authenticate);
    const work = {
      clientId: "c",
      client: "Client",
      preluatDispecer: true,
      statusFacturare: "Nefacturat",
      nrLucrare: "TEST",
      raportGenerat: true,
      raportSnapshot: { dataGenerare: "2026-11-07", products: [] },
    };
    const rootCatalog = db.doc("sagaCatalogs/123456");
    await db
      .doc("clienti/c")
      .set({ nume: "Client", cui: "RO123", adresa: "Adresă" });
    const entry = {
      id: "s",
      code: "0002",
      name: "Client",
      taxId: "RO123",
      country: "RO",
      revision: 1,
      source: "fixture.csv",
      importedAt: "now",
      updatedBy: "admin",
    };
    const link = {
      clientId: "c",
      sagaClientId: "s",
      sagaRevision: 1,
      country: "RO",
      fomTaxId: "123",
      missingTaxConfirmed: false,
      active: true,
      revision: 1,
      updatedAt: "now",
      updatedBy: "admin",
    };
    await rootCatalog.collection("clients").doc("s").set(entry);
    await rootCatalog.collection("clientLinks").doc("c").set(link);
    const product = {
      id: "p",
      name: "Piesă",
      code: "0001",
      articleName: "Piesă",
      unit: "buc",
      kind: "goods",
      warehouseIds: ["g"],
      active: true,
      revision: 1,
      verifiedAt: "now",
      updatedAt: "now",
      updatedBy: "admin",
    };
    const warehouse = {
      id: "g",
      code: "01",
      name: "Depozit",
      active: true,
      revision: 1,
      updatedAt: "now",
      updatedBy: "admin",
    };
    await rootCatalog.collection("products").doc("p").set(product);
    await rootCatalog.collection("warehouses").doc("g").set(warehouse);
    async function seed(id: string) {
      await db.doc(`lucrari/${id}`).set(work);
      return draftService.put(
        id,
        { expectedRevision: 0, content: contentFixture() },
        actor,
      );
    }
    const numbers = numberingHandlers(numbering, authenticate);
    async function dispatch(r: Request) {
      const url = new URL(r.url),
        p = url.pathname,
        id = p.split("/")[3];
      if (p.endsWith("/numbering/users/preview"))
        return numbers.usersPreview(r);
      if (p.endsWith("/numbering/users/activate"))
        return numbers.usersActivate(r);
      if (p.includes("/numbering/users")) return numbers.usersList(r);
      if (p.endsWith("/numbering")) return numbers.get(r);
      if (p.endsWith("/number")) return numbers.estimate(r, id);
      if (p.endsWith("/invoice-xml/preview")) return handlers.preview(r, id);
      if (p.endsWith("/invoice-xml"))
        return r.method === "POST"
          ? handlers.prepare(r, id)
          : handlers.document(r, id);
      if (p.endsWith("/catalog"))
        return Response.json({
          fiscalCode: "123456",
          products: [product],
          warehouses: [warehouse],
        });
      if (p.endsWith("/client-association"))
        return Response.json({
          fiscalCode: "123456",
          clientId: "c",
          clientName: "Client",
          taxId: "123",
          revision: 1,
          link,
          entry,
          issues: [],
        });
      if (p.includes("/invoice-draft"))
        return drafts[r.method === "PUT" ? "PUT" : "GET"](r, {
          params: Promise.resolve({ id }),
        });
      return Response.json({
        mode: "dry-run",
        canStart: true,
        reason: "",
        transfer: null,
      });
    }
    async function request(p: string, role = "admin", body?: unknown) {
      return dispatch(
        new Request("http://localhost" + p, {
          method: body ? "POST" : "GET",
          headers: tokens[role]
            ? { Authorization: "Bearer " + tokens[role] }
            : { Cookie: "userRole=admin" },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    }
    const refs = createSagaReferencesService(
      db,
      async () => {
        throw new Error("No SAGA traffic");
      },
      () => config,
    );
    // Create reference profiles through the actual stage-1 service, not private numbering writes.
    const agent = {
      id: "agent",
      kind: "agents",
      code: "0004",
      name: "Agent",
      revision: 1,
    };
    await rootCatalog.collection("referenceItems").doc("agent").set(agent);
    async function profile(
      uid: string,
      prefix: string,
      lastVerifiedNumber = "0000",
    ) {
      return refs.saveProfile(actor, uid, {
        expectedRevision: 0,
        prefix,
        lastVerifiedNumber,
        agentId: "agent",
        agentRevision: 1,
        exclusiveConfirmed: true,
        lastNumberConfirmed: true,
      });
    }
    await profile("admin", "NRGA F26");
    await profile("dispecer", "NRGV F26");
    const numberInput = {
      expectedRevision: 0,
      prefix: "OLD",
      lastVerifiedNumber: "000125",
      reason: "",
      exclusiveConfirmed: true,
      sagaVerified: true,
    };
    const np = await numbering.preview(actor, numberInput);
    await numbering.put(actor, {
      ...numberInput,
      confirmationHash: np.confirmationHash,
    });
    await service.saveProfile(actor, {
      expectedRevision: 0,
      profile: issuerFixture,
    });
    await seed("historical");
    let hp = await service.preview(actor, "historical", {
      expectedRevision: 1,
    });
    assert.ok("previewHash" in hp);
    if (!("previewHash" in hp)) throw Error();
    const historical = (
      await service.prepare(actor, "historical", {
        expectedRevision: 1,
        previewHash: hp.previewHash,
        operationId: "historical-op",
      })
    ).document;
    const oldArtifact = (
      await db.doc("invoiceArtifacts/historical").get()
    ).data();
    assert.equal(historical.number, "OLD000126");
    const adminProfile = (await refs.profile(actor, "admin")).profile!,
      dispatchProfile = (await refs.profile(actor, "dispecer")).profile!;
    const activateInput = {
      expectedRevision: 0,
      profiles: [
        { uid: "admin", expectedRevision: adminProfile.revision },
        { uid: "dispecer", expectedRevision: dispatchProfile.revision },
      ],
    };
    const base = "/api/integrations/saga/numbering/users";
    assert.equal((await request(base, "")).status, 401);
    for (const role of ["dispecer", "tehnician", "client"])
      assert.equal((await request(base, role)).status, 403);
    assert.equal(
      (await request(base + "/preview", "dispecer", activateInput)).status,
      403,
    );
    const ap = await numbering.users.preview(actor, activateInput);
    assert.equal(
      (await db.collection("invoiceCounters").get()).size,
      1,
      "Activation preview writes no counters",
    );
    const active = await numbering.users.activate(actor, {
      ...activateInput,
      confirmationHash: ap.confirmationHash,
    });
    assert.equal(active.revision, 1);
    assert.equal((await db.collection("invoiceCounters").get()).size, 3);
    assert.equal(
      (await numbering.estimate(actor, "historical")).number,
      "OLD000126",
    );
    assert.equal(
      (
        await service.prepare(dispatcher, "historical", {
          expectedRevision: 1,
          previewHash: hp.previewHash,
          operationId: "retry-other",
        })
      ).document.sha256,
      historical.sha256,
    );
    assert.deepEqual(
      (await db.doc("invoiceArtifacts/historical").get()).data(),
      oldArtifact,
    );
    await assert.rejects(
      () => numbering.put(actor, { ...numberInput, expectedRevision: 1 }),
      (e) => (e as InvoiceNumberingError).code === "USER_MODE_ACTIVE",
    );
    const pr = (await refs.profile(actor, "admin")).profile!;
    await assert.rejects(
      () =>
        refs.saveProfile(actor, "admin", {
          ...pr,
          prefix: "CHANGED",
          expectedRevision: pr.revision,
          exclusiveConfirmed: true,
          lastNumberConfirmed: true,
        }),
      (e) => (e as { status: number }).status === 409,
    );
    await assert.rejects(() =>
      refs.saveProfile(actor, "admin", {
        ...pr,
        lastVerifiedNumber: "0001",
        expectedRevision: pr.revision,
        exclusiveConfirmed: true,
        lastNumberConfirmed: true,
      }),
    );
    for (const name of [
      "a",
      "b",
      "c",
      "missing",
      "rollback",
      "orphan",
      "stale",
      "browser",
    ])
      await seed(name);
    assert.equal((await numbering.estimate(actor, "a")).number, "NRGA F260001");
    assert.equal(
      (await numbering.estimate(dispatcher, "a")).number,
      "NRGV F260001",
    );
    const countersBefore = (
      await db.collection("invoiceCounters").get()
    ).docs.map((d) => d.data());
    await draftService.put(
      "a",
      { expectedRevision: 1, content: contentFixture() },
      actor,
    );
    assert.deepEqual(
      (await db.collection("invoiceCounters").get()).docs.map((d) => d.data()),
      countersBefore,
      "Saving drafts consumes no number",
    );
    const preview = async (id: string, who = actor, revision = 1) => {
      const p = await service.preview(who, id, { expectedRevision: revision });
      if (!("previewHash" in p)) throw Error("Expected preview");
      return p;
    };
    const prepare = async (
      id: string,
      p: Awaited<ReturnType<typeof preview>>,
      who = actor,
    ) =>
      service.prepare(who, id, {
        expectedRevision: p.snapshot.draftRevision,
        previewHash: p.previewHash,
        operationId: randomUUID(),
      });
    const forged = await request(
      "/api/lucrari/a/invoice-xml/preview",
      "admin",
      { expectedRevision: 2, uid: "dispecer", prefix: "NRGV F26" },
    );
    assert.equal(forged.status, 200);
    assert.equal((await forged.json()).snapshot.numbering.uid, "admin");
    const a = await preview("a", actor, 2);
    assert.equal(a.snapshot.numbering?.uid, "admin");
    await assert.rejects(
      () => prepare("a", a, dispatcher),
      (e) => (e as { status: number }).status === 409,
    );
    const b = await preview("b");
    const parallel = await Promise.allSettled([
      prepare("a", a),
      prepare("b", b),
    ]);
    assert.equal(parallel.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      parallel.filter(
        (r) =>
          r.status === "rejected" &&
          (r.reason as { status: number }).status === 409,
      ).length,
      1,
    );
    const second = parallel[0].status === "fulfilled" ? "b" : "a";
    const document2 = (
      await prepare(
        second,
        await preview(second, actor, second === "a" ? 2 : 1),
      )
    ).document;
    assert.equal(document2.number, "NRGA F260002");
    const cp = await preview("c", dispatcher),
      cd = (await prepare("c", cp, dispatcher)).document;
    assert.equal(cd.number, "NRGV F260001");
    assert.equal(cd.snapshot.numbering?.uid, "dispecer");
    const retry = await Promise.all([
      prepare("c", cp, actor),
      prepare("c", cp, dispatcher),
    ]);
    assert.ok(retry.every((r) => r.document.sha256 === cd.sha256));
    await db.doc("users/unconfigured").set({ role: "dispecer" });
    const missing = { uid: "unconfigured", role: "dispecer" };
    assert.equal((await numbering.estimate(missing, "missing")).number, null);
    await assert.rejects(() => preview("missing", missing));
    await db.doc("users/admin").update({ disabled: true });
    await assert.rejects(
      () => preview("missing"),
      (e) => (e as { status: number }).status === 403,
    );
    await db.doc("users/admin").update({ disabled: false });
    // User/profile edits invalidate the confirmation. The source invoice remains editable.
    const stale = await preview("stale"),
      live = (await refs.profile(actor, "admin")).profile!;
    await refs.saveProfile(actor, "admin", {
      ...live,
      expectedRevision: live.revision,
      exclusiveConfirmed: true,
      lastNumberConfirmed: true,
    });
    await assert.rejects(
      () => prepare("stale", stale),
      (e) => (e as { status: number }).status === 409,
    );
    // Failed XML size check rolls back the allocator and artifact together.
    const rollback = (await db.doc("invoiceDrafts/rollback").get()).data()!;
    rollback.notes = "x";
    await db
      .doc("invoiceDrafts/rollback")
      .update({ "references.ticketNumber": "x".repeat(600000) });
    const rp = await preview("rollback");
    const current = (await numbering.get(actor)).counter!;
    await assert.rejects(() => prepare("rollback", rp));
    assert.equal(
      (await numbering.get(actor)).counter!.lastNumber,
      current.lastNumber,
    );
    assert.equal((await db.doc("invoices/rollback").get()).exists, false);
    // Orphan reservation must never be reused with a different preview/profile snapshot.
    await numbering.reserve(actor, {
      workId: "orphan",
      operationId: "orphan",
      expectedDraftRevision: 1,
    });
    const op = await preview("orphan");
    const beforeOrphan = (await numbering.get(actor)).counter!.lastNumber;
    await assert.rejects(
      () => prepare("orphan", op),
      (e) => (e as { code: string }).code === "RESERVATION_RECONCILIATION",
    );
    assert.equal(
      (await numbering.get(actor)).counter!.lastNumber,
      beforeOrphan,
    );
    const state = await numbering.users.list(actor);
    const correction = {
      expectedRevision: state.revision,
      profiles: [],
      correction: {
        uid: "admin",
        lastVerifiedNumber: "0010",
        reason: "Valoare verificată de test",
      },
    };
    const corr = await numbering.users.preview(actor, correction);
    await numbering.users.activate(actor, {
      ...correction,
      confirmationHash: corr.confirmationHash,
    });
    assert.equal(
      (await numbering.estimate(actor, "missing")).number,
      "NRGA F260011",
    );
    await assert.rejects(() =>
      numbering.users.preview(actor, {
        ...correction,
        expectedRevision: 2,
        correction: { ...correction.correction, lastVerifiedNumber: "0001" },
      }),
    );
    const alt = createInvoiceNumberingService(db, () => ({
      ...config,
      fiscalCode: "654321",
    }));
    assert.equal((await alt.get(actor)).config, null);
    await assert.rejects(() =>
      alt.users.activate(actor, {
        ...correction,
        confirmationHash: corr.confirmationHash,
      }),
    );
    // Existing seed mismatch rejects activation without resetting a counter.
    await db.doc("users/extra").set({ role: "admin" });
    await profile("extra", "EXTRA", "0000");
    const extraProfile = (await refs.profile(actor, "extra")).profile!;
    const counterId = createHash("sha256")
      .update(JSON.stringify(["123456", "EXTRA"]))
      .digest("hex");
    await db.doc(`invoiceCounters/${counterId}`).set({
      fiscalCode: "123456",
      prefix: "EXTRA",
      lastNumber: "5",
      width: 4,
      revision: 1,
      allocationCount: 1,
      updatedAt: "now",
    });
    await assert.rejects(
      () =>
        numbering.users.preview(actor, {
          expectedRevision: 2,
          profiles: [{ uid: "extra", expectedRevision: extraProfile.revision }],
        }),
      /nu corespunde/,
    );
    const existingExtra = (
      await db.doc(`invoiceCounters/${counterId}`).get()
    ).data();
    await refs.saveProfile(actor, "extra", {
      ...extraProfile,
      expectedRevision: extraProfile.revision,
      lastVerifiedNumber: "0005",
      exclusiveConfirmed: true,
      lastNumberConfirmed: true,
    });
    const correctedExtra = (await refs.profile(actor, "extra")).profile!;
    const reuseInput = {
      expectedRevision: 2,
      profiles: [{ uid: "extra", expectedRevision: correctedExtra.revision }],
    };
    const reusePreview = await numbering.users.preview(actor, reuseInput);
    await numbering.users.activate(actor, {
      ...reuseInput,
      confirmationHash: reusePreview.confirmationHash,
    });
    assert.deepEqual(
      (await db.doc(`invoiceCounters/${counterId}`).get()).data(),
      existingExtra,
      "Existing matching counter is reused without any reset",
    );
    const disabled = createInvoiceNumberingService(db, () => ({
      ...config,
      readsEnabled: false,
    }));
    await assert.rejects(
      () =>
        disabled.users.activate(actor, {
          ...reuseInput,
          confirmationHash: reusePreview.confirmationHash,
        }),
      (e) => (e as InvoiceNumberingError).code === "NUMBERING_DISABLED",
    );
    for (const p of [
      "invoiceNumbering/123456/userNumbering/mode",
      "sagaCatalogs/123456/issuerProfiles/admin",
      `invoiceCounters/${counterId}`,
    ]) {
      const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${p}`;
      assert.equal(
        (
          await fetch(url, {
            headers: { Authorization: `Bearer ${tokens.admin}` },
          })
        ).status,
        403,
      );
    }
    assert.deepEqual(
      (await db.doc("invoiceArtifacts/historical").get()).data(),
      oldArtifact,
    );
    assert.equal(
      (await db.doc("lucrari/c").get()).data()!.statusFacturare,
      "Nefacturat",
    );
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    console.log(
      "PASS user numbering API/emulator: activation, independent counters, concurrency, UID binding, missing/disabled profiles, preview conflicts, immutable seeds, forward correction, rollback, orphan reconciliation, legacy history, firm isolation and private Firestore; no SAGA traffic.",
    );
    // A new profile is activated from the actual admin UI below.
    await db
      .doc("users/browser-admin")
      .set({ role: "admin", displayName: "Browser operator" });
    await profile("browser-admin", "BROWSER F26");
    await assert.rejects(
      () => preview("browser", { uid: "browser-admin", role: "admin" }),
      (e) =>
        (e as { status: number }).status === 400 ||
        (e as { status: number }).status === 409,
    );
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{UserInvoiceNumberingSettings}from'./components/settings/user-invoice-numbering-settings';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';createRoot(document.getElementById('root')).render(<main style={{padding:16,minHeight:1500}}>{location.pathname==='/ticket'?<InvoiceDraftSection workId="browser" work={window.testWork}/>:<UserInvoiceNumberingSettings/>}</main>);`,
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      format: "iife",
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "fixture-auth",
          setup(b) {
            b.onResolve({ filter: /^@\/contexts\/AuthContext$/ }, () => ({
              path: "auth",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export const useAuth=()=>({user:{uid:window.testRole,getIdToken:async()=>window.testToken}})`,
              loader: "tsx",
            }));
          },
        },
      ],
    });
    const postcss = (await import("postcss")).default,
      tailwind = (await import("tailwindcss")).default,
      tw = (await import("../tailwind.config")).default;
    const css = await postcss([
      tailwind({
        ...tw,
        content: [
          path.join(root, "components/invoicing/**/*.tsx"),
          path.join(
            root,
            "components/settings/user-invoice-numbering-settings.tsx",
          ),
          path.join(root, "components/ui/{button,input}.tsx"),
        ],
      }),
    ]).process(await readFile(path.join(root, "app/globals.css"), "utf8"), {
      from: path.join(root, "app/globals.css"),
    });
    server = createServer(async (req, res) => {
      try {
        if (req.url?.startsWith("/api/")) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const result = await dispatch(
            new Request("http://localhost" + req.url, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: ["PUT", "POST"].includes(req.method!)
                ? Buffer.concat(chunks).toString()
                : undefined,
            }),
          );
          res.writeHead(result.status, Object.fromEntries(result.headers));
          res.end(await result.text());
          return;
        }
        if (req.url === "/app.js") {
          res.setHeader("Content-Type", "text/javascript");
          res.end(bundle.outputFiles[0].text);
          return;
        }
        const role = req.url === "/ticket" ? "dispecer" : "admin";
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css} html,body{height:auto;overflow-x:visible}</style><div id="root"></div><script>window.testRole=${JSON.stringify(role)};window.testToken=${JSON.stringify(tokens[role])};window.testWork=${JSON.stringify(work)};</script><script src="/app.js"></script>`,
        );
      } catch (e) {
        res.statusCode = 500;
        res.end(String(e));
      }
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1100 },
      }),
      errors: string[] = [];
    page.setDefaultTimeout(12000);
    await page.route("**/*", (route) => {
      const hostname = new URL(route.request().url()).hostname;
      if (!["localhost", "127.0.0.1"].includes(hostname)) {
        errors.push(`External browser traffic blocked: ${hostname}`);
        return route.abort();
      }
      return route.continue();
    });
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGE ERROR", e.message);
    });
    page.on("response", async (r) => {
      if (r.url().includes("/api/") && !r.ok())
        console.log("HTTP ERROR", r.url(), r.status(), await r.text());
    });
    await page.goto(url);
    const adminPanel = page.getByRole("region", {
      name: "Numerotare pe utilizator",
    });
    await adminPanel.getByLabel(/Browser operator/).check();
    await adminPanel
      .getByRole("button", { name: "Previzualizează activarea", exact: true })
      .click();
    await expect(
      adminPanel.getByRole("group", {
        name: "Confirmare numerotare utilizator",
      }),
    ).toContainText("BROWSER F260001");
    await adminPanel
      .getByRole("button", {
        name: "Confirmă activarea numerotării",
        exact: true,
      })
      .click();
    await expect(adminPanel.getByRole("status")).toContainText(
      "Niciun număr nu a fost rezervat",
    );
    await page.goto(url + "/ticket");
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await expect(
      page.getByRole("region", { name: "Numărul facturii" }),
    ).toContainText("NRGV F260002");
    await expect(
      page.getByRole("region", { name: "Numărul facturii" }),
    ).toContainText("dispecer");
    await page
      .getByRole("button", { name: "Pregătește XML", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare XML" }),
    ).toContainText("Serie: NRGV F26");
    await page
      .getByRole("button", { name: "Confirmă pregătirea XML", exact: true })
      .click();
    await expect(
      page.getByText("Document XML pregătit în FOM", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await expect(
      page.getByText("Număr: NRGV F260002", { exact: true }),
    ).toBeVisible();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(
        page.getByText("Număr: NRGV F260002", { exact: true }),
      ).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: "/tmp/fom-user-numbering-ticket-mobile.png",
      fullPage: true,
    });
    await page.goto(url);
    await expect(
      adminPanel.getByText("Profil activ", { exact: false }).first(),
    ).toBeVisible();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: "/tmp/fom-user-numbering-settings-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    assert.deepEqual(
      (await db.doc("invoiceArtifacts/historical").get()).data(),
      oldArtifact,
    );
    console.log(
      "PASS user numbering browser: explicit admin activation, issuer/series estimate, floating editor preview/prepare/reopen, narrow 320/390px. No SAGA traffic.",
    );
  } finally {
    await browser?.close();
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await deleteApp(app);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
