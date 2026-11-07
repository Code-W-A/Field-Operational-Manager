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
import { decryptToken } from "../lib/saga/crypto.server";
import { sagaHandlers } from "../lib/saga/http";
import { SagaError } from "../lib/saga/contracts";

import { createSagaCatalogService } from "../lib/saga/catalog.server";
import { sagaCatalogHandlers } from "../lib/saga/catalog-http";
import { createInvoiceDraftService } from "../lib/invoicing/service";
import { invoiceDraftHandlers } from "../lib/invoicing/http";
import { invoiceContent } from "../lib/invoicing/draft";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-saga-catalog",
  firestoreHost = "127.0.0.1:8396",
  authHost = "127.0.0.1:9396";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8396 },
          auth: { host: "127.0.0.1", port: 9396 },
          hub: { port: 4496 },
          logging: { port: 4596 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-saga-catalog.ts")}\"`,
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
  const app = initializeApp({ projectId }, "saga-catalog-test"),
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
      SAGA_API_KEY: "fixture-bootstrap",
      SAGA_COD_FISCAL: "123456",
      SAGA_API_BASE_URL: "https://web.sagasoft.ro/api/v20260225",
      SAGA_TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
    });
    let calls = 0,
      stockValue = "0.3",
      failStock = false;
    const upstream = createSagaService(db, {
      config: () => config,
      fetch: (async (url, init) => {
        assert.equal(init?.method, "GET");
        const u = new URL(String(url));
        assert.equal(u.origin, "https://web.sagasoft.ro");
        assert.ok(
          ["GetArticol", "GetStocArticol"].some((p) => u.pathname.endsWith(p)),
        );
        calls++;
        return new Response(
          u.pathname.endsWith("GetArticol")
            ? "<Articol><Denumire>Motor poartă</Denumire><UM>BUC</UM><TVA>21</TVA><Pret_Vanzare1>100</Pret_Vanzare1></Articol>"
            : JSON.stringify({ success: !failStock, data: stockValue }),
          { headers: { "X-Saga-Refresh-Token": `fixture-token-${calls}` } },
        );
      }) as typeof fetch,
    });
    const catalog = createSagaCatalogService(
      db,
      upstream.readForInvoice,
      () => config,
    );
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
    const handlers = sagaCatalogHandlers(catalog, authenticate);
    const invoices = createInvoiceDraftService(db, () => new Date(), catalog);
    const drafts = invoiceDraftHandlers(invoices, authenticate);
    async function dispatch(r: Request) {
      const path = new URL(r.url).pathname;
      if (path.startsWith("/api/integrations/saga/catalog")) {
        const parts = path
          .slice("/api/integrations/saga/catalog".length)
          .split("/")
          .filter(Boolean);
        return r.method === "GET"
          ? handlers.list(r)
          : handlers.save(r, parts[0], parts[1]);
      }
      if (path.endsWith("/client-association"))
        return Response.json({
          fiscalCode: "123456",
          clientId: null,
          clientName: "",
          taxId: "",
          revision: 0,
          link: null,
          entry: null,
          issues: ["Clientul tichetului lipsește sau este ambiguu."],
        });
      if (path.endsWith("/stock")) return handlers.stock(r, "w");
      return drafts[r.method === "PUT" ? "PUT" : "GET"](r, {
        params: Promise.resolve({ id: "w" }),
      });
    }
    function request(
      path: string,
      role = "admin",
      body?: unknown,
      method = body ? "POST" : "GET",
    ) {
      return dispatch(
        new Request(`http://localhost${path}`, {
          method,
          headers: role
            ? { Authorization: `Bearer ${tokens[role]}` }
            : { Cookie: "userRole=admin" },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    }
    const catPath = "/api/integrations/saga/catalog",
      draftPath = "/api/lucrari/w/invoice-draft";
    for (const role of ["", "client", "tehnician"])
      assert.equal((await request(catPath, role)).status, role ? 403 : 401);
    assert.equal((await request(catPath, "dispecer")).status, 200);
    const warehouseInput = {
      code: "0005",
      name: "Depozit test",
      active: true,
      expectedRevision: 0,
    };
    const disabledCatalog = createSagaCatalogService(
      db,
      upstream.readForInvoice,
      () => ({ ...config, readsEnabled: false }),
    );
    await assert.rejects(
      disabledCatalog.save(
        { uid: "admin", role: "admin" },
        "warehouses",
        warehouseInput,
      ),
      (e) => (e as SagaError).code === "READS_DISABLED",
    );
    assert.equal(calls, 0);
    assert.equal(
      (await request(`${catPath}/warehouses`, "dispecer", warehouseInput))
        .status,
      403,
    );
    let r = await request(`${catPath}/warehouses`, "admin", warehouseInput);
    assert.equal(r.status, 200);
    const warehouse = await r.json();
    assert.equal(calls, 0);
    const duplicateCreates = await Promise.all(
      [1, 2].map(() =>
        request(`${catPath}/warehouses`, "admin", {
          ...warehouseInput,
          code: "0008",
        }),
      ),
    );
    assert.deepEqual(
      duplicateCreates.map((response) => response.status).sort(),
      [200, 400],
    );
    const second = await (
      await request(`${catPath}/warehouses`, "admin", {
        ...warehouseInput,
        code: "0006",
        name: "Al doilea depozit",
      })
    ).json();
    const productInput = {
      code: "0001",
      name: "Motor FOM",
      active: true,
      expectedRevision: 0,
      kind: "goods",
      warehouseIds: [warehouse.id, second.id],
    };
    r = await request(`${catPath}/products`, "admin", productInput);
    assert.equal(r.status, 200);
    let product = await r.json();
    assert.equal(product.unit, "BUC");
    assert.equal(product.code, "0001");
    assert.equal(calls, 1);
    assert.equal(
      decryptToken(
        (await db.doc("sagaConnections/123456").get()).data()!.tokenEnc,
        config.encryptionKey,
        "123456",
      ),
      "fixture-token-1",
    );
    assert.equal(
      (await request(`${catPath}/products`, "admin", productInput)).status,
      400,
    );
    // Two administrators cannot silently overwrite one another.
    const updates = await Promise.all(
      [1, 2].map((n) =>
        request(
          `${catPath}/products/${product.id}`,
          "admin",
          {
            ...productInput,
            name: `Motor ${n}`,
            expectedRevision: product.revision,
          },
          "PUT",
        ),
      ),
    );
    assert.deepEqual(updates.map((v) => v.status).sort(), [200, 409]);
    product = await updates.find((v) => v.status === 200)!.json();
    const link = {
      fiscalCode: "123456",
      productId: product.id,
      revision: product.revision,
      warehouseId: warehouse.id,
      warehouseRevision: warehouse.revision,
    };
    const work = {
      preluatDispecer: true,
      client: "Client test",
      statusFacturare: "Nefacturat",
      nrLucrare: "TEST-1",
      devizProducts: [
        { name: "Piesă deviz", quantity: 0.1, price: 100, um: "buc" },
        { name: "Piesă deviz 2", quantity: 0.2, price: 50, um: "buc" },
      ],
      devizVAT: 0,
    };
    await db.doc("lucrari/w").set(work);
    const originalWork = (await db.doc("lucrari/w").get()).data();
    const seed = await (await request(draftPath, "dispecer")).json();
    const content = invoiceContent(seed.draft);
    content.lines = content.lines.map((l) => ({
      ...l,
      saga: {
        ...link,
        snapshot: {
          code: "forged",
          name: "forged",
          unit: "KG",
          kind: "service",
          warehouseCode: "9999",
          warehouseName: "forged",
        },
      },
    }));
    r = await request(
      draftPath,
      "dispecer",
      { expectedRevision: 0, content },
      "PUT",
    );
    assert.equal(r.status, 200);
    const saved = await r.json();
    assert.equal(saved.draft.lines[0].saga.snapshot.code, "0001");
    assert.equal(saved.draft.lines[0].price, "100");
    assert.equal(saved.draft.vatPercent, "0");
    r = await request(`${draftPath}/stock`, "dispecer", link);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).quantity, "0.3");
    assert.equal(
      (await request(`${draftPath}/stock`, "tehnician", link)).status,
      403,
    );
    assert.equal(
      (
        await request(`${draftPath}/stock`, "dispecer", {
          ...link,
          fiscalCode: "999999",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(`${draftPath}/stock`, "dispecer", {
          ...link,
          warehouseId: "unknown",
        })
      ).status,
      400,
    );
    await db.doc("lucrari/w").update({ archived: true });
    const beforeBlocked = calls;
    assert.equal(
      (await request(`${draftPath}/stock`, "dispecer", link)).status,
      409,
    );
    assert.equal(calls, beforeBlocked);
    await db.doc("lucrari/w").update({ archived: false });
    await db.doc("users/dispecer").update({ disabled: true });
    assert.equal(
      (await request(`${draftPath}/stock`, "dispecer", link)).status,
      403,
    );
    await db.doc("users/dispecer").update({ disabled: false });
    // Direct client reads and writes of catalog, root, and nested documents are denied.
    for (const path of [
      "sagaCatalogs/123456",
      `sagaCatalogs/123456/products/${product.id}`,
      `sagaCatalogs/123456/warehouses/${warehouse.id}`,
      `sagaCatalogs/123456/codes/${(await db.collection("sagaCatalogs/123456/codes").get()).docs[0].id}`,
    ]) {
      for (const token of ["", tokens.admin]) {
        const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
        const headers: Record<string, string> = token
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
    }
    // Catalog changes invalidate stale saves without discarding the existing draft.
    let update = await request(
      `${catPath}/products/${product.id}`,
      "admin",
      {
        ...productInput,
        name: "Motor actualizat",
        expectedRevision: product.revision,
      },
      "PUT",
    );
    product = await update.json();
    assert.equal(
      (
        await request(
          draftPath,
          "dispecer",
          { expectedRevision: saved.draft.revision, content },
          "PUT",
        )
      ).status,
      409,
    );
    assert.equal(
      (await db.doc("invoiceDrafts/w").get()).data()!.revision,
      saved.draft.revision,
    );
    assert.equal(
      (await request(`${draftPath}/stock`, "dispecer", link)).status,
      409,
    );
    const activeLink = { ...link, revision: product.revision };
    stockValue = "0";
    r = await request(`${draftPath}/stock`, "dispecer", activeLink);
    assert.equal((await r.json()).quantity, "0");
    failStock = true;
    r = await request(`${draftPath}/stock`, "dispecer", activeLink);
    assert.equal(r.status, 502);
    failStock = false;
    stockValue = "0.3";
    assert.equal(
      decryptToken(
        (await db.doc("sagaConnections/123456").get()).data()!.tokenEnc,
        config.encryptionKey,
        "123456",
      ),
      `fixture-token-${calls}`,
    );
    // Warehouse revision and service handling are independently enforced.
    const warehouseUpdate = await (
      await request(
        `${catPath}/warehouses/${warehouse.id}`,
        "admin",
        {
          ...warehouseInput,
          expectedRevision: warehouse.revision,
          name: "Depozit actualizat",
        },
        "PUT",
      )
    ).json();
    assert.equal(
      (await request(`${draftPath}/stock`, "dispecer", activeLink)).status,
      409,
    );
    const serviceProduct = await (
      await request(`${catPath}/products`, "admin", {
        ...productInput,
        code: "SRV",
        kind: "service",
        warehouseIds: [],
      })
    ).json();
    assert.equal(
      (
        await request(`${draftPath}/stock`, "dispecer", {
          ...activeLink,
          productId: serviceProduct.id,
          revision: serviceProduct.revision,
          warehouseId: "",
        })
      ).status,
      400,
    );
    await request(
      `${catPath}/products/${serviceProduct.id}`,
      "admin",
      {
        ...productInput,
        code: "SRV",
        kind: "service",
        warehouseIds: [],
        active: false,
        expectedRevision: serviceProduct.revision,
      },
      "PUT",
    );
    assert.equal(
      (
        await request(`${draftPath}/stock`, "dispecer", {
          ...activeLink,
          productId: serviceProduct.id,
          revision: serviceProduct.revision,
          warehouseId: "",
        })
      ).status,
      409,
    );
    await db.doc("invoiceDrafts/w").delete();
    console.log(
      "PASS catalog API/emulator: permissions, verified article, zero-preserving codes, rotation, concurrent revisions, authoritative snapshots, legacy commercial fields, warehouse/service/inactive/readonly checks, denied direct Firestore access.",
    );

    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{SagaCatalogSettings}from'./components/settings/saga-catalog';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';createRoot(document.getElementById('root')).render(location.pathname==='/ticket'?<main style={{minHeight:1800,padding:16}}><h1>Tichet test</h1><button onClick={()=>window.backgroundClicks++}>Detalii tichet</button><InvoiceDraftSection workId="w" work={window.testWork}/></main>:<main style={{padding:16}}><SagaCatalogSettings/></main>);`,
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      format: "iife",
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "auth-fixture",
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
      tailwindConfig = (await import("../tailwind.config")).default;
    const css = await postcss([
      tailwind({
        ...tailwindConfig,
        content: [
          path.join(root, "components/invoicing/**/*.tsx"),
          path.join(root, "components/settings/saga-catalog.tsx"),
          path.join(root, "components/ui/{input,button}.tsx"),
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
          const response = await dispatch(
            new Request("http://localhost" + req.url, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: ["PUT", "POST"].includes(req.method!)
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
        const role = req.url === "/ticket" ? "dispecer" : "admin";
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.testToken=${JSON.stringify(tokens[role])};window.testRole=${JSON.stringify(role)};window.testWork=${JSON.stringify(work)};window.backgroundClicks=0;</script><script src="/app.js"></script>`,
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
    });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole("button", { name: "Gestiuni", exact: true }).click();
    await page.getByLabel("Cod gestiune SAGA", { exact: true }).fill("0007");
    await page
      .getByLabel("Denumire în FOM", { exact: true })
      .fill("Depozit browser");
    await page.getByRole("button", { name: "Salvează în catalog" }).click();
    await expect(page.getByRole("status")).toHaveText(
      "Gestiune salvată în FOM.",
    );
    await page
      .getByRole("button", { name: "Produse asociate", exact: true })
      .click();
    await page
      .getByLabel("Cod articol de asociat", { exact: true })
      .fill("0002");
    await page
      .getByLabel("Denumire în FOM", { exact: true })
      .fill("Produs browser");
    await page.getByLabel("0007 · Depozit browser", { exact: true }).check();
    await page.getByRole("button", { name: "Salvează în catalog" }).click();
    await expect(page.getByRole("status")).toContainText("Motor poartă · BUC");
    const artifacts = path.join(root, "test-results/saga-catalog");
    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "catalog.png") });
    await page.goto(`${url}/ticket`);
    await page
      .getByRole("button", { name: "Începe factura", exact: true })
      .click();
    const panel = page.getByRole("dialog", { name: "Ciorna facturii" });
    await expect(panel).toBeVisible();
    for (const i of [1, 2]) {
      await page
        .getByLabel(`Caută articol SAGA ${i}`, { exact: true })
        .fill("Motor");
      await page
        .getByLabel(`Articol SAGA ${i}`, { exact: true })
        .selectOption(product.id);
      await page
        .getByLabel(`Gestiune SAGA ${i}`, { exact: true })
        .selectOption(warehouse.id);
    }
    const position = page.getByRole("region", {
      name: "Asociere SAGA poziția 1",
    });
    await position.getByRole("button", { name: "Verifică stocul" }).click();
    await expect(position.getByRole("status")).toContainText("Stoc: 0.3 BUC");
    await expect(
      position.getByText("Stoc insuficient", { exact: false }),
    ).toHaveCount(0);
    await page.getByLabel("invoice: Cantitate 2", { exact: true }).fill("0.3");
    await expect(
      position.getByText("Stoc insuficient", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("invoice: Cantitate 2", { exact: true }).fill("0.2");
    await page.getByLabel("invoice: UM 1", { exact: true }).fill("KG");
    await expect(
      position.getByText("UM incompatibilă", { exact: false }),
    ).toBeVisible();
    await page.getByLabel("invoice: UM 1", { exact: true }).fill("buc");
    await page
      .getByLabel("Gestiune SAGA 1", { exact: true })
      .selectOption(second.id);
    await expect(position.getByRole("status")).toHaveCount(0);
    await page
      .getByLabel("Gestiune SAGA 1", { exact: true })
      .selectOption(warehouse.id);
    await page
      .getByRole("button", { name: "Detalii tichet", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => (window as any).backgroundClicks),
      1,
    );
    await page
      .getByRole("button", { name: "Minimizează factura", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continuă ciorna · nesalvată", exact: true })
      .click();
    await expect(
      page.getByLabel("Articol SAGA 1", { exact: true }),
    ).toHaveValue(product.id);
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      panel.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Continuă ciorna", exact: true })
      .click();
    await expect(
      page.getByLabel("Articol SAGA 1", { exact: true }),
    ).toHaveValue(product.id);
    await expect(
      page.getByLabel("invoice: Preț unitar 1", { exact: true }),
    ).toHaveValue("100");
    failStock = true;
    await position.getByRole("button", { name: "Verifică stocul" }).click();
    await expect(position.getByRole("alert")).toContainText("nu a confirmat");
    await expect(position.getByRole("status")).toHaveCount(0);
    failStock = false;
    // A concurrent catalog edit preserves local invoice edits on a 409.
    const edited = await (
      await request(
        `${catPath}/products/${product.id}`,
        "admin",
        {
          ...productInput,
          name: "Schimbat concurent",
          expectedRevision: product.revision,
        },
        "PUT",
      )
    ).json();
    await page
      .getByLabel("invoice: Denumire 1", { exact: true })
      .fill("Editare păstrată");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Asocierea a fost modificată" }),
    ).toBeVisible();
    await expect(
      page.getByLabel("invoice: Denumire 1", { exact: true }),
    ).toHaveValue("Editare păstrată");
    await page
      .getByRole("button", {
        name: "Actualizează asocierile SAGA",
        exact: true,
      })
      .click();
    for (const i of [1, 2]) {
      await page
        .getByLabel(`Articol SAGA ${i}`, { exact: true })
        .selectOption("");
      await page
        .getByLabel(`Articol SAGA ${i}`, { exact: true })
        .selectOption(edited.id);
      await page
        .getByLabel(`Gestiune SAGA ${i}`, { exact: true })
        .selectOption(warehouse.id);
    }
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      panel.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();

    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "desktop.png") });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await expect(
        page.getByLabel("Gestiune SAGA 1", { exact: true }),
      ).toHaveValue(warehouse.id);
    }
    await page
      .getByLabel("Articol SAGA 1", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, "mobile.png") });
    assert.deepEqual(errors, []);
    assert.equal(
      (await db.doc("lucrari/w").get()).data()!.statusFacturare,
      originalWork!.statusFacturare,
    );
    assert.equal(
      (await db.doc("lucrari/w").get()).data()!.numarFactura,
      undefined,
    );
    assert.deepEqual(
      (await db.doc("lucrari/w").get()).data()!.devizProducts,
      originalWork!.devizProducts,
    );
    console.log(
      "PASS catalog browser: admin creation -> HTTP/Auth/Firestore -> dispatcher selection, stock and aggregate decimals, unit mismatch, invalidation, save/reopen, 409 keeps edits, 320/390px, minimization and background interaction. Only simulated upstream GET calls.",
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
