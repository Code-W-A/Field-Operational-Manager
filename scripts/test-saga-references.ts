import { createSagaReferencesService } from "../lib/saga/references.server";
import { sagaReferencesHandlers } from "../lib/saga/references-http";
import {
  validateReferenceRows,
  type ReferenceKind,
} from "../lib/saga/references";
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
import { createSagaService } from "../lib/saga/service.server";
import { sagaConfig } from "../lib/saga/config.server";
import { SagaError } from "../lib/saga/contracts";

import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-saga-references",
  firestoreHost = "127.0.0.1:8391",
  authHost = "127.0.0.1:9391";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8391 },
          auth: { host: "127.0.0.1", port: 9391 },
          hub: { port: 4491 },
          logging: { port: 4591 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-saga-references.ts")}\"`,
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
  const app = initializeApp({ projectId }, "saga-references-test"),
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
    // Every HTTP request in this process must remain on the isolated emulators.
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
        "No external HTTP traffic in client-association tests",
      );
      return originalFetch(input, init);
    };
    const actor = { uid: "admin", role: "admin" },
      dispatcher = { uid: "dispecer", role: "dispecer" };
    let calls = 0,
      price = "12.5000",
      vat = "21",
      unit = "BUC",
      duringRead: (() => Promise<void>) | null = null;
    const saga = createSagaService(db, {
      config: () => config,
      fetch: async (_input, init) => {
        calls++;
        assert.equal(
          new Headers(init?.headers).get("Authorization"),
          `Bearer ${calls === 1 ? "unused-local-fixture" : `rotated-${calls - 1}`}`,
        );
        if (duringRead) await duringRead();
        return new Response(
          `<Articol><Cod>000194</Cod><Denumire>Braț API</Denumire><UM>${unit}</UM><TVA>${vat}</TVA><Pret_Vanzare1>${price}</Pret_Vanzare1></Articol>`,
          {
            headers: {
              "Content-Type": "application/xml",
              "X-Saga-Refresh-Token": `rotated-${calls}`,
            },
          },
        );
      },
    });
    const service = createSagaReferencesService(db, saga.read, () => config);
    const authenticate = async (r: Request) => {
      const token = r.headers.get("Authorization")?.replace(/^Bearer /, "");
      if (!token)
        throw new SagaError("UNAUTHENTICATED", "Autentificare necesară.", 401);
      let u;
      try {
        u = await auth.verifyIdToken(token);
      } catch {
        throw new SagaError("UNAUTHENTICATED", "Token invalid.", 401);
      }
      return {
        uid: u.uid,
        role: (await db.doc(`users/${u.uid}`).get()).data()?.role || "",
      };
    };
    const handlers = sagaReferencesHandlers(service, authenticate);
    async function dispatch(r: Request) {
      const p = new URL(r.url).pathname.split("/").filter(Boolean),
        base = p.indexOf("references");
      if (base >= 0) {
        const kind = p[base + 1],
          action = p[base + 2],
          id = p[base + 3];
        if (action === "preview") return handlers.preview(r, kind);
        if (action === "imports") {
          if (p[base + 4] === "batch") return handlers.batch(r, kind, id);
          if (p[base + 4] === "cancel") return handlers.cancel(r, kind, id);
          return r.method === "POST"
            ? handlers.begin(r, kind)
            : handlers.progress(r, kind);
        }
        if (p[base + 3] === "verify") return handlers.verify(r, kind, action);
        return handlers.list(r, kind);
      }
      if (p.at(-2) === "issuers" && p.at(-1) === "users")
        return handlers.users(r);
      if (p.at(-2) === "issuers")
        return r.method === "PUT"
          ? handlers.saveProfile(r, p.at(-1)!)
          : handlers.profile(r, p.at(-1)!);
      return Response.json({ error: "Unknown fixture route" }, { status: 404 });
    }
    async function request(
      path: string,
      role = "admin",
      body?: unknown,
      method = body ? "POST" : "GET",
    ) {
      return dispatch(
        new Request("http://localhost/api/integrations/saga/" + path, {
          method,
          headers: {
            ...(tokens[role]
              ? { Authorization: "Bearer " + tokens[role] }
              : {}),
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    }
    const sha = (v: unknown) =>
      createHash("sha256").update(JSON.stringify(v)).digest("hex");
    async function importRows(
      kind: ReferenceKind,
      input: unknown,
      source = "fixture.csv",
    ) {
      const { rows } = await service.preview(actor, kind, input),
        chunks = [];
      for (let i = 0; i < rows.length; i += 200)
        chunks.push(rows.slice(i, i + 200));
      const manifest = { source, total: rows.length, hashes: chunks.map(sha) },
        job = await service.begin(actor, kind, manifest);
      let result = job;
      for (let index = job.next; index < chunks.length; index++)
        result = await service.batch(actor, kind, job.id, {
          index,
          rows: chunks[index],
        });
      return { rows, chunks, manifest, job: result };
    }
    // Immutable stage-1 boundaries: no legacy catalog, invoice, numbering or FOM client writes.
    const unchanged = [
      "sagaCatalogs/123456/products/p",
      "sagaCatalogs/123456/warehouses/w",
      "sagaCatalogs/123456/clientLinks/c",
      "invoiceDrafts/work",
      "invoices/work",
      "invoiceCounters/counter",
      "invoiceNumberReservations/n",
      "clienti/c",
    ];
    for (const p of unchanged) await db.doc(p).set({ sentinel: p });
    const originals = await Promise.all(
      unchanged.map(async (p) => (await db.doc(p).get()).data()),
    );
    const clientId = createHash("sha256").update("00077").digest("hex");
    await db
      .doc(`sagaCatalogs/123456/clients/${clientId}`)
      .set({ code: "00077", name: "Client existent" });
    assert.equal((await request("references/agents", "")).status, 401);
    for (const role of ["tehnician", "client"])
      assert.equal((await request("references/agents", role)).status, 403);
    assert.equal(
      (await request("references/agents/preview", "dispecer", [])).status,
      403,
    );
    await assert.rejects(
      () => service.preview(actor, "clientTerms", [{ code: "missing" }]),
      /nu există/,
    );
    await importRows("clientTerms", [{ code: "00077", days: "0" }]);
    const term = (await service.list(dispatcher, "clientTerms")).entries[0];
    assert.equal(term.exportData.days, 0);
    assert.equal(term.clientId, clientId);
    await importRows("types", [
      { code: "M", name: "Mărfuri", purchasable: "da", notStocked: "nu" },
    ]);
    await importRows("warehouses", [
      { code: "0001", name: "Depozit", category: "cantitativ" },
    ]);
    await importRows("agents", [
      { code: "0002", name: "Ionuț" },
      { code: "0004", name: "Alin" },
      { code: "0003", name: "Liliana" },
    ]);
    await importRows("articles", [
      {
        code: "000194",
        name: "Braț amortizor",
        typeCode: "M",
        unit: "BUC",
        vat: "0",
        price: "0",
        currency: "RON",
      },
      { code: "000195", name: "Șurub" },
      { code: "000196", name: "Șină" },
    ]);
    assert.equal(calls, 0, "Import and lists never contact SAGA");
    const first = await service.list(actor, "articles", { limit: "2" });
    assert.equal(first.entries.length, 2);
    assert.ok(first.nextCursor);
    assert.equal(
      (
        await service.list(actor, "articles", {
          limit: "2",
          cursor: first.nextCursor!,
        })
      ).entries.length,
      1,
    );
    await assert.rejects(() =>
      service.list(actor, "agents", { cursor: first.nextCursor! }),
    );
    assert.equal(
      (await service.list(actor, "articles", { field: "name", q: "su" }))
        .entries[0].name,
      "Șurub",
    );
    const other = createSagaReferencesService(db, saga.read, () => ({
      ...config,
      fiscalCode: "999999",
    }));
    assert.equal((await other.list(actor, "articles")).entries.length, 0);
    await assert.rejects(() =>
      other.list(actor, "articles", { cursor: first.nextCursor! }),
    );
    const bulk = validateReferenceRows(
        "agents",
        Array.from({ length: 201 }, (_, i) => ({
          code: `B${String(i).padStart(4, "0")}`,
          name: `Agent ${i}`,
        })),
      ),
      chunks = [bulk.slice(0, 200), bulk.slice(200)],
      manifest = { source: "bulk.csv", total: 201, hashes: chunks.map(sha) };
    const j = await service.begin(actor, "agents", manifest);
    assert.equal((await service.begin(actor, "agents", manifest)).id, j.id);
    await assert.rejects(
      () =>
        service.begin(actor, "articles", { ...manifest, source: "other.csv" }),
      (e) => (e as SagaError).status === 409,
    );
    await assert.rejects(() =>
      service.batch(actor, "agents", j.id, {
        index: 0,
        rows: [{ code: "FAKE", name: "fake" }],
      }),
    );
    await service.batch(actor, "agents", j.id, { index: 0, rows: chunks[0] });
    assert.equal(
      (
        await service.batch(actor, "agents", j.id, {
          index: 0,
          rows: chunks[0],
        })
      ).next,
      1,
    );
    const resumed = await service.begin(actor, "agents", manifest);
    assert.equal(resumed.next, 1);
    await service.batch(actor, "agents", j.id, { index: 1, rows: chunks[1] });
    const cancel = await service.begin(actor, "agents", {
      source: "cancel.csv",
      total: 201,
      hashes: chunks.map(sha),
    });
    await service.batch(actor, "agents", cancel.id, {
      index: 0,
      rows: chunks[0],
    });
    await service.cancel(actor, "agents", cancel.id);
    assert.equal(
      (await service.progress(actor, "agents", cancel.id)).job?.status,
      "cancelled",
    );
    const importRace = await Promise.allSettled([
      service.begin(actor, "agents", { ...manifest, source: "race-a.csv" }),
      service.begin(actor, "agents", { ...manifest, source: "race-b.csv" }),
    ]);
    assert.equal(importRace.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      importRace.filter(
        (r) => r.status === "rejected" && r.reason.status === 409,
      ).length,
      1,
    );
    const raceWinner = importRace.find((r) => r.status === "fulfilled");
    if (raceWinner?.status === "fulfilled")
      await service.cancel(actor, "agents", raceWinner.value.id);
    await db.doc("users/admin").update({ disabled: true });
    assert.equal((await request("references/agents")).status, 403);
    await db.doc("users/admin").update({ disabled: false });
    let article = (await service.list(actor, "articles", { q: "000194" }))
      .entries[0];
    article = (
      await service.verify(actor, article.id, {
        expectedRevision: article.revision,
      })
    ).entry;
    assert.equal(article.apiSnapshot?.price, "12.5000");
    assert.equal(article.exportData.price, "0");
    assert.equal(calls, 1);
    const connection = (await db.doc("sagaConnections/123456").get()).data()!;
    // The existing connector owns encryption and refresh persistence, not reference catalogs.
    assert.ok(!JSON.stringify(connection).includes("rotated-1"));
    await importRows(
      "articles",
      [{ code: "000194", name: "Export nou", price: "15", vat: "19" }],
      "second.csv",
    );
    article = (await service.list(actor, "articles", { q: "000194" }))
      .entries[0];
    assert.equal(article.apiSnapshot?.price, "12.5000");
    assert.equal(article.exportData.price, "15");
    assert.equal((await service.list(actor, "articles")).entries.length, 3);
    price = "0";
    vat = "0";
    article = (
      await service.verify(actor, article.id, {
        expectedRevision: article.revision,
      })
    ).entry;
    assert.equal(article.apiSnapshot?.price, "0");
    assert.equal(article.apiSnapshot?.vat, "0");
    price = "";
    vat = "";
    article = (
      await service.verify(actor, article.id, {
        expectedRevision: article.revision,
      })
    ).entry;
    assert.equal(article.apiSnapshot?.price, null);
    assert.equal(article.apiSnapshot?.vat, null);
    duringRead = async () => {
      await importRows(
        "articles",
        [{ code: "000194", name: "Concurrent", price: "17" }],
        "concurrent.csv",
      );
    };
    await assert.rejects(
      () =>
        service.verify(actor, article.id, {
          expectedRevision: article.revision,
        }),
      (e) => (e as SagaError).status === 409,
    );
    duringRead = null;
    const agent = (await service.list(actor, "agents", { q: "0002" }))
      .entries[0];
    const payload = {
      expectedRevision: 0,
      prefix: "NRGV F26",
      lastVerifiedNumber: "0000",
      agentId: agent.id,
      agentRevision: agent.revision,
      exclusiveConfirmed: true,
      lastNumberConfirmed: true,
    };
    const concurrent = await Promise.allSettled([
      service.saveProfile(actor, "admin", payload),
      service.saveProfile(actor, "dispecer", payload),
    ]);
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      concurrent.filter(
        (r) =>
          r.status === "rejected" && (r.reason as SagaError).status === 409,
      ).length,
      1,
    );
    const owner = concurrent[0].status === "fulfilled" ? "admin" : "dispecer",
      otherUid = owner === "admin" ? "dispecer" : "admin";
    let profile = (await service.profile(actor, owner)).profile!;
    assert.equal(profile.status, "prepared");
    assert.equal(profile.lastVerifiedNumber, "0000");
    assert.equal(
      (
        await service.saveProfile(actor, otherUid, {
          ...payload,
          prefix: "NRGA F26",
        })
      ).exampleNextNumber,
      "NRGA F260001",
    );
    await assert.rejects(
      () => service.saveProfile(actor, owner, payload),
      (e) => (e as SagaError).status === 409,
    );
    await service.saveProfile(actor, owner, {
      ...payload,
      expectedRevision: profile.revision,
      prefix: "NRG F26",
    });
    await service.saveProfile(actor, "tehnician", {
      ...payload,
      prefix: "NRGV F26",
    });
    assert.equal(
      (await db.doc("users/tehnician").get()).data()?.role,
      "tehnician",
    );
    assert.equal((await request("issuers/dispecer", "dispecer")).status, 200);
    assert.equal((await request("issuers/admin", "dispecer")).status, 403);
    assert.equal((await request("issuers/users", "dispecer")).status, 403);
    assert.equal(
      (await request("issuers/dispecer", "dispecer", payload, "PUT")).status,
      403,
    );
    await importRows("agents", [{ code: "0002", name: "Ion actualizat" }]);
    assert.equal((await service.profile(actor, owner)).agentIsCurrent, false);
    await assert.rejects(
      () =>
        service.saveProfile(actor, "client", { ...payload, prefix: "OTHER" }),
      (e) => (e as SagaError).status === 409,
    );
    await db.doc("users/client").update({ disabled: true });
    await assert.rejects(() =>
      service.saveProfile(actor, "client", { ...payload, prefix: "OTHER" }),
    );
    await db.doc("users/client").update({ disabled: false });
    const gated = createSagaReferencesService(db, saga.read, () => ({
      ...config,
      readsEnabled: false,
    }));
    await assert.rejects(
      () => gated.begin(actor, "agents", manifest),
      (e) => (e as SagaError).code === "READS_DISABLED",
    );
    for (const p of [
      "sagaCatalogs/123456",
      `sagaCatalogs/123456/referenceItems/${article.id}`,
      `sagaCatalogs/123456/referenceImports/${j.id}`,
      "sagaCatalogs/123456/issuerProfiles/admin",
      "sagaCatalogs/123456/issuerSeries/test",
      "sagaCatalogs/123456/referenceControl/import",
    ])
      for (const token of ["", tokens.admin]) {
        const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${p}`,
          headers: Record<string, string> = token
            ? { Authorization: `Bearer ${token}` }
            : {};
        assert.equal((await fetch(url, { headers })).status, 403);
        assert.equal(
          (
            await fetch(url, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: '{"fields":{"name":{"stringValue":"forbidden"}}}',
            })
          ).status,
          403,
        );
      }
    assert.deepEqual(
      await Promise.all(
        unchanged.map(async (p) => (await db.doc(p).get()).data()),
      ),
      originals,
    );
    console.log(
      "PASS reference API/emulator: permissions, batches/resume/cancel, firm isolation, prefix pagination, protected collections, export/API separation, refreshed token, concurrent profiles and series, immutable legacy data.",
    );
    console.log("Browser: building fixture");
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{SagaReferences}from'./components/settings/saga-references';import{SagaIssuerProfiles}from'./components/settings/saga-issuer-profiles';createRoot(document.getElementById('root')).render(<main style={{padding:16}}><SagaReferences/><SagaIssuerProfiles/></main>);`,
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      format: "iife",
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "fixture",
          setup(b) {
            b.onResolve({ filter: /^@\/contexts\/AuthContext$/ }, () => ({
              path: "auth",
              namespace: "fixture",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
              contents: `export const useAuth=()=>({user:{uid:window.testRole,getIdToken:async()=>window.testToken}})`,
              loader: "tsx",
            }));
            b.onResolve({ filter: /^next\/link$/ }, () => ({
              path: "link",
              namespace: "fixture-link",
            }));
            b.onLoad({ filter: /.*/, namespace: "fixture-link" }, () => ({
              contents: `import React from'react';export default function Link(props){return <a {...props}/>}`,
              loader: "tsx",
              resolveDir: root,
            }));
          },
        },
      ],
    });
    console.log("Browser: bundle ready");
    const postcss = (await import("postcss")).default,
      tailwind = (await import("tailwindcss")).default,
      tw = (await import("../tailwind.config")).default;
    const css = await postcss([
      tailwind({
        ...tw,
        content: [
          path.join(root, "components/invoicing/**/*.tsx"),
          path.join(root, "components/settings/saga-references.tsx"),
          path.join(root, "components/settings/saga-issuer-profiles.tsx"),
          path.join(root, "components/clients/saga-client-association.tsx"),
          path.join(root, "components/ui/{button,input}.tsx"),
        ],
      }),
    ]).process(await readFile(path.join(root, "app/globals.css"), "utf8"), {
      from: path.join(root, "app/globals.css"),
    });
    console.log("Browser: CSS ready");
    server = createServer(async (req, res) => {
      try {
        if (req.url?.startsWith("/api/")) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const response = await dispatch(
            new Request("http://localhost" + req.url, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: ["POST", "PUT"].includes(req.method!)
                ? Buffer.concat(chunks).toString()
                : undefined,
            }),
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
          return;
        }
        if (req.url === "/app.js") {
          res.setHeader("Content-Type", "text/javascript");
          res.end(bundle.outputFiles[0].text);
          return;
        }
        const role =
          req.url === "/readonly" || req.url === "/ticket"
            ? "dispecer"
            : "admin";
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}
html,body{height:auto;overflow-x:visible}</style><div id="root"></div><script>window.testRole=${JSON.stringify(role)};window.testToken=${JSON.stringify(tokens[role])};window.testWork=${JSON.stringify({})};</script><script src="/app.js"></script>`,
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
    console.log("Browser: launching Chrome");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.setDefaultTimeout(15000);
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).hostname !== "127.0.0.1")
        return route.abort();
      return route.continue();
    });
    const beforeBrowser = calls;
    await page.goto(url);
    await expect(
      page.getByText("000194 — Concurrent", { exact: true }),
    ).toBeVisible();
    assert.equal(calls, beforeBrowser, "Opening UI never calls SAGA");
    await page.getByText("Importă articole", { exact: true }).click();
    await page.getByLabel("Fișier referințe", { exact: true }).setInputFiles({
      name: "browser.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Cod;Denumire;UM;TVA;Pret\n000200;Articol browser;BUC;0;0",
      ),
    });
    await page
      .getByRole("button", {
        name: "Citește fișierul de referință",
        exact: true,
      })
      .click();
    await page
      .getByLabel("Coloană Cod SAGA", { exact: true })
      .selectOption("0");
    await page
      .getByLabel("Coloană Denumire", { exact: true })
      .selectOption("1");
    await page.getByLabel("Coloană UM", { exact: true }).selectOption("2");
    await page.getByLabel("Coloană TVA (%)", { exact: true }).selectOption("3");
    await page
      .getByLabel("Coloană Preț din export", { exact: true })
      .selectOption("4");
    await page
      .getByRole("button", { name: "Previzualizează referințele", exact: true })
      .click();
    await expect(page.getByLabel("Cod SAGA rând 1")).toHaveValue("000200");
    await page
      .getByRole("button", { name: "Validează previzualizarea", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Confirmă și importă referințele",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("000200 — Articol browser", { exact: true }),
    ).toBeVisible();
    assert.equal(calls, beforeBrowser);
    const card = page
      .getByRole("article")
      .filter({ hasText: "000200 — Articol browser" });
    price = "0";
    vat = "0";
    await card
      .getByRole("button", { name: "Verifică / actualizează din SAGA" })
      .click();
    await expect(card).toContainText("Braț API · UM BUC · TVA 0 · Preț 0");
    assert.equal(calls, beforeBrowser + 1);
    // XLSX numeric identity must be corrected/explicitly confirmed; worksheet selection works.
    await page.getByLabel("Catalog de referință").selectOption("warehouses");
    await page.getByText("Importă gestiuni", { exact: true }).click();
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Ignoră").addRows([
      ["Cod", "Denumire"],
      ["XX", "Nu importa"],
    ]);
    workbook.addWorksheet("Gestiuni").addRows([
      ["Cod", "Denumire"],
      [9, "Depozit nou"],
    ]);
    await page.getByLabel("Fișier referințe", { exact: true }).setInputFiles({
      name: "gestiuni.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await page
      .getByRole("button", {
        name: "Citește fișierul de referință",
        exact: true,
      })
      .click();
    await page.getByLabel("Foaie referințe").selectOption("Gestiuni");
    await page
      .getByLabel("Coloană Cod SAGA", { exact: true })
      .selectOption("0");
    await page
      .getByLabel("Coloană Denumire", { exact: true })
      .selectOption("1");
    await page
      .getByRole("button", { name: "Previzualizează referințele", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Validează previzualizarea", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "Corectează și confirmă",
    );
    await page.getByLabel("Cod SAGA rând 1").fill("0009");
    await page
      .getByLabel(
        "Am verificat codul complet în SAGA, inclusiv zerourile inițiale",
      )
      .check();
    await page
      .getByRole("button", { name: "Validează previzualizarea", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Confirmă și importă referințele",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("0009 — Depozit nou", { exact: true }),
    ).toBeVisible();
    const profilePanel = page.getByRole("region", {
      name: "Profiluri de emitere",
    });
    await page.getByLabel("Cont FOM pentru emitere").selectOption("client");
    await page.getByLabel("Serie profil").fill("TEST F26");
    await page.getByLabel("Ultima valoare profil").fill("0000");
    const currentAgent = (await service.list(actor, "agents", { q: "0004" }))
      .entries[0];
    await page
      .getByLabel("Agent implicit profil")
      .selectOption(currentAgent.id);
    await page
      .getByLabel("Confirm că seria va fi folosită exclusiv prin FOM")
      .check();
    await page
      .getByLabel("Confirm ultima valoare numerică verificată în SAGA")
      .check();
    await page
      .getByRole("button", { name: "Salvează profilul de emitere" })
      .click();
    await expect(profilePanel.getByRole("status")).toContainText(
      "TEST F260001 — nerezervat",
    );
    await page.reload();
    await page.getByLabel("Cont FOM pentru emitere").selectOption("client");
    await expect(page.getByLabel("Serie profil")).toHaveValue("TEST F26");
    // Stale revision preserves typed data; explicit reload discards it.
    const saved = (await service.profile(actor, "client")).profile!;
    await service.saveProfile(actor, "client", {
      ...payload,
      expectedRevision: saved.revision,
      prefix: "SERVER F26",
      agentId: currentAgent.id,
      agentRevision: currentAgent.revision,
    });
    await page.getByLabel("Serie profil").fill("LOCAL F26");
    await page
      .getByLabel("Confirm că seria va fi folosită exclusiv prin FOM")
      .check();
    await page
      .getByLabel("Confirm ultima valoare numerică verificată în SAGA")
      .check();
    await page
      .getByRole("button", { name: "Salvează profilul de emitere" })
      .click();
    await expect(profilePanel.getByRole("alert")).toContainText("Reîncarcă");
    await expect(page.getByLabel("Serie profil")).toHaveValue("LOCAL F26");
    await page
      .getByRole("button", { name: "Reîncarcă profilul", exact: true })
      .click();
    await expect(page.getByLabel("Serie profil")).toHaveValue("SERVER F26");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByLabel("Catalog de referință").selectOption("articles");
      await expect(
        page.getByText("000200 — Articol browser", { exact: true }),
      ).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `No horizontal overflow at ${width}`,
      );
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "/tmp/fom-saga-references-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "/tmp/fom-saga-references-desktop.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.equal(calls, beforeBrowser + 1);
    assert.deepEqual(
      await Promise.all(
        unchanged.map(async (p) => (await db.doc(p).get()).data()),
      ),
      originals,
    );
    console.log(
      "PASS browser: CSV import, XLSX worksheet and numeric-code confirmation, explicit article API refresh, separate sources, profile save/reopen/conflict, narrow 320/390 screens. Screenshots /tmp/fom-saga-references-{mobile,desktop}.png",
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
