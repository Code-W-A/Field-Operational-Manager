import { createInvoiceSagaArticleService } from "../lib/invoicing/saga-article.server";
import { invoiceSagaArticleHandlers } from "../lib/invoicing/saga-article-http";
import {
  withEurOmitted,
  eurFixtureHandlers,
} from "../lib/invoicing/eur-rate.fixtures";
import { createInvoiceSagaService } from "../lib/invoicing/saga-transfer.server";
import { importPolicy } from "../lib/saga/import";
import { createSagaClientsService } from "../lib/saga/clients.server";
import { sagaClientsHandlers } from "../lib/saga/clients-http";
import {
  createCommercialService,
  commercialReferenceId,
} from "../lib/invoicing/commercial.server";
import { commercialHandlers } from "../lib/invoicing/commercial-http";
import { createSagaReferencesService } from "../lib/saga/references.server";
import { sagaReferencesHandlers } from "../lib/saga/references-http";
import { verifyInvoiceArtifact } from "../lib/invoicing/saga-artifact.server";
import { validateReferenceRows } from "../lib/saga/references";
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
import { invoiceXmlHandlers } from "../lib/invoicing/xml-http";
import { issuerFixture, contentFixture } from "../lib/invoicing/xml.fixtures";
import { isUninvoicedWork } from "../lib/reports/uninvoiced";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-commercial",
  firestoreHost = "127.0.0.1:8386",
  authHost = "127.0.0.1:9386";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8386 },
          auth: { host: "127.0.0.1", port: 9386 },
          hub: { port: 4486 },
          logging: { port: 4586 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-invoice-commercial.ts")}\"`,
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
      () => config,
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
        { expectedRevision: 0, content: withEurOmitted(contentFixture()) },
        actor,
      );
    }
    const clients = sagaClientsHandlers(
      createSagaClientsService(db, () => config),
      authenticate,
    );
    const commercial = createCommercialService(db, () => config),
      commerce = commercialHandlers(commercial, authenticate);
    let sagaCalls = 0;
    const prices: Record<
      string,
      { name: string; unit: string; vat: string; price: string }
    > = {
      "0001": {
        name: "Piesă API",
        unit: "buc",
        vat: "21",
        price: "10.12345678",
      },
      "0009": { name: "Serviciu API", unit: "ora", vat: "0", price: "9.99" },
      "0099": { name: "Produs fără preț", unit: "buc", vat: "21", price: "0" },
    };
    let inlineClock = Date.now(),
      inlineStock = "10",
      inlineStockError = false;
    const inlinePrices: Record<
      string,
      { name: string; unit: string; vat: string; price: string }
    > = {
      ...prices,
      "00077": {
        name: "Produs direct API",
        unit: "buc",
        vat: "21",
        price: "12.50",
      },
      "00078": {
        name: "Serviciu direct API",
        unit: "ora",
        vat: "0",
        price: "9.99",
      },
      "00079": { name: "Fără preț API", unit: "buc", vat: "21", price: "" },
      "00080": { name: "Fără TVA API", unit: "buc", vat: "", price: "12.50" },
      "00082": {
        name: "Produs nou din editor",
        unit: "buc",
        vat: "21",
        price: "12.50",
      },
      "00081": { name: "Preț zero API", unit: "buc", vat: "21", price: "0" },
    };
    const inlineService = createInvoiceSagaArticleService(
      db,
      async (_actor, raw) => {
        const v = raw as {
          kind: "article" | "stock";
          code: string;
          warehouse?: string;
        };
        if (v.kind === "stock" && inlineStockError)
          throw Error("Simulated stock failure");
        return {
          kind: v.kind,
          code: v.code,
          warehouse: v.warehouse || null,
          date: null,
          checkedAt: new Date(inlineClock).toISOString(),
          ...(v.kind === "article"
            ? { article: inlinePrices[v.code] }
            : { quantity: inlineStock }),
        };
      },
      () => config,
      () => inlineClock,
    );
    const inlineHttp = invoiceSagaArticleHandlers(inlineService, authenticate);
    const refs = createSagaReferencesService(
        db,
        async (_actor, input) => {
          sagaCalls++;
          const code = (input as { code: string }).code;
          return {
            kind: "article",
            code,
            warehouse: null,
            date: null,
            article: prices[code],
            checkedAt: new Date().toISOString(),
          };
        },
        () => config,
      ),
      refHandlers = sagaReferencesHandlers(refs, authenticate);
    async function importRows(kind: any, input: unknown) {
      const rows = validateReferenceRows(kind, input),
        chunks = [];
      for (let i = 0; i < rows.length; i += 200)
        chunks.push(rows.slice(i, i + 200));
      const job = await refs.begin(actor, kind, {
        source: "fixture.csv",
        total: rows.length,
        hashes: chunks.map((c) =>
          createHash("sha256").update(JSON.stringify(c)).digest("hex"),
        ),
      });
      for (let i = 0; i < chunks.length; i++)
        await refs.batch(actor, kind, job.id, { index: i, rows: chunks[i] });
    }
    const clientId = createHash("sha256").update("0002").digest("hex");
    entry.id = clientId;
    link.sagaClientId = clientId;
    await rootCatalog.collection("clients").doc(clientId).set(entry);
    await rootCatalog.collection("clients").doc("s").delete();
    await rootCatalog.collection("clientLinks").doc("c").set(link);
    await importRows("articles", [
      { code: "0001", name: "Piesă din export", currency: "RON", price: "999" },
      { code: "0009", name: "Serviciu", currency: "RON" },
      { code: "0099", name: "Preț zero", currency: "RON" },
      { code: "0088", name: "Fără asociere", currency: "RON" },
    ]);
    await importRows("warehouses", [{ code: "01", name: "Depozit" }]);
    await importRows("agents", [{ code: "0004", name: "Agent API" }]);
    await importRows("clientTerms", [{ code: "0002", days: "14" }]);
    for (const code of ["0001", "0009", "0099"]) {
      const id = commercialReferenceId("articles", code),
        e = (
          await rootCatalog.collection("referenceItems").doc(id).get()
        ).data()!;
      await refs.verify(actor, id, { expectedRevision: e.revision });
    }
    await rootCatalog
      .collection("products")
      .doc("service")
      .set({
        ...product,
        id: "service",
        code: "0009",
        name: "Serviciu",
        articleName: "Serviciu",
        unit: "ora",
        kind: "service",
        warehouseIds: [],
      });
    await rootCatalog
      .collection("products")
      .doc("zero")
      .set({
        ...product,
        id: "zero",
        code: "0099",
        kind: "service",
        warehouseIds: [],
      });
    async function bind(kind: string, code: string, targetId: string) {
      const id = commercialReferenceId(kind, code),
        e = (
          await rootCatalog.collection("referenceItems").doc(id).get()
        ).data()!,
        p = (
          await rootCatalog
            .collection(kind === "articles" ? "products" : "warehouses")
            .doc(targetId)
            .get()
        ).data()!;
      return commercial.bind(actor, id, {
        targetId,
        expectedRevision: 0,
        expectedReferenceRevision: e.revision,
        expectedTargetRevision: p.revision,
        confirmUnit: true,
      });
    }
    await bind("articles", "0001", "p");
    await bind("articles", "0009", "service");
    await bind("articles", "0099", "zero");
    await bind("warehouses", "01", "g");
    const agentId = commercialReferenceId("agents", "0004");
    for (const [uid, prefix] of [
      ["admin", "NRGA F26"],
      ["dispecer", "NRGV F26"],
    ])
      await refs.saveProfile(actor, uid, {
        expectedRevision: 0,
        prefix,
        lastVerifiedNumber: "0000",
        agentId,
        agentRevision: 1,
        exclusiveConfirmed: true,
        lastNumberConfirmed: true,
      });
    await service.saveProfile(actor, {
      expectedRevision: 0,
      profile: issuerFixture,
    });
    const legacyInput = {
      expectedRevision: 0,
      prefix: "OLD",
      lastVerifiedNumber: "0000",
      reason: "",
      exclusiveConfirmed: true,
      sagaVerified: true,
    };
    const legacyPreview = await numbering.preview(actor, legacyInput);
    await numbering.put(actor, {
      ...legacyInput,
      confirmationHash: legacyPreview.confirmationHash,
    });
    await seed("historical");
    const hp = await service.preview(actor, "historical", {
      expectedRevision: 1,
    });
    if (!("previewHash" in hp)) throw Error();
    const historical = (
      await service.prepare(actor, "historical", {
        expectedRevision: 1,
        previewHash: hp.previewHash,
        operationId: "historical",
      })
    ).document;
    const historicalArtifact = (
      await db.doc("invoiceArtifacts/historical").get()
    ).data();
    for (const id of [
      "old",
      "api",
      "browser",
      "rollback",
      "unknown",
      "staleApply",
      "legacyRefresh",
      "inline",
      "inlineBrowser",
    ])
      await seed(id);
    const users = await numbering.users.list(actor),
      activation = {
        expectedRevision: 0,
        profiles: users.entries.map((e) => ({
          uid: e.user.uid,
          expectedRevision: e.profile.revision,
        })),
      },
      activationPreview = await numbering.users.preview(actor, activation);
    await numbering.users.activate(actor, {
      ...activation,
      confirmationHash: activationPreview.confirmationHash,
    });
    const eurHttp = eurFixtureHandlers(db, authenticate);
    async function dispatch(r: Request) {
      const p = new URL(r.url).pathname,
        id = p.split("/")[3];
      if (p.endsWith("/saga-article/preview")) return inlineHttp.preview(r, id);
      if (p.endsWith("/saga-article/apply")) return inlineHttp.apply(r, id);
      if (p.endsWith("/stock")) return inlineHttp.stock(r, id);
      if (p.endsWith("/eur-rate")) return eurHttp.get(r, id);
      if (p.endsWith("/clients")) return clients.search(r);
      if (p.endsWith("/commercial-policy"))
        return r.method === "PUT" ? commerce.activate(r) : commerce.policy(r);
      if (p.includes("/commercial-products")) return commerce.products(r);
      if (p.includes("/commercial-bindings/")) {
        const bid = p.split("/").at(-1)!;
        return r.method === "PUT"
          ? commerce.bind(r, bid)
          : commerce.binding(r, bid);
      }
      if (p.endsWith("/commercial-context")) return commerce.context(r, id);
      if (p.endsWith("/commercial-preview")) return commerce.preview(r, id);
      if (p.includes("/references/")) {
        const parts = p.split("/"),
          kind = parts[5];
        return refHandlers.list(r, kind);
      }
      if (p.endsWith("/invoice-xml/preview")) return handlers.preview(r, id);
      if (p.endsWith("/invoice-xml"))
        return r.method === "POST"
          ? handlers.prepare(r, id)
          : handlers.document(r, id);
      if (p.endsWith("/invoice-xml/download")) return handlers.download(r, id);
      if (p.endsWith("/number"))
        return Response.json(
          await numbering.estimate(await authenticate(r), id),
        );
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
      if (p.endsWith("/catalog"))
        return Response.json(await catalog.list(await authenticate(r)));
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
    const request = (
      p: string,
      role = "admin",
      body?: unknown,
      method = body ? "POST" : "GET",
    ) =>
      dispatch(
        new Request("http://localhost" + p, {
          method,
          headers: tokens[role]
            ? { Authorization: "Bearer " + tokens[role] }
            : { Cookie: "userRole=admin" },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    const base = "/api/integrations/saga";
    assert.equal((await request(base + "/commercial-policy", "")).status, 401);
    assert.equal(
      (
        await request(
          base + "/commercial-policy",
          "dispecer",
          { expectedRevision: 0, confirmed: true },
          "PUT",
        )
      ).status,
      403,
    );
    // Activation is exercised in the browser after these API permission checks.
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{InvoiceCommercialSettings}from'./components/settings/invoice-commercial-settings';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';createRoot(document.getElementById('root')).render(<main style={{padding:16,minHeight:1500}}>{location.pathname==='/ticket'?<InvoiceDraftSection workId={new URLSearchParams(location.search).get('work')||'browser'} work={window.testWork}/>:<InvoiceCommercialSettings/>}</main>);`,
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
            "components/settings/invoice-commercial-settings.tsx",
          ),
          path.join(root, "components/invoicing/invoice-commercial.tsx"),
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
        const role =
          req.url?.startsWith("/ticket") && !req.url.includes("role=admin")
            ? "dispecer"
            : "admin";
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
    const activationCounterBefore = (await numbering.get(actor)).counter!
      .allocationCount;
    await page.goto(`${url}/ticket?work=old&role=admin`);
    await page
      .getByRole("button", { name: "Continuă ciorna", exact: true })
      .click();
    const activateInline = page.getByRole("region", {
      name: "Activare facturare cu date SAGA",
    });
    await expect(
      activateInline.getByRole("button", {
        name: "Activează facturarea cu date SAGA",
        exact: true,
      }),
    ).toBeDisabled();
    await activateInline.getByRole("checkbox").check();
    await activateInline
      .getByRole("button", {
        name: "Activează facturarea cu date SAGA",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: "Aplicare reguli SAGA" }),
    ).toBeVisible();
    assert.equal((await commercial.policy(actor)).enabled, true);
    assert.equal(
      (await numbering.get(actor)).counter!.allocationCount,
      activationCounterBefore,
    );
    // Reset only this isolated policy fixture so the existing Settings activation scenario remains covered.
    await rootCatalog.collection("commercialPolicy").doc("current").delete();
    await page.goto(url);
    const settings = page.getByRole("region", {
      name: "Reguli comerciale SAGA",
    });
    await settings
      .getByLabel(
        "Confirm activarea regulilor comerciale pentru firma conectată",
      )
      .check();
    await settings
      .getByRole("button", {
        name: "Activează regulile comerciale",
        exact: true,
      })
      .click();
    await expect(settings.getByRole("status")).toContainText(
      "Nicio factură nu a fost emisă",
    );
    assert.equal(sagaCalls, 3);
    await service.prepare(dispatcher, "historical", {
      expectedRevision: 1,
      previewHash: hp.previewHash,
      operationId: "historic-retry",
    });
    assert.deepEqual(
      (await db.doc("invoiceArtifacts/historical").get()).data(),
      historicalArtifact,
    );
    const activate = await commercial.policy(actor);
    assert.equal(activate.enabled, true);
    await assert.rejects(() =>
      commercial.activate(actor, { expectedRevision: 0, confirmed: true }),
    );
    const xmlPreview = async (id: string, who = actor) => {
      const d = (await db.doc(`invoiceDrafts/${id}`).get()).data()!;
      return service.preview(who, id, { expectedRevision: d.revision });
    };
    await assert.rejects(
      () => xmlPreview("old"),
      (e) => (e as { code: string }).code === "COMMERCIAL_REQUIRED",
    );
    async function apply(id: string, who = actor, approve = false) {
      const d = (await draftService.get(id, who)).draft!,
        p = await commercial.preview(who, id, {
          expectedRevision: d.revision,
          content: (await import("../lib/invoicing/draft")).invoiceContent(d),
        });
      return draftService.put(
        id,
        {
          expectedRevision: d.revision,
          content: p.content,
          commercialHash: p.confirmationHash,
          approveDiscount: approve,
        },
        who,
      );
    }
    const before = (await db.doc("invoiceDrafts/old").get()).data()!;
    const legacyRefresh = (await draftService.get("legacyRefresh", actor))
      .draft!;
    const legacySaved = (
      await draftService.put(
        "legacyRefresh",
        {
          expectedRevision: legacyRefresh.revision,
          content: (await import("../lib/invoicing/draft")).invoiceContent(
            legacyRefresh,
          ),
          refreshSource: true,
        },
        actor,
      )
    ).draft!;
    assert.equal(legacySaved.commercial, undefined);
    await assert.rejects(
      () => xmlPreview("legacyRefresh"),
      (e) => (e as { code: string }).code === "COMMERCIAL_REQUIRED",
    );
    const old = (await apply("old", dispatcher)).draft!;
    assert.equal(old.beneficiary.address, before.beneficiary.address);
    assert.equal(old.lines[0].price, "10.12345678");
    assert.equal(old.lines[0].vatPercent, "21");
    assert.equal(old.dueDate, "2026-11-21");
    assert.equal(old.commercial?.discountApproval, undefined);
    await assert.rejects(() => xmlPreview("old", dispatcher), /Discountul/);
    const { invoiceContent } = await import("../lib/invoicing/draft");
    for (const protectedFieldsActor of [dispatcher, actor]) {
      for (const [key, value] of [
        ["price", "0.01"],
        ["um", "kg"],
        ["vatPercent", "0"],
      ]) {
        const bad = invoiceContent(old);
        bad.lines = bad.lines.map((l) => ({ ...l, [key]: value }));
        await assert.rejects(
          () =>
            draftService.put(
              "old",
              { expectedRevision: old.revision, content: bad },
              protectedFieldsActor,
            ),
          (e) => (e as { status: number }).status === 403,
        );
      }
    }
    const discountForgery = invoiceContent(old);
    discountForgery.discountPercent = "99";
    await assert.rejects(
      () =>
        draftService.put(
          "old",
          { expectedRevision: old.revision, content: discountForgery },
          dispatcher,
        ),
      (e) => (e as { status: number }).status === 403,
    );
    await draftService.put(
      "old",
      {
        expectedRevision: old.revision,
        content: invoiceContent(old),
        approveDiscount: true,
      },
      actor,
    );
    assert.equal(
      (await rootCatalog.collection("commercialDiscountAudit").get()).size,
      1,
    );
    await xmlPreview("old");
    const api = (await apply("api", actor, true)).draft!;
    const stale = invoiceContent(api),
      rid = commercialReferenceId("articles", "0001");
    prices["0001"].price = "11.25";
    const re = (
      await rootCatalog.collection("referenceItems").doc(rid).get()
    ).data()!;
    await refs.verify(actor, rid, { expectedRevision: re.revision });
    await assert.rejects(
      () =>
        draftService.put(
          "api",
          { expectedRevision: api.revision, content: stale },
          actor,
        ),
      (e) => (e as { status: number }).status === 409,
    );
    await assert.rejects(
      () => xmlPreview("api"),
      (e) => (e as { status: number }).status === 409,
    );
    const updated = (await apply("api", actor, true)).draft!;
    assert.equal(updated.lines[0].price, "11.25");
    const lookup = await commercial.products(dispatcher, { q: "000" });
    assert.ok(
      lookup.entries.find((e) => e.entry.code === "0009")?.issues.length === 0,
    );
    assert.ok(
      (await commercial.products(actor, { q: "0088" })).entries[0].issues
        .length > 0,
    );
    assert.ok(
      (await commercial.products(actor, { q: "0099" })).entries[0].issues.some(
        (i) => i.includes("Preț"),
      ),
    );
    // Explicitly absent/zero and unknown client terms are handled independently.
    await importRows("clientTerms", [{ code: "0002", termState: "unknown" }]);
    const unknown = (await apply("unknown", actor, true)).draft!;
    assert.equal(unknown.dueDate, "");
    await assert.rejects(() => xmlPreview("unknown"), /scadența/);
    const manual = invoiceContent(unknown);
    manual.commercial!.dueMode = "manual";
    manual.dueDate = "2026-12-01";
    await draftService.put(
      "unknown",
      { expectedRevision: unknown.revision, content: manual },
      actor,
    );
    await xmlPreview("unknown");
    await importRows("clientTerms", [{ code: "0002", termState: "none" }]);
    assert.equal(
      (await apply("api", actor, true)).draft!.dueDate,
      "2026-11-07",
    );
    await importRows("clientTerms", [{ code: "0002", days: "0" }]);
    assert.equal(
      (await apply("api", actor, true)).draft!.dueDate,
      "2026-11-07",
    );
    await importRows("clientTerms", [{ code: "0002", days: "14" }]);
    // Zero/missing VAT/missing currency never become a successful fiscal preparation.
    const badRef = (
      await rootCatalog.collection("referenceItems").doc(rid).get()
    ).data()!;
    for (const change of [{ price: "0" }, { vat: null }, { price: null }]) {
      await rootCatalog
        .collection("referenceItems")
        .doc(rid)
        .set({
          ...badRef,
          apiSnapshot: { ...badRef.apiSnapshot, ...change },
          revision: badRef.revision + 1,
        });
      const d = (await apply("api", actor, true)).draft!;
      assert.ok(d.totals.incomplete || change.price === "0");
      await assert.rejects(() => xmlPreview("api"));
      await rootCatalog.collection("referenceItems").doc(rid).set(badRef);
    }
    await rootCatalog
      .collection("referenceItems")
      .doc(rid)
      .update({ "exportData.currency": "EUR", revision: badRef.revision + 1 });
    await apply("api", actor, true);
    await assert.rejects(() => xmlPreview("api"), /RON/);
    await rootCatalog.collection("referenceItems").doc(rid).set(badRef);
    // Incomplete new drafts are version 2; a forged legacy save cannot bypass active policy.
    await db.doc("lucrari/new").set(work);
    const fresh = await draftService.get("new", dispatcher);
    assert.equal(fresh.draft?.schemaVersion, 2);
    await assert.rejects(
      () =>
        draftService.put(
          "new",
          { expectedRevision: 0, content: withEurOmitted(contentFixture()) },
          actor,
        ),
      (e) => (e as { status: number }).status === 409,
    );
    assert.equal((await db.doc("invoiceDrafts/new").get()).exists, false);
    for (const p of [
      "sagaCatalogs/123456/commercialPolicy/current",
      `sagaCatalogs/123456/commercialBindings/${rid}`,
    ]) {
      const u = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${p}`;
      for (const token of ["", tokens.admin]) {
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        assert.equal((await fetch(u, { headers })).status, 403);
        assert.equal(
          (
            await fetch(u, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: '{"fields":{}}',
            })
          ).status,
          403,
        );
      }
    }
    const fiscal = (await apply("old", actor, true)).draft!;
    const wrongFiscal = invoiceContent(fiscal);
    wrongFiscal.beneficiary = { ...wrongFiscal.beneficiary, cui: "RO999" };
    await assert.rejects(
      () =>
        draftService.put(
          "old",
          { expectedRevision: fiscal.revision, content: wrongFiscal },
          actor,
        ),
      /Identitatea fiscală/,
    );
    const rollback = (await apply("rollback", actor, true)).draft!,
      badXml = invoiceContent(rollback);
    badXml.extraInfo = "bad\u0001";
    await draftService.put(
      "rollback",
      { expectedRevision: rollback.revision, content: badXml },
      actor,
    );
    const badPreview = await xmlPreview("rollback");
    if (!("previewHash" in badPreview)) throw Error();
    const beforeNumber = (await numbering.get(actor)).counter!.lastNumber;
    await assert.rejects(() =>
      service.prepare(actor, "rollback", {
        expectedRevision: badPreview.snapshot.draftRevision,
        previewHash: badPreview.previewHash,
        operationId: "rollback",
      }),
    );
    assert.equal(
      (await numbering.get(actor)).counter!.lastNumber,
      beforeNumber,
    );
    assert.equal((await db.doc("invoices/rollback").get()).exists, false);
    const staleDraft = (await draftService.get("staleApply", actor)).draft!,
      staleApply = await commercial.preview(actor, "staleApply", {
        expectedRevision: staleDraft.revision,
        content: invoiceContent(staleDraft),
      });
    const previousBinding = (await commercial.binding(actor, rid)).binding!;
    await commercial.bind(actor, rid, {
      targetId: "p",
      expectedRevision: previousBinding.revision,
      expectedReferenceRevision: badRef.revision,
      expectedTargetRevision: product.revision,
      confirmUnit: true,
    });
    await assert.rejects(
      () =>
        draftService.put(
          "staleApply",
          {
            expectedRevision: staleDraft.revision,
            content: staleApply.content,
            commercialHash: staleApply.confirmationHash,
          },
          actor,
        ),
      (e) => (e as { status: number }).status === 409,
    );
    const frozen = (await db.collection("invoiceNumberReservations").get())
      .size;
    assert.equal(frozen, 1, "Only historical XML consumed a number so far");
    console.log(
      "PASS commercial API/emulator: explicit activation/conversion, missing data, protected fields, API source precedence, discount approval, stale source conflict, term states, no legacy downgrade, private Firestore and no number on failed preparation.",
    );
    await settings
      .getByText("Legături explicite între referințe și asocierile FOM", {
        exact: true,
      })
      .click();
    await settings
      .getByLabel("Tip legătură comercială")
      .selectOption("warehouses");
    await settings
      .getByRole("button", {
        name: "Încarcă referințele pentru asociere",
        exact: true,
      })
      .click();
    await settings
      .getByLabel("Referință pentru legătura comercială")
      .selectOption(commercialReferenceId("warehouses", "01"));
    await expect(settings.getByLabel("Țintă legătură comercială")).toHaveValue(
      "g",
    );
    await settings
      .getByRole("button", {
        name: "Salvează legătura comercială",
        exact: true,
      })
      .click();
    await expect(settings.getByRole("status")).toContainText("exclusiv în FOM");
    const callsBeforeBrowser = sagaCalls;
    await page.goto(url + "/ticket");
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await page
      .getByRole("button", { name: "Aplică regulile SAGA", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare reguli SAGA" }),
    ).toContainText("11.25");
    await page
      .getByRole("button", {
        name: "Confirmă și salvează regulile SAGA",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("invoice: Preț unitar 1")).toHaveValue(
      "11.25",
    );
    await expect(page.getByLabel("invoice: Preț unitar 1")).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(page.getByLabel("invoice: UM 1")).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(page.getByLabel("invoice: Reducere (%)")).toHaveAttribute(
      "readonly",
      "",
    );
    await expect(page.getByLabel("TVA linie 1", { exact: true })).toHaveValue(
      "21",
    );
    const browserDraft = (await draftService.get("browser", actor)).draft!;
    await draftService.put(
      "browser",
      {
        expectedRevision: browserDraft.revision,
        content: invoiceContent(browserDraft),
        approveDiscount: true,
      },
      actor,
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await page
      .getByText("Identifică clientul după CUI sau denumire", { exact: true })
      .click();
    await page
      .getByLabel("Caută client SAGA după CUI sau denumire", { exact: true })
      .fill("123");
    await page
      .getByRole("button", { name: "Caută client în referințe", exact: true })
      .click();
    await expect(
      page.getByText("0002 — Client · CUI RO123", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Informații suplimentare factură", { exact: true })
      .fill("Factură & detalii client");
    await page
      .getByLabel("Informații suplimentare linie 1", { exact: true })
      .fill("Linie <detaliu>");
    await page
      .getByRole("button", { name: "Adaugă poziție", exact: true })
      .click();
    await page
      .getByLabel("Caută referință articol 2", { exact: true })
      .fill("0009");
    await page
      .getByLabel("Caută referință articol 2", { exact: true })
      .press("Enter");
    await expect(
      page.getByRole("button", { name: "Alege 0009", exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("Caută referință articol 2", { exact: true })
      .press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("TVA linie 2", { exact: true })).toHaveValue(
      "0",
    );
    await page.getByLabel("invoice: Cantitate 2", { exact: true }).fill("2");
    await page
      .getByLabel("invoice: Data documentului", { exact: true })
      .fill("2026-11-08");
    await expect(
      page.getByLabel("invoice: Scadență", { exact: true }),
    ).toHaveValue("2026-11-22");
    await page
      .getByLabel("invoice: Scadență", { exact: true })
      .fill("2026-11-30");
    await page
      .getByLabel("invoice: Data documentului", { exact: true })
      .fill("2026-11-09");
    await expect(
      page.getByLabel("invoice: Scadență", { exact: true }),
    ).toHaveValue("2026-11-30");
    await page
      .getByRole("button", { name: "Revino la scadență automată", exact: true })
      .click();
    await expect(
      page.getByLabel("invoice: Scadență", { exact: true }),
    ).toHaveValue("2026-11-23");
    const eurPanel = page.getByRole("region", {
      name: "Curs EUR informativ",
      exact: true,
    });
    await expect(eurPanel.getByRole("alert")).toContainText("viitoare");
    await eurPanel
      .getByRole("button", { name: "Continuă fără curs EUR", exact: true })
      .click();
    await eurPanel
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
      .getByRole("button", { name: "Pregătește XML", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare XML" }),
    ).toContainText("Agent SAGA: 0004");
    await page
      .getByRole("button", { name: "Confirmă pregătirea XML", exact: true })
      .click();
    await expect(
      page.getByText("Document XML pregătit în FOM", { exact: true }),
    ).toBeVisible();
    const doc = (await service.document(dispatcher, "browser")).document!,
      artifact = await service.download(dispatcher, "browser");
    assert.equal(doc.snapshot.generatorVersion, 4);
    assert.equal(doc.snapshot.lines[1].vatPercent, "0");
    assert.match(artifact.xml, /<FacturaAgent>0004<\/FacturaAgent>/);
    assert.match(artifact.xml, /Factură &amp; detalii client/);
    verifyInvoiceArtifact(
      doc,
      { xml: artifact.xml, sha256: doc.sha256 },
      config.fiscalCode,
    );
    const dry = createInvoiceSagaService(db, {
      config: () => config,
      policy: () => importPolicy({}),
      gateway: {
        readForInvoice: async () => {
          throw Error("No upstream in dry-run");
        },
        importForInvoice: async () => {
          throw Error("No upstream in dry-run");
        },
      },
    });
    assert.equal(
      (
        await dry.start(dispatcher, "browser", {
          sha256: doc.sha256,
          operationId: "commercial-dry",
        })
      ).mode,
      "dry-run",
    );
    await page.reload();
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    await expect(
      page.getByLabel("Informații suplimentare factură", { exact: true }),
    ).toHaveValue("Factură & detalii client");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await expect(
        page.getByText("Document XML pregătit în FOM", { exact: true }),
      ).toBeVisible();
    }
    await page.screenshot({
      path: "/tmp/fom-commercial-ticket-mobile.png",
      fullPage: true,
    });
    // Direct article flow, with no article/warehouse-reference import.
    let inlineDraft = (await apply("inline", actor, true)).draft!;
    inlineDraft = (
      await draftService.put(
        "inline",
        {
          expectedRevision: inlineDraft.revision,
          content: {
            ...invoiceContent(inlineDraft),
            lines: [],
            discountPercent: "0",
          },
        },
        actor,
      )
    ).draft!;
    const inlinePath = "/api/lucrari/inline/invoice-draft/saga-article";
    const lookupInline = async (code: string, role = "dispecer") => {
      const r = await request(inlinePath + "/preview", role, {
        code,
        expectedRevision: inlineDraft.revision,
      });
      assert.equal(r.status, 200, await r.clone().text());
      return r.json();
    };
    const selection = (p: any) => ({
      previewId: p.previewId,
      quantity: "2",
      warehouseId: "g",
      kind: "goods",
      confirmRON: true,
    });
    assert.equal(
      (
        await request(inlinePath + "/preview", "", {
          code: "00077",
          expectedRevision: inlineDraft.revision,
        })
      ).status,
      401,
    );
    await db.doc("users/tehnician").set({ role: "tehnician" });
    await assert.rejects(
      () =>
        inlineService.preview(
          { uid: "tehnician", role: "tehnician" },
          "inline",
          { code: "00077", expectedRevision: inlineDraft.revision },
        ),
      (e: any) => e.status === 403,
    );
    await assert.rejects(
      () =>
        inlineService.preview(dispatcher, "browser", {
          code: "00077",
          expectedRevision: 1,
        }),
      (e: any) => e.status === 409,
    );
    let p = await lookupInline("00077");
    assert.equal(p.code, "00077");
    assert.equal(p.kind, null);
    assert.equal(p.currencyConfirmed, false);
    assert.equal(
      (
        await rootCatalog
          .collection("products")
          .where("code", "==", "00077")
          .get()
      ).size,
      0,
    );
    assert.equal(
      (
        await request(inlinePath + "/apply", "dispecer", {
          ...selection(p),
          confirmRON: false,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(inlinePath + "/apply", "dispecer", {
          ...selection(p),
          warehouseId: "other",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(inlinePath + "/apply", "dispecer", {
          ...selection(p),
          price: "0.01",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(inlinePath + "/apply", "dispecer", {
          ...selection(p),
          quantity: "-1",
        })
      ).status,
      400,
    );
    await assert.rejects(
      () =>
        inlineService.stock(actor, "inline", {
          previewId: p.previewId,
          warehouseId: "g",
        }),
      (e: any) => e.status === 404,
    );
    let st = await inlineService.stock(dispatcher, "inline", {
      previewId: p.previewId,
      warehouseId: "g",
      kind: "goods",
    });
    assert.equal(st.quantity, "10");
    const rival = await lookupInline("00077", "admin");
    const raced = await Promise.all([
      request(inlinePath + "/apply", "dispecer", selection(p)),
      request(inlinePath + "/apply", "admin", selection(rival)),
    ]);
    assert.deepEqual(raced.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (
        await rootCatalog
          .collection("products")
          .where("code", "==", "00077")
          .get()
      ).size,
      1,
    );
    assert.deepEqual(
      (await db.doc("invoiceDrafts/inline").get()).data()!.lines,
      [],
    );
    p = await lookupInline("00077");
    assert.equal(p.kind, "goods");
    assert.equal(p.currencyConfirmed, true);
    const applied = await request(
      inlinePath + "/apply",
      "dispecer",
      selection(p),
    );
    assert.equal(applied.status, 200, await applied.clone().text());
    const directLine = (await applied.json()).line;
    const retryLine = (
      await (
        await request(inlinePath + "/apply", "dispecer", selection(p))
      ).json()
    ).line;
    assert.deepEqual(retryLine, directLine);
    assert.equal(directLine.saga.snapshot.code, "00077");
    assert.equal(directLine.price, "12.50");
    const entryDirect = (
      await rootCatalog
        .collection("referenceItems")
        .doc(commercialReferenceId("articles", "00077"))
        .get()
    ).data()!;
    assert.equal(entryDirect.exportData.currency, undefined);
    assert.equal(entryDirect.operatorConfirmation.currency, "RON");
    assert.equal(
      entryDirect.operatorConfirmation.uid === "admin" ||
        entryDirect.operatorConfirmation.uid === "dispecer",
      true,
    );
    const inlineStale = await lookupInline("00077");
    await rootCatalog
      .collection("products")
      .doc(directLine.saga.productId)
      .update({ revision: 2 });
    assert.equal(
      (await request(inlinePath + "/apply", "dispecer", selection(inlineStale)))
        .status,
      409,
    );
    await rootCatalog
      .collection("products")
      .doc(directLine.saga.productId)
      .update({ revision: 1 });
    const expiring = await lookupInline("00077");
    inlineClock += 600001;
    assert.equal(
      (await request(inlinePath + "/apply", "dispecer", selection(expiring)))
        .status,
      409,
    );
    for (const code of ["00079", "00080", "00081"]) {
      const invalid = await lookupInline(code);
      assert.ok(invalid.issues.length > 0);
      assert.equal(
        (await request(inlinePath + "/apply", "dispecer", selection(invalid)))
          .status,
        409,
      );
      assert.equal(
        (
          await rootCatalog
            .collection("products")
            .where("code", "==", code)
            .get()
        ).size,
        0,
      );
    }
    const knownForeign = await rootCatalog
      .collection("referenceItems")
      .doc(commercialReferenceId("articles", "00077"))
      .get();
    await knownForeign.ref.update({ "exportData.currency": "EUR" });
    const foreign = await lookupInline("00077");
    assert.ok(foreign.issues.some((s: string) => s.includes("RON")));
    assert.equal(
      (await request(inlinePath + "/apply", "dispecer", selection(foreign)))
        .status,
      409,
    );
    await knownForeign.ref.set(knownForeign.data()!);
    const invalidUnit = { ...inlinePrices["00077"] };
    inlinePrices["00077"].unit = "kg";
    const unitMismatch = await lookupInline("00077");
    assert.ok(unitMismatch.issues.length);
    assert.equal(
      (
        await request(
          inlinePath + "/apply",
          "dispecer",
          selection(unitMismatch),
        )
      ).status,
      409,
    );
    inlinePrices["00077"] = invalidUnit;
    const whRef = rootCatalog.collection("warehouses").doc("g");
    const otherWh = rootCatalog.collection("warehouses").doc("g2");
    await otherWh.set({
      ...(await whRef.get()).data()!,
      id: "g2",
      code: "02",
      name: "Alt depozit",
    });
    const permitted = await lookupInline("00077");
    assert.deepEqual(
      permitted.warehouses.map((w: any) => w.id),
      ["g"],
    );
    assert.equal(
      (
        await request(inlinePath + "/apply", "dispecer", {
          ...selection(permitted),
          warehouseId: "g2",
        })
      ).status,
      400,
    );
    const svc = await lookupInline("00078");
    const serviceResult = await request(inlinePath + "/apply", "dispecer", {
      ...selection(svc),
      kind: "service",
      warehouseId: "",
    });
    assert.equal(serviceResult.status, 200);
    const serviceLine = (await serviceResult.json()).line;
    assert.equal(serviceLine.vatPercent, "0");
    assert.equal(serviceLine.saga.warehouseId, "");
    const quoteDoc = rootCatalog
      .collection("articleLookups")
      .doc(svc.previewId);
    const directUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${quoteDoc.path}`;
    assert.equal(
      (
        await fetch(directUrl, {
          headers: { Authorization: `Bearer ${tokens.admin}` },
        })
      ).status,
      403,
    );
    // Save two lines of the same article; the second unchanged lookup must not invalidate the first.
    const repeated = await lookupInline("00077");
    const secondLine = (
      await (
        await request(inlinePath + "/apply", "dispecer", {
          ...selection(repeated),
          quantity: "0.5",
        })
      ).json()
    ).line;
    inlineDraft = (
      await draftService.put(
        "inline",
        {
          expectedRevision: inlineDraft.revision,
          content: {
            ...invoiceContent(inlineDraft),
            lines: [directLine, secondLine, serviceLine],
          },
        },
        dispatcher,
      )
    ).draft!;
    const inlinePreview = await service.preview(dispatcher, "inline", {
      expectedRevision: inlineDraft.revision,
    });
    assert.ok("previewHash" in inlinePreview);
    assert.equal((await db.doc("invoices/inline").get()).exists, false);
    const unsavedQuote = await inlineService.preview(dispatcher, "new", {
      code: "00077",
      expectedRevision: 0,
    });
    await inlineService.apply(dispatcher, "new", selection(unsavedQuote));
    assert.equal((await db.doc("invoiceDrafts/new").get()).exists, false);
    console.log(
      "PASS direct article API: no import, both roles, owner isolation, TTL, conflicts, atomic dedupe, retry, protected fields, permissioned warehouses, services/VAT zero, source provenance, repeated rows save and XML preview.",
    );
    await importRows("articles", [
      { code: "00077", name: entryDirect.name, currency: "RON" },
    ]);
    const afterLaterImport = (
      await rootCatalog
        .collection("referenceItems")
        .doc(commercialReferenceId("articles", "00077"))
        .get()
    ).data()!;
    assert.deepEqual(
      afterLaterImport.operatorConfirmation,
      entryDirect.operatorConfirmation,
    );
    assert.deepEqual(afterLaterImport.apiSnapshot, entryDirect.apiSnapshot);
    // A fresh browser draft starts with no lines and does not require reference import.
    let browserInline = (await apply("inlineBrowser", actor, true)).draft!;
    browserInline = (
      await draftService.put(
        "inlineBrowser",
        {
          expectedRevision: browserInline.revision,
          content: {
            ...invoiceContent(browserInline),
            lines: [],
            discountPercent: "0",
          },
        },
        actor,
      )
    ).draft!;
    await page.goto(`${url}/ticket?work=inlineBrowser`);
    await page
      .getByRole("button", { name: /Continuă ciorna|Începe factura/ })
      .click();
    const directUi = page.getByRole("region", {
      name: "Produs direct din SAGA",
    });
    await directUi
      .getByRole("button", { name: "Adaugă produs din SAGA", exact: true })
      .click();
    await directUi
      .getByLabel("Cod articol SAGA", { exact: true })
      .fill("00082");
    await directUi
      .getByLabel("Cod articol SAGA", { exact: true })
      .press("Enter");
    await expect(
      directUi.getByText("00082 · Produs nou din editor", { exact: true }),
    ).toBeVisible();
    await expect(
      directUi.getByRole("button", { name: "Adaugă în factură", exact: true }),
    ).toBeDisabled();
    await directUi.getByLabel("Tip articol direct SAGA").selectOption("goods");
    await directUi
      .getByRole("checkbox", { name: /Am verificat că prețul/ })
      .check();
    await directUi.getByLabel("Gestiune produs direct SAGA").selectOption("g");
    await expect(directUi.getByText(/Stoc: 10/)).toBeVisible();
    await directUi
      .getByLabel("Cantitate de adăugat", { exact: true })
      .fill("11");
    await expect(directUi.getByText(/Stoc insuficient/)).toBeVisible();
    await directUi
      .getByLabel("Cantitate de adăugat", { exact: true })
      .fill("2");
    await expect(directUi.getByText(/Stoc insuficient/)).toHaveCount(0);
    inlineStockError = true;
    await directUi.getByLabel("Gestiune produs direct SAGA").selectOption("");
    await directUi.getByLabel("Gestiune produs direct SAGA").selectOption("g");
    await expect(directUi.getByText(/Stoc neconfirmat/)).toBeVisible();
    inlineStockError = false;
    inlineStock = "0";
    await directUi
      .getByRole("button", { name: "Reîncearcă citirea stocului" })
      .click();
    await expect(directUi.getByText(/Stoc: 0/)).toBeVisible();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.screenshot({
      path: "/tmp/fom-saga-direct-mobile.png",
      fullPage: true,
    });
    await directUi
      .getByRole("button", { name: "Adaugă în factură", exact: true })
      .click();
    await expect(
      page.getByLabel("invoice: Preț unitar 1", { exact: true }),
    ).toHaveValue("12.50");
    await expect(
      page.getByLabel("invoice: Preț unitar 1", { exact: true }),
    ).toHaveAttribute("readonly", "");
    inlineStock = "10";
    await directUi
      .getByRole("button", { name: "Adaugă produs din SAGA", exact: true })
      .click();
    await directUi
      .getByLabel("Cod articol SAGA", { exact: true })
      .fill("00082");
    await directUi
      .getByRole("button", { name: "Preia din SAGA", exact: true })
      .click();
    await expect(directUi.getByLabel("Tip articol direct SAGA")).toBeDisabled();
    await directUi.getByLabel("Gestiune produs direct SAGA").selectOption("g");
    await expect(directUi.getByText(/Stoc: 10/)).toBeVisible();
    await directUi
      .getByLabel("Cantitate de adăugat", { exact: true })
      .fill("9");
    await expect(directUi.getByText(/Stoc insuficient/)).toBeVisible();
    await directUi
      .getByLabel("Cantitate de adăugat", { exact: true })
      .fill("8");
    await expect(directUi.getByText(/Stoc insuficient/)).toHaveCount(0);
    await directUi
      .getByRole("button", { name: "Adaugă în factură", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: /Continuă ciorna/ }).click();
    await expect(
      page.getByLabel("invoice: Preț unitar 1", { exact: true }),
    ).toHaveValue("12.50");
    await expect(
      page.getByLabel("Gestiune SAGA 1", { exact: true }),
    ).toHaveValue("g");
    const savedInline = (
      await db.doc("invoiceDrafts/inlineBrowser").get()
    ).data()!;
    const previewInline = await service.preview(dispatcher, "inlineBrowser", {
      expectedRevision: savedInline.revision,
    });
    assert.ok("previewHash" in previewInline);
    if (!("previewHash" in previewInline)) throw Error();
    const preparedInline = await service.prepare(dispatcher, "inlineBrowser", {
      expectedRevision: savedInline.revision,
      previewHash: previewInline.previewHash,
      operationId: "inline-final",
    });
    assert.equal(preparedInline.document.snapshot.lines[0].code, "00082");
    assert.equal(
      (await db.doc("lucrari/inlineBrowser").get()).data()!.statusFacturare,
      "Nefacturat",
    );
    console.log(
      "PASS direct article browser: Enter lookup, warehouse auto-stock, insufficiency, stock error vs zero/retry, protected price, 320/390px, save/reopen and XML preparation. No external traffic.",
    );
    assert.equal(sagaCalls, callsBeforeBrowser);
    assert.deepEqual(errors, []);
    assert.deepEqual(
      (await db.doc("invoiceArtifacts/historical").get()).data(),
      historicalArtifact,
    );
    assert.equal(
      (await db.doc("lucrari/browser").get()).data()!.statusFacturare,
      "Nefacturat",
    );
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    console.log(
      "PASS commercial browser: policy activation, explicit migration, protected fields, keyboard product selection, mixed VAT, auto/manual due dates, notes, prepare/reopen and 320/390px. No SAGA traffic.",
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
