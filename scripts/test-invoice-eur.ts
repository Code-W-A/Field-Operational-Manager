import { createEurRateService } from "../lib/invoicing/eur-rate.server";
import { eurRateHandlers } from "../lib/invoicing/eur-rate-http";
import { bnrXmlFixture } from "../lib/invoicing/eur-rate.fixtures";
import { invoiceContent, calculateInvoiceTotals } from "../lib/invoicing/draft";
import { invoiceXml } from "../lib/invoicing/xml";
import { snapshotFixture } from "../lib/invoicing/xml.fixtures";
import {
  verifyInvoiceArtifact,
  digest,
} from "../lib/invoicing/saga-artifact.server";
import {
  withEurOmitted,
  eurFixtureHandlers,
} from "../lib/invoicing/eur-rate.fixtures";
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
import { createHash } from "node:crypto";
import { createInvoiceNumberingService } from "../lib/invoicing/numbering.server";
import { InvoiceNumberingError } from "../lib/invoicing/numbering";
import { createInvoiceXmlService } from "../lib/invoicing/xml.server";
import { importPolicy } from "../lib/saga/import";
import { createInvoiceFinalizationService } from "../lib/invoicing/finalization.server";
import { invoiceFinalizationHandlers } from "../lib/invoicing/finalization-http";
import { invoiceXmlHandlers } from "../lib/invoicing/xml-http";
import { issuerFixture, contentFixture } from "../lib/invoicing/xml.fixtures";
import { isUninvoicedWork } from "../lib/reports/uninvoiced";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-invoice-eur",
  firestoreHost = "127.0.0.1:8384",
  authHost = "127.0.0.1:9384";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8384 },
          auth: { host: "127.0.0.1", port: 9384 },
          hub: { port: 4484 },
          logging: { port: 4584 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-invoice-eur.ts")}\"`,
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
    const finalHttp = invoiceFinalizationHandlers(
      createInvoiceFinalizationService(db, {
        config: () => config,
        policy: () => importPolicy({}),
      }),
      authenticate,
    );
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
    for (const id of ["w", "bad", "browser", "omit", "future"]) await seed(id);
    await service.saveProfile(actor, {
      expectedRevision: 0,
      profile: issuerFixture,
    });
    const ni = {
        expectedRevision: 0,
        prefix: "NRG",
        lastVerifiedNumber: "0000",
        reason: "",
        exclusiveConfirmed: true,
        sagaVerified: true,
      },
      np = await numbering.preview(actor, ni);
    await numbering.put(actor, {
      ...ni,
      confirmationHash: np.confirmationHash,
    });
    let clock = Date.parse("2026-11-08T12:00:00Z"),
      mode = "ok",
      rate = "5.3408";
    const calls: string[] = [];
    const eur = createEurRateService(db, {
        now: () => new Date(clock),
        timeoutMs: 30,
        fetch: async (input, init) => {
          const url = String(input);
          assert.ok(url.startsWith("https://curs.bnr.ro/"));
          assert.equal(init?.redirect, "error");
          calls.push(url);
          if (mode === "timeout")
            return new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener(
                "abort",
                () => reject(new Error("aborted")),
                { once: true },
              );
            });
          if (mode === "http")
            return new Response("unavailable", { status: 503 });
          if (mode === "redirect")
            return Response.redirect("https://untrusted.example", 302);
          if (mode === "invalid") return new Response("<html>no xml</html>");
          if (mode === "missing")
            return new Response(
              bnrXmlFixture([{ date: "2026-11-06", value: rate }]).replace(
                "EUR",
                "USD",
              ),
            );
          if (mode === "large") return new Response("x".repeat(2097153));
          await new Promise((resolve) => setTimeout(resolve, 5));
          const year = Number(url.match(/nbrfxrates(\d{4})\.xml/)?.[1] || 2026);
          const rows = url.endsWith("10days.xml")
            ? [
                { date: "2026-11-06", value: rate },
                { date: "2026-11-05", value: "5.3300" },
              ]
            : year === 2026
              ? [
                  { date: "2026-01-05", value: "5.1000" },
                  { date: "2026-11-06", value: rate },
                ]
              : [
                  { date: `${year}-07-04`, value: "5.1100" },
                  { date: `${year}-12-31`, value: "5.1200" },
                ];
          return new Response(bnrXmlFixture(rows), {
            headers: { "Content-Type": "text/xml" },
          });
        },
      }),
      eurHttp = eurRateHandlers(eur, authenticate);
    async function dispatch(r: Request) {
      const p = new URL(r.url).pathname,
        id = p.split("/")[3];
      if (p.endsWith("/eur-rate")) return eurHttp.get(r, id);
      if (p.endsWith("/invoice-finalization/preview"))
        return finalHttp.preview(r, id);
      if (p.endsWith("/invoice-finalization")) return finalHttp.confirm(r, id);
      if (p.endsWith("/invoice-saga"))
        return Response.json({
          mode: "dry-run",
          canStart: true,
          reason: "",
          transfer: null,
        });
      if (p.endsWith("/invoice-xml/preview")) return handlers.preview(r, id);
      if (p.endsWith("/invoice-xml/download")) return handlers.download(r, id);
      if (p.endsWith("/invoice-xml"))
        return r.method === "POST"
          ? handlers.prepare(r, id)
          : handlers.document(r, id);
      if (p.endsWith("/number"))
        return Response.json(
          await numbering.estimate(await authenticate(r), id),
        );
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
    const request = (p: string, role = "admin", body?: unknown) =>
      dispatch(
        new Request("http://localhost" + p, {
          method: body ? "PUT" : "GET",
          headers: tokens[role]
            ? { Authorization: "Bearer " + tokens[role] }
            : { Cookie: "userRole=admin" },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    const ratePath = "/api/lucrari/w/invoice-draft/eur-rate?date=2026-11-07";
    assert.equal((await request(ratePath, "")).status, 401);
    for (const role of ["client", "tehnician"])
      assert.equal((await request(ratePath, role)).status, 403);
    await db.doc("users/admin").update({ disabled: true });
    assert.equal((await request(ratePath)).status, 403);
    await db.doc("users/admin").update({ disabled: false });
    assert.equal(calls.length, 0);
    const [q7, q8] = await Promise.all([
      eur.quote("2026-11-07"),
      eur.quote("2026-11-08"),
    ]);
    assert.equal(calls.length, 1, "One shared source fetch");
    assert.equal(q7.rateDate, "2026-11-06");
    assert.equal(q7.value, "5.3408");
    assert.equal(q8.requestedDate, "2026-11-08");
    assert.equal((await eur.quote("2026-11-07")).quoteId, q7.quoteId);
    assert.equal(calls.length, 1);
    const archive = await eur.quote("2025-07-05");
    assert.equal(archive.rateDate, "2025-07-04");
    const boundary = await eur.quote("2026-01-01");
    assert.equal(boundary.rateDate, "2025-12-31");
    assert.equal(calls.length, 3);
    const beforeHistorical = calls.length;
    clock += 900001;
    await eur.quote("2025-07-05");
    assert.equal(
      calls.length,
      beforeHistorical,
      "Closed-year cache is not revalidated in 15m",
    );
    rate = "5.4400";
    const newer = await eur.quote("2026-11-07");
    assert.notEqual(newer.quoteId, q7.quoteId);
    assert.equal(newer.value, "5.4400");
    assert.equal(
      (await db.doc(`invoiceExchangeRateQuotes/${q7.quoteId}`).get()).data()!
        .value,
      "5.3408",
    );
    clock += 86400001;
    await eur.quote("2025-07-05");
    assert.ok(
      calls.length > beforeHistorical + 1,
      "Closed-year cache revalidates after 24h",
    );
    for (const scenario of [
      "http",
      "timeout",
      "missing",
      "invalid",
      "redirect",
      "large",
    ]) {
      clock += 900001;
      mode = scenario;
      await assert.rejects(() => eur.quote("2026-11-07"));
    }
    mode = "ok";
    clock = Date.parse("2026-11-08T12:00:00Z");
    const callsBeforeFuture = calls.length;
    await assert.rejects(() => eur.quote("2099-01-01"));
    assert.equal(calls.length, callsBeforeFuture);
    await assert.rejects(() => eur.quote("2026-02-30"));
    await assert.rejects(() =>
      eur.readSource("https://other.example/rates.xml"),
    );
    assert.equal(
      (await db.collection("invoiceNumberReservations").get()).size,
      0,
    );
    await assert.rejects(
      () => service.preview(actor, "w", { expectedRevision: 1 }),
      (e) => (e as { code: string }).code === "EUR_REFERENCE_REQUIRED",
    );
    const c = contentFixture(),
      totals = calculateInvoiceTotals(c);
    await assert.rejects(() =>
      draftService.put(
        "w",
        {
          expectedRevision: 1,
          content: {
            ...c,
            eurReference: {
              status: "available",
              quoteId: "f".repeat(64),
              requestedDate: c.date,
            },
          },
        },
        actor,
      ),
    );
    await assert.rejects(
      () =>
        draftService.put(
          "w",
          {
            expectedRevision: 1,
            content: { ...c, eurReference: { ...q7, value: "99" } },
          },
          actor,
        ),
      (e) => (e as { status: number }).status === 403,
    );
    await assert.rejects(
      () =>
        draftService.put(
          "w",
          { expectedRevision: 1, content: { ...c, eurReference: q8 } },
          actor,
        ),
      (e) => (e as { status: number }).status === 409,
    );
    const saved = (
      await draftService.put(
        "w",
        { expectedRevision: 1, content: { ...c, eurReference: q7 } },
        actor,
      )
    ).draft!;
    assert.equal(saved.eurReference?.status, "available");
    assert.deepEqual(saved.totals, totals);
    const oldPreview = await service.preview(actor, "w", {
      expectedRevision: saved.revision,
    });
    if (!("previewHash" in oldPreview)) throw Error();
    const saved2 = (
      await draftService.put(
        "w",
        {
          expectedRevision: saved.revision,
          content: { ...invoiceContent(saved), eurReference: newer },
        },
        actor,
      )
    ).draft!;
    await assert.rejects(
      () =>
        service.prepare(actor, "w", {
          expectedRevision: saved.revision,
          previewHash: oldPreview.previewHash,
          operationId: "stale",
        }),
      (e) => (e as { status: number }).status === 409,
    );
    const p = await service.preview(actor, "w", {
      expectedRevision: saved2.revision,
    });
    if (!("previewHash" in p)) throw Error();
    const doc = (
      await service.prepare(actor, "w", {
        expectedRevision: saved2.revision,
        previewHash: p.previewHash,
        operationId: "current",
      })
    ).document;
    assert.equal(doc.snapshot.generatorVersion, 4);
    assert.equal(doc.snapshot.eurReference?.status, "available");
    const artifact = await service.download(actor, "w");
    verifyInvoiceArtifact(
      doc,
      { xml: artifact.xml, sha256: doc.sha256 },
      config.fiscalCode,
    );
    assert.match(artifact.xml, /5.4400 RON/);
    const beforeFrozen = calls.length;
    assert.equal((await eur.get(dispatcher, "w", "2026-11-07")).readOnly, true);
    assert.equal(calls.length, beforeFrozen);
    const omitted = (
      await draftService.put(
        "omit",
        {
          expectedRevision: 1,
          content: {
            ...c,
            eurReference: {
              status: "omitted",
              requestedDate: c.date,
              confirmedBy: "forged",
              confirmedAt: "forged",
            },
          },
        },
        dispatcher,
      )
    ).draft!;
    assert.equal(omitted.eurReference?.status, "omitted");
    if (omitted.eurReference?.status === "omitted") {
      assert.equal(omitted.eurReference.confirmedBy, "dispecer");
      assert.notEqual(omitted.eurReference.confirmedAt, "forged");
    }
    const op = await service.preview(dispatcher, "omit", {
      expectedRevision: omitted.revision,
    });
    if (!("previewHash" in op)) throw Error();
    await service.prepare(dispatcher, "omit", {
      expectedRevision: omitted.revision,
      previewHash: op.previewHash,
      operationId: "omit",
    });
    assert.match(
      (await service.download(dispatcher, "omit")).xml,
      /omitere confirmată/,
    );
    const bad = {
      ...c,
      lines: c.lines.map((l) => ({ ...l, name: "bad\u0001" })),
      eurReference: q7,
    };
    await draftService.put("bad", { expectedRevision: 1, content: bad }, actor);
    const bp = await service.preview(actor, "bad", { expectedRevision: 2 });
    if (!("previewHash" in bp)) throw Error();
    const beforeRollback = (await numbering.get(actor)).counter!.lastNumber;
    await assert.rejects(() =>
      service.prepare(actor, "bad", {
        expectedRevision: 2,
        previewHash: bp.previewHash,
        operationId: "bad",
      }),
    );
    assert.equal(
      (await numbering.get(actor)).counter!.lastNumber,
      beforeRollback,
    );
    assert.equal((await db.doc("invoices/bad").get()).exists, false);
    const historicalSnapshot = snapshotFixture();
    historicalSnapshot.workId = "historical";
    historicalSnapshot.generatorVersion = 2;
    const hist = invoiceXml(historicalSnapshot, "OLD0001");
    const histDoc = {
      workId: "historical",
      fiscalCode: config.fiscalCode,
      number: "OLD0001",
      snapshot: historicalSnapshot,
      sha256: digest(hist.xml),
      filename: hist.filename,
      state: "prepared_local",
      compatibility: "unverified",
      stock: "not_checked",
      preparedAt: "old",
      preparedBy: "admin",
      operationId: "old",
    };
    await db.doc("lucrari/historical").set(work);
    await db.doc("invoices/historical").set(histDoc);
    await db.doc("invoiceArtifacts/historical").set({
      workId: "historical",
      fiscalCode: config.fiscalCode,
      xml: hist.xml,
      sha256: histDoc.sha256,
      filename: hist.filename,
    });
    const count = calls.length;
    assert.equal((await eur.get(actor, "historical", c.date)).reference, null);
    assert.equal(calls.length, count);
    assert.equal((await service.download(actor, "historical")).xml, hist.xml);
    for (const target of [
      `invoiceExchangeRateQuotes/${q7.quoteId}`,
      "invoiceExchangeRateCache/" +
        createHash("sha256")
          .update(JSON.stringify("https://curs.bnr.ro/nbrfxrates10days.xml"))
          .digest("hex"),
    ])
      for (const token of ["", tokens.admin]) {
        const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${target}`,
          headers: Record<string, string> = token
            ? { Authorization: "Bearer " + token }
            : {};
        assert.equal((await fetch(url, { headers })).status, 403);
        assert.equal(
          (
            await fetch(url, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: '{"fields":{}}',
            })
          ).status,
          403,
        );
      }
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    console.log(
      "PASS EUR API/emulator: auth, cache/concurrency/TTL, immutable quotes, historical/year boundary, source errors/timeout/size/redirect, future dates, tamper/date conflicts, required reference, omission audit, XML v4/rollback/history, private cache. No external HTTP.",
    );
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{InvoiceIssuerSettings}from'./components/settings/invoice-issuer-settings';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';createRoot(document.getElementById('root')).render(<main style={{padding:16,minHeight:1500}}>{location.pathname==='/ticket'?<InvoiceDraftSection workId="browser" work={window.testWork}/>:<InvoiceIssuerSettings/>}</main>);`,
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
          path.join(root, "components/settings/invoice-issuer-settings.tsx"),
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
    await page.goto(url + "/ticket");
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    const ratePanel = page.getByRole("region", {
      name: "Curs EUR informativ",
      exact: true,
    });
    await expect(ratePanel).toContainText("1 EUR = 5.4400 RON");
    await expect(ratePanel).toContainText("2026-11-06");
    assert.equal(
      (await db.doc("invoiceDrafts/browser").get()).data()!.revision,
      1,
      "Auto proposal never saves draft",
    );
    await page
      .getByRole("button", { name: "Închide factura", exact: true })
      .click();
    await expect(
      page.getByLabel("Confirmare în editor", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await expect(ratePanel).toContainText("5.4400");
    const originalTotal = await page.getByTestId("invoice-total").textContent();
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    const browserSaved = (await db.doc("invoiceDrafts/browser").get()).data()!;
    assert.equal(browserSaved.eurReference.value, "5.4400");
    const callsBeforeReload = calls.length;
    await page.reload();
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await expect(ratePanel).toContainText("5.4400");
    assert.equal(
      calls.length,
      callsBeforeReload,
      "Reopen keeps saved reference without external refresh",
    );
    clock += 900001;
    rate = "5.5500";
    await ratePanel
      .getByRole("button", { name: "Actualizează cursul EUR", exact: true })
      .click();
    await expect(ratePanel).toContainText("Propunere: 1 EUR = 5.5500 RON");
    await ratePanel
      .getByRole("button", { name: "Folosește cursul actualizat", exact: true })
      .click();
    await expect(page.getByTestId("invoice-total")).toHaveText(originalTotal!);
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    assert.equal(
      (await db.doc(`invoiceExchangeRateQuotes/${q7.quoteId}`).get()).data()!
        .value,
      "5.3408",
    );
    await page
      .getByLabel("invoice: Data documentului", { exact: true })
      .fill("2026-11-08");
    await expect(ratePanel).toContainText("Pentru data facturii: 2026-11-08");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("invoice: Denumire 1", { exact: true })
      .fill("Editare păstrată");
    await page
      .getByLabel("invoice: Data documentului", { exact: true })
      .fill("2026-11-09");
    await expect(ratePanel.getByRole("alert")).toContainText("viitoare");
    await expect(
      page.getByLabel("invoice: Denumire 1", { exact: true }),
    ).toHaveValue("Editare păstrată");
    await ratePanel
      .getByRole("button", { name: "Continuă fără curs EUR", exact: true })
      .click();
    await ratePanel
      .getByRole("button", {
        name: "Confirmă continuarea fără curs EUR",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Simulează emiterea și trimiterea",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare emitere și trimitere" }),
    ).toContainText("omitere confirmată");
    await page
      .getByRole("button", {
        name: "Confirmă simularea emiterii și trimiterii",
        exact: true,
      })
      .click();
    await expect(
      page.getByText("Document pregătit în FOM:", { exact: false }),
    ).toBeVisible();
    const callsBeforeFrozen = calls.length;
    await page.reload();
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await expect(ratePanel).toContainText("omitere confirmată");
    assert.equal(calls.length, callsBeforeFrozen);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(ratePanel).toContainText("Fără curs EUR");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: "/tmp/fom-invoice-eur-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    assert.equal(
      (await db.doc("lucrari/browser").get()).data()!.statusFacturare,
      "Nefacturat",
    );
    console.log(
      "PASS EUR browser: automatic proposal without dirty/save, source/date, saved preservation, explicit refresh, unchanged totals, date invalidation, failed lookup preserves edits, explicit omission, prepare/reopen and 320/390px. No external HTTP.",
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
