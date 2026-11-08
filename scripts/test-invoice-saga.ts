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

import { createInvoiceSagaService } from "../lib/invoicing/saga-transfer.server";
import { invoiceSagaHandlers } from "../lib/invoicing/saga-transfer-http";
import { createSagaService } from "../lib/saga/service.server";
import { importPolicy, type SagaImportResult } from "../lib/saga/import";
import { SagaError } from "../lib/saga/contracts";
import { preparedFixture } from "../lib/invoicing/saga-transfer.fixtures";
import { invoiceXml } from "../lib/invoicing/xml";
import { digest } from "../lib/invoicing/saga-artifact.server";
import { isUninvoicedWork } from "../lib/reports/uninvoiced";
import { decryptToken } from "../lib/saga/crypto.server";
import type { SagaTransfer } from "../lib/invoicing/saga-transfer";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-invoice-saga",
  firestoreHost = "127.0.0.1:8392",
  authHost = "127.0.0.1:9392";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8392 },
          auth: { host: "127.0.0.1", port: 9392 },
          hub: { port: 4492 },
          logging: { port: 4592 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-invoice-saga.ts")}\"`,
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
  const app = initializeApp({ projectId }, "invoice-saga-test"),
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
    let clock = Date.parse("2026-11-08T10:00:00Z"),
      scenario = "success",
      stock = "10",
      expectedToken = config.apiKey,
      rotations = 0,
      posts = 0,
      gets = 0,
      lastFile = "";
    const policy = importPolicy({
      SAGA_IMPORT_MODE: "test",
      SAGA_IMPORTS_ENABLED: "true",
      SAGA_TEST_COD_FISCAL: config.fiscalCode,
      SAGA_TEST_FIRM_CONFIRMED: "true",
      SAGA_STOCK_CHECK_INTERVAL_MS: "1000",
    });
    const calls: { method: string; url: string }[] = [];
    const gateway = createSagaService(db, {
      config: () => config,
      importPolicy: () => policy,
      now: () => clock,
      fetch: async (input, init) => {
        const url = new URL(String(input)),
          headers = new Headers(init?.headers);
        assert.equal(url.origin, "https://web.sagasoft.ro");
        assert.equal(headers.get("Authorization"), `Bearer ${expectedToken}`);
        assert.equal(headers.get("X-Saga-Cod-Fiscal"), "123456");
        assert.equal(init?.redirect, "manual");
        calls.push({ method: init?.method || "GET", url: url.href });
        const old = expectedToken,
          refresh = `fixture-rotation-${++rotations}`;
        expectedToken = refresh;
        if (init?.method === "POST") {
          posts++;
          assert.equal(url.pathname, "/api/v20260225/Import");
          const form = init.body as FormData;
          assert.equal(form.get("importAutomat"), "true");
          const file = form.get("file") as File;
          assert.ok(file.name.startsWith("F_123456_"));
          lastFile = await file.text();
          if (scenario === "timeout") {
            stock = "8";
            throw new DOMException("timeout", "AbortError");
          }
          if (scenario === "success") stock = "8";
          if (scenario === "partial") stock = "9";
          const status =
            scenario === "partial"
              ? 207
              : ["failed", "large_report", "oversize_report"].includes(scenario)
                ? 422
                : scenario === "bad400"
                  ? 400
                  : 200;
          const body = [
            "partial",
            "failed",
            "large_report",
            "oversize_report",
          ].includes(scenario)
            ? `${scenario === "large_report" ? "X".repeat(400000) : scenario === "oversize_report" ? "X".repeat(1100000) : ""}Raport de import ${scenario}: ${old} ${refresh} ${config.apiKey}`
            : scenario === "bad400"
              ? '{"success":false}'
              : scenario === "ambiguous"
                ? "OK"
                : JSON.stringify({ success: true });
          return new Response(body, {
            status,
            headers: { "X-Saga-Refresh-Token": refresh },
          });
        }
        gets++;
        assert.equal(url.pathname, "/api/v20260225/Situatii/GetStocArticol");
        assert.equal(url.searchParams.get("codArticol"), "0001");
        assert.equal(url.searchParams.get("gestiune"), "01");
        assert.equal(url.searchParams.has("data"), false);
        return Response.json(
          scenario === "read_error"
            ? { success: false, message: "not available" }
            : { success: true, data: stock },
          { headers: { "X-Saga-Refresh-Token": refresh } },
        );
      },
    });
    const service = createInvoiceSagaService(db, {
      config: () => config,
      policy: () => policy,
      now: () => clock,
      gateway,
    });
    const mockPolicy = importPolicy({});
    const mock = createInvoiceSagaService(db, {
      config: () => config,
      policy: () => mockPolicy,
      now: () => clock,
      gateway: {
        readForInvoice: async () => {
          throw new Error("dry-run cannot call gateway");
        },
        importForInvoice: async () => {
          throw new Error("dry-run cannot call gateway");
        },
      },
    });
    const work = {
      clientId: "c",
      client: "Client",
      preluatDispecer: true,
      statusFacturare: "Nefacturat",
      nrLucrare: "TEST",
      raportGenerat: true,
    };
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
    };
    const warehouse = {
      id: "g",
      code: "01",
      name: "Depozit",
      active: true,
      revision: 1,
    };
    await db.doc("clienti/c").set({ nume: "Client", cui: "RO123" });
    await db.doc("sagaCatalogs/123456/clients/s").set(entry);
    await db.doc("sagaCatalogs/123456/clientLinks/c").set(link);
    await db.doc("sagaCatalogs/123456/products/p").set(product);
    await db.doc("sagaCatalogs/123456/warehouses/g").set(warehouse);
    async function seed(workId: string) {
      const d = preparedFixture(workId, "2"),
        xml = invoiceXml(d.snapshot, d.number).xml;
      await db.doc(`invoices/${workId}`).set(d);
      await db
        .doc(`invoiceArtifacts/${workId}`)
        .set({ xml, sha256: d.sha256, fiscalCode: d.fiscalCode });
      await db.doc(`lucrari/${workId}`).set(work);
      return d;
    }
    const authenticate = async (r: Request) => {
      const token = r.headers.get("Authorization")?.replace(/^Bearer /, "");
      if (!token)
        throw new SagaError("UNAUTHENTICATED", "Autentificare necesară.", 401);
      const u = await auth.verifyIdToken(token);
      return {
        uid: u.uid,
        role: (await db.doc(`users/${u.uid}`).get()).data()?.role || "",
      };
    };
    const handlers = invoiceSagaHandlers(service, authenticate),
      mockHandlers = invoiceSagaHandlers(mock, authenticate);
    const req = (
      workId: string,
      action = "get",
      role = "admin",
      body?: unknown,
    ) =>
      handlers[action as keyof typeof handlers](
        new Request(`http://localhost/api/lucrari/${workId}/invoice-saga`, {
          method: body ? "POST" : "GET",
          headers: role
            ? { Authorization: `Bearer ${tokens[role]}` }
            : { Cookie: "userRole=admin" },
          body: body ? JSON.stringify(body) : undefined,
        }),
        workId,
      );
    const start = async (workId: string) => {
      const d = (await db.doc(`invoices/${workId}`).get()).data()!;
      return service.start(actor, workId, {
        sha256: d.sha256,
        operationId: `op-${workId}`,
      });
    };
    async function drain(workId: string, target = service, sim = false) {
      for (let step = 0; step < 30; step++) {
        const v = (await target.state(actor, workId)).transfer!;
        if (!["baseline", "ready", "sending", "after"].includes(v.phase))
          return v;
        clock = Math.max(clock, v.nextAt);
        await target.process(v.id, sim);
      }
      throw new Error("worker did not finish");
    }
    async function reset(next: string, quantity = "10") {
      scenario = next;
      stock = quantity;
      await db.doc("sagaConnections/123456").delete();
      expectedToken = config.apiKey;
    }
    const d = await seed("success");
    await assert.rejects(
      createInvoiceSagaService(db, {
        config: () => ({ ...config, readsEnabled: false }),
        policy: () => mockPolicy,
      }).start(actor, "success", { sha256: d.sha256, operationId: "disabled" }),
      (e: any) => e.code === "TRANSFERS_DISABLED",
    );
    assert.equal((await req("success", "get", "")).status, 401);
    for (const role of ["client", "tehnician"])
      for (const action of ["get", "start", "recheck", "report"])
        assert.equal(
          (
            await req(
              "success",
              action,
              role,
              action === "start"
                ? { sha256: d.sha256, operationId: "x" }
                : undefined,
            )
          ).status,
          403,
        );
    await db.doc("users/admin").update({ disabled: true });
    assert.equal((await req("success")).status, 403);
    await db.doc("users/admin").update({ disabled: false });
    const beforeWork = (await db.doc("lucrari/success").get()).data();
    assert.equal(isUninvoicedWork(beforeWork), true);
    const [a, b] = await Promise.all([
      start("success"),
      service.start(dispatcher, "success", {
        sha256: d.sha256,
        operationId: "other",
      }),
    ]);
    assert.equal(a.transfer!.id, b.transfer!.id);
    assert.equal((await db.collection("invoiceSagaTransfers").get()).size, 1);
    assert.equal(posts, 0);
    assert.equal(gets, 0);
    const startCalls = calls.length;
    await req("success");
    assert.equal(calls.length, startCalls);
    await Promise.all([
      service.process(a.transfer!.id, false),
      service.process(a.transfer!.id, false),
    ]);
    assert.equal(gets, 1);
    const success = await drain("success");
    assert.equal(posts, 1);
    assert.equal(success.importStatus, "imported");
    assert.equal(success.stockStatus, "observed");
    assert.equal(success.groups[0].before!.quantity, "10");
    assert.equal(success.groups[0].after!.quantity, "8");
    assert.equal(
      lastFile,
      (await db.doc("invoiceArtifacts/success").get()).data()!.xml,
    );
    const conn = (await db.doc("sagaConnections/123456").get()).data()!;
    assert.equal(
      decryptToken(conn.tokenEnc, config.encryptionKey, config.fiscalCode),
      expectedToken,
    );
    assert.ok(!JSON.stringify(conn).includes(expectedToken));
    await start("success");
    await drain("success");
    assert.equal(posts, 1);
    const beforeRecheck = posts;
    await service.recheck(actor, "success");
    await drain("success");
    assert.equal(posts, beforeRecheck);
    for (const [name, expectedImport, expectedStock] of [
      ["unchanged", "imported", "not_confirmed"],
      ["partial", "partial", "not_confirmed"],
      ["failed", "failed", "not_confirmed"],
      ["bad400", "failed", "not_confirmed"],
      ["ambiguous", "unknown", "not_confirmed"],
      ["timeout", "unknown", "not_confirmed"],
      ["large_report", "failed", "not_confirmed"],
      ["oversize_report", "unknown", "not_confirmed"],
    ] as const) {
      await reset(name);
      await seed(name);
      const prior: number = posts;
      await start(name);
      const state = await drain(name);
      assert.equal(state.importStatus, expectedImport, name);
      assert.equal(state.stockStatus, expectedStock, name);
      assert.equal(posts, prior + 1);
      await start(name);
      await drain(name);
      assert.equal(posts, prior + 1, "retry must never reimport");
      if (
        ["partial", "failed", "large_report", "oversize_report"].includes(name)
      ) {
        const report = await service.report(actor, name);
        if (name !== "oversize_report")
          assert.ok(report.text.includes("[redactat]"));
        if (name === "large_report") assert.ok(state.reportChunks >= 3);
        if (name === "oversize_report")
          assert.equal(state.reportTruncated, true);
        assert.ok(!report.text.includes("fixture-"));
        assert.equal((await req(name, "report", "dispecer")).status, 200);
      }
      if (name === "timeout") {
        assert.equal(
          (await db.doc("sagaConnections/123456").get()).data()!.state,
          "needs_review",
        );
        await service.recheck(actor, name);
        await drain(name);
        assert.equal(posts, prior + 1);
      }
    }
    for (const [name, quantity] of [
      ["insufficient", "1"],
      ["read_error", "10"],
    ] as const) {
      await reset(name, quantity);
      await seed(name);
      const count: number = posts;
      await start(name);
      const state = await drain(name);
      assert.equal(state.phase, "blocked");
      assert.equal(state.importStatus, "pending");
      assert.equal(posts, count);
    }
    // Explicit restart is safe only when no send boundary was reached.
    await reset("success");
    const insufficient = (await service.state(actor, "insufficient")).transfer!;
    await service.start(actor, "insufficient", {
      sha256: insufficient.sha256,
      operationId: "retry-preflight",
    });
    await drain("insufficient");
    // A source update at the token-acquisition boundary must stop the POST atomically.
    await reset("success");
    await seed("changed-at-send");
    const changingGateway = {
      ...gateway,
      importForInvoice: async (
        a: typeof actor,
        file: { xml: string; filename: string },
        beforeSend: () => Promise<void>,
      ) =>
        gateway.importForInvoice(a, file, async () => {
          await db
            .doc("sagaCatalogs/123456/products/p")
            .update({ revision: 2 });
          await beforeSend();
        }),
    };
    const changed = createInvoiceSagaService(db, {
      config: () => config,
      policy: () => policy,
      now: () => clock,
      gateway: changingGateway,
    });
    const changedDoc = (await db.doc("invoices/changed-at-send").get()).data()!;
    const changeStarted = await changed.start(actor, "changed-at-send", {
      sha256: changedDoc.sha256,
      operationId: "changed",
    });
    const postsBeforeChange = posts;
    await changed.process(changeStarted.transfer!.id, false);
    await changed.process(changeStarted.transfer!.id, false);
    assert.equal(posts, postsBeforeChange);
    assert.equal(
      (await changed.state(actor, "changed-at-send")).transfer!.importStatus,
      "pending",
    );
    assert.equal(
      (await changed.state(actor, "changed-at-send")).transfer!.phase,
      "blocked",
    );
    await db.doc("sagaCatalogs/123456/products/p").update({ revision: 1 });
    // Two FOM invoices never interleave baseline/import/check flows within one company.
    await reset("success");
    await seed("serial-a");
    await seed("serial-b");
    const aa = await start("serial-a"),
      bb = await start("serial-b");
    await service.process(aa.transfer!.id, false);
    const beforeBusy = gets;
    await service.process(bb.transfer!.id, false);
    assert.equal(gets, beforeBusy);
    await drain("serial-a");
    stock = "10";
    await drain("serial-b");
    // Interrupted sender: expired worker lease cannot cause another POST, and a late response cannot overwrite reconciliation.
    await seed("interrupted");
    let began!: () => void, release!: () => void;
    const started = new Promise<void>((r) => (began = r)),
      hold = new Promise<void>((r) => (release = r));
    let interruptedPosts = 0;
    const interrupted = createInvoiceSagaService(db, {
      config: () => config,
      policy: () => policy,
      now: () => clock,
      gateway: {
        readForInvoice: async () => ({
          kind: "stock",
          code: "0001",
          warehouse: "01",
          date: null,
          checkedAt: new Date(clock).toISOString(),
          quantity: "10",
        }),
        importForInvoice: async (_actor, _file, beforeSend) => {
          await beforeSend();
          interruptedPosts++;
          began();
          await hold;
          return {
            outcome: "imported",
            httpStatus: 200,
            checkedAt: new Date(clock).toISOString(),
            report: '{"success":true}',
            truncated: false,
          };
        },
      },
    });
    const it = await interrupted.start(actor, "interrupted", {
      sha256: (await db.doc("invoices/interrupted").get()).data()!.sha256,
      operationId: "interrupt",
    });
    await interrupted.process(it.transfer!.id, false);
    const running = interrupted.process(it.transfer!.id, false);
    await started;
    clock += 91000;
    await interrupted.process(it.transfer!.id, false);
    release();
    await assert.rejects(running);
    assert.equal(interruptedPosts, 1);
    assert.equal(
      (await interrupted.state(actor, "interrupted")).transfer!.importStatus,
      "unknown",
    );
    // Dry-run is completely isolated from both live transfer records and the shared credential state.
    await seed("mock");
    const beforeConnection = JSON.stringify(
        (await db.doc("sagaConnections/123456").get()).data(),
      ),
      beforeCalls = calls.length;
    const mockDoc = (await db.doc("invoices/mock").get()).data()!;
    await mock.start(actor, "mock", {
      sha256: mockDoc.sha256,
      operationId: "mock",
    });
    const simulated = await drain("mock", mock, true);
    assert.equal(simulated.stockStatus, "observed");
    assert.equal(calls.length, beforeCalls);
    assert.equal(
      JSON.stringify((await db.doc("sagaConnections/123456").get()).data()),
      beforeConnection,
    );
    assert.equal(
      (
        await db
          .collection("invoiceSagaTransfers")
          .where("workId", "==", "mock")
          .get()
      ).size,
      0,
    );
    await assert.rejects(
      createInvoiceSagaService(db, {
        config: () => ({ ...config, fiscalCode: "654321" }),
        policy: () => mockPolicy,
      }).start(actor, "mock", {
        sha256: mockDoc.sha256,
        operationId: "foreign",
      }),
    );
    for (const collection of [
      "invoiceSagaTransfers",
      "invoiceSagaSimulations",
      "invoiceSagaCompanyLeases",
      "invoiceSagaReports",
    ])
      for (const suffix of ["/x", "/x/chunks/0"])
        for (const token of ["", tokens.admin])
          for (const method of ["GET", "PATCH"]) {
            const response = await fetch(
              `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}${suffix}`,
              {
                method,
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  "Content-Type": "application/json",
                },
                body: method === "PATCH" ? "{}" : undefined,
              },
            );
            assert.equal(response.status, 403);
          }
    assert.deepEqual(
      (await db.doc("lucrari/success").get()).data(),
      beforeWork,
    );
    assert.equal(
      isUninvoicedWork((await db.doc("lucrari/success").get()).data()),
      true,
    );
    assert.equal(
      (await db.collection("invoiceNumberReservations").get()).size,
      0,
    );
    console.log(
      "PASS invoice SAGA API/emulator: auth/disabled/tenant/Firestore denials, immutable XML and number, exact stock deltas, success/partial/failed/timeout/unknown, persistent duplicate and worker crash safety, serialization and rotation, report redaction, isolated dry-run, unchanged uninvoiced ticket. No external HTTP.",
    );
    await reset("unchanged");
    const browserInvoice = await seed("browser"),
      browserMock = await seed("browser-mock"),
      browserBackground = await seed("browser-background"),
      serverErrors: string[] = [];
    async function dispatch(r: Request) {
      const p = new URL(r.url).pathname,
        workId = p.split("/")[3],
        sim = workId === "browser-mock",
        h = sim ? mockHandlers : handlers,
        target = sim ? mock : service;
      const result = p.endsWith("/report")
        ? await h.report(r, workId)
        : p.endsWith("/recheck")
          ? await h.recheck(r, workId)
          : r.method === "POST"
            ? await h.start(r, workId)
            : await h.get(r, workId);
      if (r.method === "POST" && result.ok)
        setTimeout(() => {
          void drain(workId, target, sim).catch((e) =>
            serverErrors.push(String(e)),
          );
        }, 0);
      return result;
    }
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{InvoiceSagaPanel}from'./components/invoicing/invoice-saga-panel';createRoot(document.getElementById('root')).render(<main style={{padding:16,maxWidth:840,minHeight:1000}}><h1>Factură pregătită în FOM</h1><InvoiceSagaPanel workId={window.testWorkId} sha256={window.testHash} onBusy={()=>{}}/></main>);`,
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
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.testRole=${JSON.stringify(role)};window.testToken=${JSON.stringify(tokens[role])};window.testWorkId=${JSON.stringify(req.url === "/dry" ? "browser-mock" : req.url === "/background" ? "browser-background" : "browser")};window.testHash=${JSON.stringify(req.url === "/dry" ? browserMock.sha256 : req.url === "/background" ? browserBackground.sha256 : browserInvoice.sha256)};</script><script src="/app.js"></script>`,
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
    const noCalls = calls.length;
    await page.goto(url);
    await expect(
      page.getByRole("button", {
        name: "Finalizează și trimite în SAGA",
        exact: true,
      }),
    ).toBeEnabled();
    assert.equal(calls.length, noCalls);
    await page
      .getByRole("button", {
        name: "Finalizează și trimite în SAGA",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare trimitere SAGA" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Anulează trimiterea", exact: true })
      .click();
    assert.equal(calls.length, noCalls);
    const beforeBrowserPosts = posts;
    await page
      .getByRole("button", {
        name: "Finalizează și trimite în SAGA",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirmă trimiterea în SAGA", exact: true })
      .click();
    await expect(
      page.getByText(
        "Factură importată în SAGA; scăderea stocului nu este confirmată.",
        { exact: true },
      ),
    ).toBeVisible();
    assert.equal(posts, beforeBrowserPosts + 1);
    const artifacts = path.join(root, "test-results/invoice-saga");
    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await page.screenshot({
      path: path.join(artifacts, "imported-unconfirmed-desktop.png"),
    });
    await page.reload();
    await expect(
      page.getByText(
        "Factură importată în SAGA; scăderea stocului nu este confirmată.",
        { exact: true },
      ),
    ).toBeVisible();
    assert.equal(posts, beforeBrowserPosts + 1);
    await page
      .getByRole("button", {
        name: "Reverifică stocul (fără retrimitere)",
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await service.state(actor, "browser")).transfer!.phase)
      .toBe("done");
    assert.equal(posts, beforeBrowserPosts + 1);
    const dlEvent = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Descarcă raportul importului",
        exact: true,
      })
      .click();
    assert.ok((await dlEvent).suggestedFilename().endsWith(".txt"));
    await page
      .getByText("Citiri și diferențe de stoc", { exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Transmitere și stoc SAGA" }),
    ).toContainText("0001 · gestiune 01 · 2 buc");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    await page.screenshot({
      path: path.join(artifacts, "imported-unconfirmed-mobile.png"),
    });
    const beforeSimulation = calls.length;
    await page.goto(url + "/dry");
    await expect(
      page.getByText("Simulare — netransmis.", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Simulează trimiterea în SAGA",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirmă simularea", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Transmitere și stoc SAGA" }),
    ).toContainText("Simulare: Diferența așteptată a fost observată");
    assert.equal(calls.length, beforeSimulation);
    const backgroundPosts = posts;
    await page.goto(url + "/background");
    await page
      .getByRole("button", {
        name: "Finalizează și trimite în SAGA",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Confirmă trimiterea în SAGA", exact: true })
      .click();
    await page.close();
    await expect
      .poll(
        async () =>
          (await service.state(actor, "browser-background")).transfer?.phase,
        { timeout: 12000 },
      )
      .toBe("done");
    assert.equal(posts, backgroundPosts + 1);
    assert.deepEqual(errors, []);
    assert.deepEqual(serverErrors, []);
    assert.deepEqual((await db.doc("lucrari/browser").get()).data(), work);
    console.log(
      "PASS invoice SAGA browser: explicit finalization/cancel, separate import and stock results, unchanged stock message, reload without POST, read-only recheck, private report download, dry-run separation, 320/390px. Only injected upstream requests.",
    );
  } finally {
    await browser?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((r) => server!.close(() => r()));
    }
    await deleteApp(app);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
