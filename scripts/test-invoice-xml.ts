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
  projectId = "demo-fom-invoice-xml",
  firestoreHost = "127.0.0.1:8393",
  authHost = "127.0.0.1:9393";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8393 },
          auth: { host: "127.0.0.1", port: 9393 },
          hub: { port: 4493 },
          logging: { port: 4593 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-invoice-xml.ts")}\"`,
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
    for (const id of ["w", "w2", "rollback", "large", "browser", "blocked"])
      await seed(id);
    const beforeWork = (await db.doc("lucrari/w").get()).data();
    assert.equal(isUninvoicedWork(beforeWork), true);
    const numberInput = {
      expectedRevision: 0,
      prefix: "NRG",
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
    async function dispatch(r: Request) {
      const p = new URL(r.url).pathname,
        id = p.split("/")[3];
      if (p === "/api/integrations/saga/issuer")
        return r.method === "PUT"
          ? handlers.saveProfile(r)
          : handlers.profile(r);
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
        return Response.json({
          fiscalCode: "123456",
          products: [product],
          warehouses: [warehouse],
        });
      if (p.includes("/invoice-draft"))
        return drafts[r.method === "PUT" ? "PUT" : "GET"](r, {
          params: Promise.resolve({ id }),
        });
      return new Response(null, { status: 404 });
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
          headers: role
            ? { Authorization: `Bearer ${tokens[role]}` }
            : { Cookie: "userRole=admin" },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    const xmlPath = "/api/lucrari/w/invoice-xml",
      profilePath = "/api/integrations/saga/issuer";
    assert.equal((await request(xmlPath, "")).status, 401);
    for (const role of ["client", "tehnician"])
      for (const suffix of ["", "/preview", "/download"])
        assert.equal(
          (
            await request(
              xmlPath + suffix,
              role,
              suffix === "/preview" ? { expectedRevision: 1 } : undefined,
            )
          ).status,
          403,
        );
    assert.equal(
      (
        await request(
          profilePath,
          "dispecer",
          { expectedRevision: 0, profile: issuerFixture },
          "PUT",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          profilePath,
          "admin",
          { expectedRevision: 0, profile: { ...issuerFixture, cui: "999" } },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          profilePath,
          "admin",
          { expectedRevision: 0, profile: issuerFixture },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          profilePath,
          "admin",
          { expectedRevision: 0, profile: issuerFixture },
          "PUT",
        )
      ).status,
      409,
    );
    const preview = async (id = "w") => {
      const result = await request(
        `/api/lucrari/${id}/invoice-xml/preview`,
        "dispecer",
        { expectedRevision: 1 },
      );
      assert.equal(result.status, 200, await result.clone().text());
      return result.json();
    };
    const prepare = (id: string, p: any, operationId = id) =>
      request(`/api/lucrari/${id}/invoice-xml`, "dispecer", {
        expectedRevision: 1,
        previewHash: p.previewHash,
        operationId,
      });
    const first = await preview();
    assert.equal(first.estimatedNumber, "NRG000126");
    assert.equal((await db.collection("invoices").get()).size, 0);
    assert.equal((await numbering.get(actor)).counter!.allocationCount, 0);
    await db.doc("invoiceIssuerProfiles/123456").update({ revision: 2 });
    assert.equal((await prepare("w", first)).status, 409);
    for (const [ref, patch, restore, status] of [
      [
        "invoiceDrafts/w",
        { "beneficiary.city": "" },
        { "beneficiary.city": "București" },
        400,
      ],
      [
        "invoiceDrafts/w",
        { "beneficiary.cui": "999" },
        { "beneficiary.cui": "RO123" },
        400,
      ],
      [
        "sagaCatalogs/123456/clientLinks/c",
        { active: false },
        { active: true },
        400,
      ],
      ["sagaCatalogs/123456/products/p", { revision: 2 }, { revision: 1 }, 409],
      [
        "sagaCatalogs/123456/warehouses/g",
        { revision: 2 },
        { revision: 1 },
        409,
      ],
      [
        "lucrari/w",
        { statusFacturare: "Facturat" },
        { statusFacturare: "Nefacturat" },
        409,
      ],
    ] as const) {
      await db.doc(ref).update(patch);
      assert.equal(
        (await request(xmlPath + "/preview", "admin", { expectedRevision: 1 }))
          .status,
        status,
      );
      await db.doc(ref).update(restore);
    }
    await db.doc("invoiceDrafts/w").update({ "beneficiary.country": "FR" });
    assert.equal(
      (await request(xmlPath + "/preview", "admin", { expectedRevision: 1 }))
        .status,
      400,
    );
    await db.doc("invoiceDrafts/w").update({ "beneficiary.country": "RO" });
    // Invalid XML is discovered after allocation was queued: the whole transaction must roll back.
    const bad = (await db.doc("invoiceDrafts/rollback").get()).data()!;
    bad.lines[0].name = "Bad\u0001";
    await db.doc("invoiceDrafts/rollback").set(bad);
    const rp = await preview("rollback");
    assert.equal((await prepare("rollback", rp)).status, 400);
    assert.equal((await numbering.get(actor)).counter!.allocationCount, 0);
    assert.equal(
      (await db.collection("invoiceNumberReservations").get()).size,
      0,
    );
    assert.equal((await db.doc("invoices/rollback").get()).exists, false);
    // Escaping 100 valid long lines exceeds the private artifact cap.
    const large = (await db.doc("invoiceDrafts/large").get()).data()!;
    large.lines = Array.from({ length: 100 }, (_, i) => ({
      ...large.lines[0],
      id: String(i),
      name: '"'.repeat(1000),
    }));
    await db.doc("invoiceDrafts/large").set(large);
    const lp = await preview("large");
    const lr = await prepare("large", lp);
    assert.equal(lr.status, 400);
    assert.equal((await lr.json()).code, "DOCUMENT_TOO_LARGE");
    assert.equal((await numbering.get(actor)).counter!.allocationCount, 0);
    // Missing identifiers require explicit confirmation and no known identifier in either source.
    await db.doc("invoiceDrafts/w").update({ "beneficiary.cui": "" });
    assert.equal(
      (await request(xmlPath + "/preview", "admin", { expectedRevision: 1 }))
        .status,
      400,
    );
    await db.doc("clienti/c").update({ cui: "" });
    await rootCatalog.collection("clients").doc("s").update({ taxId: "" });
    await rootCatalog
      .collection("clientLinks")
      .doc("c")
      .update({ fomTaxId: "" });
    assert.equal(
      (await request(xmlPath + "/preview", "admin", { expectedRevision: 1 }))
        .status,
      400,
    );
    await rootCatalog
      .collection("clientLinks")
      .doc("c")
      .update({ missingTaxConfirmed: true });
    await preview();
    await db.doc("lucrari/w").update({ clientInfo: { cui: "RO123" } });
    assert.equal(
      (await request(xmlPath + "/preview", "admin", { expectedRevision: 1 }))
        .status,
      400,
    );
    await db.doc("lucrari/w").set(work);
    await db.doc("clienti/c").update({ cui: "RO123" });
    await rootCatalog.collection("clients").doc("s").set(entry);
    await rootCatalog.collection("clientLinks").doc("c").set(link);
    await db.doc("invoiceDrafts/w").update({ "beneficiary.cui": "RO123" });
    // A saved change after preview cannot be confirmed with the old revision.
    const staleDraft = await preview();
    await db.doc("invoiceDrafts/w").update({ revision: 2 });
    assert.equal((await prepare("w", staleDraft)).status, 409);
    await db.doc("invoiceDrafts/w").update({ revision: 1 });
    const current = await preview();
    const prepared = await Promise.all([
      prepare("w", current, "op1"),
      prepare("w", current, "op2"),
    ]);
    for (const r of prepared)
      assert.equal(r.status, 200, await r.clone().text());
    const doc = (await prepared[0].json()).document;
    assert.deepEqual(doc, (await prepared[1].json()).document);
    assert.equal(doc.number, "NRG000126");
    assert.equal((await numbering.get(actor)).counter!.allocationCount, 1);
    await assert.rejects(
      createInvoiceXmlService(db, () => ({
        ...config,
        fiscalCode: "654321",
      })).document(actor, "w"),
      (e: any) => e.code === "COMPANY_CONFLICT",
    );
    const file = await request(xmlPath + "/download", "dispecer");
    assert.equal(file.status, 200);
    assert.ok(
      file.headers.get("Content-Disposition")!.includes("F_123456_NRG000126"),
    );
    assert.equal(file.headers.get("Cache-Control"), "private, no-store");
    const bytes = await file.text();
    assert.equal(createHash("sha256").update(bytes).digest("hex"), doc.sha256);
    const another = await preview("w2");
    assert.equal((await prepare("w2", another, doc.operationId)).status, 409);
    assert.equal((await prepare("w", current, "retry")).status, 200);
    assert.equal((await draftService.get("w", dispatcher)).canEdit, false);
    await assert.rejects(
      draftService.put(
        "w",
        { expectedRevision: 1, content: contentFixture() },
        actor,
      ),
      (e: any) => e.code === "DRAFT_READ_ONLY",
    );
    await rootCatalog
      .collection("products")
      .doc("p")
      .update({ articleName: "Nou" });
    await rootCatalog
      .collection("clients")
      .doc("s")
      .update({ name: "Alt nume" });
    assert.equal(await (await request(xmlPath + "/download")).text(), bytes);
    for (const collection of [
      "invoiceIssuerProfiles",
      "invoices",
      "invoiceArtifacts",
    ])
      for (const token of ["", tokens.admin])
        for (const verb of ["GET", "PATCH"]) {
          const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${collection === "invoiceIssuerProfiles" ? "123456" : "w"}`;
          assert.equal(
            (
              await fetch(url, {
                method: verb,
                headers: {
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  "Content-Type": "application/json",
                },
                body: verb === "PATCH" ? "{}" : undefined,
              })
            ).status,
            403,
          );
        }
    const off = createInvoiceXmlService(db, () => ({
      ...config,
      readsEnabled: false,
    }));
    await assert.rejects(
      off.prepare(actor, "w2", {
        expectedRevision: 1,
        previewHash: another.previewHash,
        operationId: "off",
      }),
      (e: any) => e.code === "XML_DISABLED",
    );
    assert.deepEqual((await db.doc("lucrari/w").get()).data(), beforeWork);
    assert.equal(
      isUninvoicedWork((await db.doc("lucrari/w").get()).data()),
      true,
    );
    console.log(
      "PASS XML API/emulator: permissions, fiscal checks, stale sources, no preview allocation, rollback/XML/size failure, concurrent idempotency, immutable download, frozen draft, denied Firestore, unchanged uninvoiced status; zero external HTTP.",
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
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.testRole=${JSON.stringify(role)};window.testToken=${JSON.stringify(tokens[role])};window.testWork=${JSON.stringify(work)};</script><script src="/app.js"></script>`,
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
    for (const [label, value] of Object.entries({
      "Denumire firmă emitentă": "Emitent & Fii",
      "CIF firmă emitentă": "RO123456",
      "Registrul comerțului emitent": "J00/1/2020",
      "Țara emitentului": "RO",
      "Județ emitent (cod, ex. IF)": "IF",
      "Localitate emitent": "Otopeni",
      "Adresă fiscală emitent": "Strada test 1",
    }))
      await page.getByLabel(label, { exact: true }).fill(value);
    await page.getByLabel("Confirm datele fiscale", { exact: false }).check();
    await page
      .getByRole("button", { name: "Salvează firma emitentă", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("salvat");
    await page.goto(url + "/ticket");
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click()
      .catch(async (e) => {
        console.log("PAGE BODY", await page.locator("body").innerText());
        throw e;
      });
    const panel = page.getByRole("dialog", { name: "Ciorna facturii" }),
      xmlPanel = page.getByRole("region", { name: "Pregătire XML" });
    await page
      .getByRole("button", { name: "Pregătește XML", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare XML" }),
    ).toContainText("NRG000127");
    assert.equal((await numbering.get(actor)).counter!.allocationCount, 1);
    await page
      .getByRole("button", { name: "Renunță la pregătire", exact: true })
      .click();
    assert.equal((await db.doc("invoices/browser").get()).exists, false);
    await panel
      .getByLabel("Denumire beneficiar", { exact: true })
      .fill("Client editat");
    await expect(
      page.getByRole("button", { name: "Pregătește XML", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      panel.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Pregătește XML", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmă pregătirea XML", exact: true })
      .click();
    await expect(xmlPanel).toContainText("Document XML pregătit în FOM");
    await expect(
      panel.getByLabel("Denumire beneficiar", { exact: true }),
    ).toBeDisabled();
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Descarcă XML", exact: true })
      .click();
    const dl = await downloadEvent;
    assert.equal(dl.suggestedFilename(), "F_123456_NRG000127_07_11_2026.xml");
    assert.equal(
      await readFile((await dl.path())!, "utf8"),
      (await service.download(actor, "browser")).xml,
    );
    const artifacts = path.join(root, "test-results/invoice-xml");
    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await xmlPanel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(artifacts, "prepared-desktop.png"),
    });
    await page.reload();
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click()
      .catch(async (e) => {
        console.log("PAGE BODY", await page.locator("body").innerText());
        throw e;
      });
    await expect(xmlPanel).toContainText("NRG000127");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() => panel.evaluate((el) => getComputedStyle(el).position))
        .not.toBe("fixed");
      await expect(xmlPanel).toContainText("Document XML pregătit în FOM");
      await xmlPanel.scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await expect
        .poll(() => panel.evaluate((el) => getComputedStyle(el).position))
        .not.toBe("fixed");
    }
    await page.screenshot({
      path: path.join(artifacts, "prepared-mobile.png"),
    });
    assert.deepEqual(errors, []);
    assert.equal((await numbering.get(actor)).counter!.allocationCount, 2);
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    assert.deepEqual(
      (await db.doc("lucrari/browser").get()).data(),
      beforeWork,
    );
    console.log(
      "PASS XML browser: issuer profile, preview/cancel, unsaved changes/save, explicit prepare, freeze/reopen, private download bytes, responsive 320/390px; no external traffic.",
    );
  } finally {
    await browser?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await deleteApp(app);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
