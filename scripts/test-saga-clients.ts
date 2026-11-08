import { eurFixtureHandlers } from "../lib/invoicing/eur-rate.fixtures";
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
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { createSagaClientsService } from "../lib/saga/clients.server";
import { sagaClientsHandlers } from "../lib/saga/clients-http";
import { CLIENT_IMPORT_BATCH, validateClientRows } from "../lib/saga/clients";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-saga-clients",
  firestoreHost = "127.0.0.1:8395",
  authHost = "127.0.0.1:9395";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8395 },
          auth: { host: "127.0.0.1", port: 9395 },
          hub: { port: 4495 },
          logging: { port: 4595 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-saga-clients.ts")}\"`,
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
  const app = initializeApp({ projectId }, "saga-clients-test"),
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
    const service = createSagaClientsService(db, () => config);
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
    const handlers = sagaClientsHandlers(service, authenticate);
    const invoices = invoiceDraftHandlers(
      createInvoiceDraftService(db),
      authenticate,
    );
    const eurHttp = eurFixtureHandlers(db, authenticate);
    async function dispatch(r: Request) {
      const url = new URL(r.url),
        p = url.pathname;
      if (p.endsWith("/eur-rate")) return eurHttp.get(r, "w");
      if (p.endsWith("/saga-link")) {
        const clientId = p.split("/")[3];
        return r.method === "PUT"
          ? handlers.link(r, clientId)
          : handlers.association(r, clientId);
      }
      if (p.endsWith("/invoice-xml")) return Response.json({ document: null });
      if (p.endsWith("/number"))
        return Response.json({
          fiscalCode: "123456",
          number: null,
          reserved: false,
          reason: "",
        });
      if (p.endsWith("/client-association")) return handlers.forWork(r, "w");
      if (p.endsWith("/invoice-draft"))
        return invoices[r.method === "PUT" ? "PUT" : "GET"](r, {
          params: Promise.resolve({ id: "w" }),
        });
      if (p.endsWith("/catalog"))
        return Response.json({
          fiscalCode: "123456",
          products: [],
          warehouses: [],
        });
      if (p.endsWith("/preview")) return handlers.preview(r);
      const parts = p.split("/").filter(Boolean);
      if (parts.includes("imports")) {
        if (parts.at(-1) === "batch") return handlers.batch(r, parts.at(-2)!);
        if (parts.at(-1) === "cancel") return handlers.cancel(r, parts.at(-2)!);
        return r.method === "POST" ? handlers.begin(r) : handlers.progress(r);
      }
      return handlers.search(r);
    }
    const base = "/api/integrations/saga/clients",
      linkPath = "/api/clienti/c/saga-link";
    const request = (
      path: string,
      role = "admin",
      body?: unknown,
      method = body ? "POST" : "GET",
    ) =>
      dispatch(
        new Request(`http://localhost${path}`, {
          method,
          headers: role
            ? { Authorization: `Bearer ${tokens[role]}` }
            : { Cookie: "userRole=admin" },
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    const manifest = (rows: unknown[], source = "fixture.csv") => {
      const hashes = [];
      for (let i = 0; i < rows.length; i += CLIENT_IMPORT_BATCH)
        hashes.push(
          createHash("sha256")
            .update(JSON.stringify(rows.slice(i, i + CLIENT_IMPORT_BATCH)))
            .digest("hex"),
        );
      return { source, total: rows.length, hashes };
    };
    const clients = {
      c: {
        nume: "Firma FOM",
        cui: "RO123",
        cif: "123",
        locatii: [{ nume: "Locația A" }, { nume: "Locația B" }],
      },
      same: { nume: "Altă locație FOM", cif: "123" },
      missing: { nume: "Fără CUI" },
      conflict: { nume: "Alias conflict", cui: "123", cif: "124" },
    };
    for (const [id, data] of Object.entries(clients))
      await db.doc(`clienti/${id}`).set(data);
    const originalClients = (await db.collection("clienti").get()).docs.map(
      (d) => ({ id: d.id, ...d.data() }),
    );
    await db.doc("lucrari/w").set({
      clientId: "c",
      client: "Firma FOM",
      preluatDispecer: true,
      statusFacturare: "Nefacturat",
      nrLucrare: "TEST-CLIENT",
      products: [{ name: "Piesă", um: "buc", quantity: 1, price: 50 }],
    });
    const workBefore = (await db.doc("lucrari/w").get()).data();
    const rows = validateClientRows(
      Array.from({ length: 201 }, (_, i) => ({
        code: String(i).padStart(5, "0"),
        name: `Client SAGA ${i}`,
        taxId: i === 0 ? "RO123" : String(1000 + i),
        country: "RO",
      })),
    );
    const m = manifest(rows);
    assert.equal((await request(base, "")).status, 401);
    for (const role of ["tehnician", "client"])
      assert.equal((await request(base, role)).status, 403);
    assert.equal((await request(`${base}/imports`, "dispecer", m)).status, 403);
    assert.equal(
      (await request(`${base}/preview`, "admin", [{ ...rows[0], country: "" }]))
        .status,
      400,
    );
    assert.equal(
      (
        await request(`${base}/preview`, "admin", [
          rows[0],
          { ...rows[0], name: "Contradictoriu" },
        ])
      ).status,
      400,
    );
    const disabled = createSagaClientsService(db, () => ({
      ...config,
      readsEnabled: false,
    }));
    await assert.rejects(
      disabled.begin({ uid: "admin", role: "admin" }, m),
      (e) => (e as SagaError).code === "READS_DISABLED",
    );
    const started = await Promise.all(
      [1, 2].map(() => request(`${base}/imports`, "admin", m)),
    );
    assert.deepEqual(
      started.map((r) => r.status),
      [200, 200],
    );
    let job = await started[0].json();
    assert.equal((await started[1].json()).id, job.id);
    assert.equal(
      (
        await request(
          `${base}/imports`,
          "admin",
          manifest([rows[1]], "other.csv"),
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(`${base}/imports/${job.id}/batch`, "admin", {
          index: 0,
          rows: [{ ...rows[0], name: "Forged" }],
        })
      ).status,
      409,
    );
    const first = { index: 0, rows: rows.slice(0, 200) };
    job = await (
      await request(`${base}/imports/${job.id}/batch`, "admin", first)
    ).json();
    assert.equal(job.next, 1);
    assert.equal(
      (
        await (
          await request(`${base}/imports/${job.id}/batch`, "admin", first)
        ).json()
      ).next,
      1,
    );
    assert.equal(
      (await (await request(`${base}/imports`, "admin", m)).json()).next,
      1,
    );
    assert.equal(
      (
        await request(
          linkPath,
          "admin",
          { expectedRevision: 0, sagaClientId: "not-ready", country: "RO" },
          "PUT",
        )
      ).status,
      409,
    );
    job = await (
      await request(`${base}/imports/${job.id}/batch`, "admin", {
        index: 1,
        rows: rows.slice(200),
      })
    ).json();
    assert.equal(job.status, "completed");
    assert.equal(
      (await db.collection("sagaCatalogs/123456/clients").get()).size,
      201,
    );
    let search = await (await request(`${base}?q=00000`)).json();
    let entry = search.entries[0];
    assert.equal(entry.code, "00000");
    const binding = {
      expectedRevision: 0,
      sagaClientId: entry.id,
      sagaRevision: entry.revision,
      country: "RO",
    };
    assert.equal(
      (await request(linkPath, "dispecer", binding, "PUT")).status,
      403,
    );
    assert.equal(
      (await request(linkPath, "admin", { ...binding, country: "DE" }, "PUT"))
        .status,
      400,
    );
    const wrongEntry = (await (await request(`${base}?q=00001`)).json())
      .entries[0];
    assert.equal(
      (
        await request(
          linkPath,
          "admin",
          {
            ...binding,
            sagaClientId: wrongEntry.id,
            sagaRevision: wrongEntry.revision,
          },
          "PUT",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/clienti/conflict/saga-link",
          "admin",
          binding,
          "PUT",
        )
      ).status,
      400,
    );
    const linked = await Promise.all(
      [1, 2].map(() => request(linkPath, "admin", binding, "PUT")),
    );
    assert.deepEqual(linked.map((r) => r.status).sort(), [200, 409]);
    let association = await linked.find((r) => r.status === 200)!.json();
    assert.deepEqual(association.issues, []);
    assert.equal(
      (await request("/api/clienti/same/saga-link", "admin", binding, "PUT"))
        .status,
      200,
    );
    assert.equal(
      (await request("/api/clienti/missing/saga-link", "admin", binding, "PUT"))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/clienti/missing/saga-link",
          "admin",
          { ...binding, missingTaxConfirmed: true },
          "PUT",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          linkPath,
          "admin",
          { ...binding, expectedRevision: association.revision + 1 },
          "PUT",
        )
      ).status,
      409,
    );
    await db.doc("users/admin").update({ disabled: true });
    assert.equal((await request(linkPath)).status, 403);
    await db.doc("users/admin").update({ disabled: false });
    const otherFirm = createSagaClientsService(db, () => ({
      ...config,
      fiscalCode: "654321",
    }));
    assert.equal(
      (await otherFirm.search({ uid: "admin", role: "admin" })).entries.length,
      0,
    );
    await assert.rejects(
      otherFirm.link({ uid: "admin", role: "admin" }, "c", binding),
      (e) => (e as SagaError).code === "CLIENT_CONFLICT",
    );
    // Server rejects contradictory duplicates even when they arrive in separate batches.
    const maliciousRows = [
      ...rows.slice(0, 200),
      { ...rows[0], name: "Contradictory duplicate" },
    ];
    const badJob = await (
      await request(
        `${base}/imports`,
        "admin",
        manifest(maliciousRows, "bad.csv"),
      )
    ).json();
    await request(`${base}/imports/${badJob.id}/batch`, "admin", {
      index: 0,
      rows: maliciousRows.slice(0, 200),
    });
    assert.equal(
      (
        await request(`${base}/imports/${badJob.id}/batch`, "admin", {
          index: 1,
          rows: maliciousRows.slice(200),
        })
      ).status,
      400,
    );
    await request(`${base}/imports/${badJob.id}/cancel`, "admin", {});
    // A completed export can be imported again; unchanged identities keep their revision.
    const repeated = await (
      await request(`${base}/imports`, "admin", m)
    ).json();
    assert.notEqual(repeated.id, job.id);
    for (let index = 0; index < repeated.chunks; index++)
      await request(`${base}/imports/${repeated.id}/batch`, "admin", {
        index,
        rows: rows.slice(
          index * CLIENT_IMPORT_BATCH,
          (index + 1) * CLIENT_IMPORT_BATCH,
        ),
      });
    assert.equal((await (await request(linkPath)).json()).issues.length, 0);
    const duplicateTax = [
      { ...rows[0], code: "DUP123", name: "Alt client cu același CUI" },
    ];
    const dupJob = await (
      await request(
        `${base}/imports`,
        "admin",
        manifest(duplicateTax, "duplicates.csv"),
      )
    ).json();
    await request(`${base}/imports/${dupJob.id}/batch`, "admin", {
      index: 0,
      rows: duplicateTax,
    });
    assert.equal(
      (await (await request(`${base}?q=RO123&country=RO&mode=tax`)).json())
        .total,
      2,
    );
    // Existing links become stale when their reference identity changes.
    const changedRows = [{ ...rows[0], name: "Client SAGA actualizat" }];
    let changedJob = await (
      await request(
        `${base}/imports`,
        "admin",
        manifest(changedRows, "updated.csv"),
      )
    ).json();
    await request(`${base}/imports/${changedJob.id}/batch`, "admin", {
      index: 0,
      rows: changedRows,
    });
    assert.match(
      (await (await request(linkPath)).json()).issues.join(" "),
      /reconfirmare/,
    );
    entry = (await (await request(`${base}?q=00000`)).json()).entries[0];
    association = await (
      await request(
        linkPath,
        "admin",
        {
          ...binding,
          expectedRevision: association.revision,
          sagaRevision: entry.revision,
        },
        "PUT",
      )
    ).json();
    assert.deepEqual(association.issues, []);
    await db.doc("lucrari/ambiguous").set({ client: "Same name" });
    await db.doc("clienti/a1").set({ nume: "Same name" });
    await db.doc("clienti/a2").set({ nume: "Same name" });
    const ambiguous = await service.forWork(
      { uid: "admin", role: "admin" },
      "ambiguous",
    );
    assert.equal(ambiguous.clientId, null);
    assert.match(ambiguous.issues[0], /ambiguu/);
    await db.doc("clienti/a1").delete();
    await db.doc("clienti/a2").delete();
    // Cancelled partial jobs release the lock and same-file retries are deterministic.
    const extra = [{ ...rows[0], code: "EXTRA", name: "Extra" }];
    const partial = await (
      await request(`${base}/imports`, "admin", manifest(extra, "cancel.csv"))
    ).json();
    assert.equal(
      (await request(`${base}/imports/${partial.id}/cancel`, "admin", {}))
        .status,
      200,
    );
    const restarted = await (
      await request(`${base}/imports`, "admin", manifest(extra, "cancel.csv"))
    ).json();
    assert.equal(restarted.next, 0);
    await request(`${base}/imports/${restarted.id}/cancel`, "admin", {});
    for (const path of [
      "sagaCatalogs/123456",
      `sagaCatalogs/123456/clients/${entry.id}`,
      "sagaCatalogs/123456/clientLinks/c",
      `sagaCatalogs/123456/clientImports/${job.id}`,
    ])
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
    assert.deepEqual(
      (await db.collection("clienti").get()).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
      originalClients,
    );
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    console.log(
      "PASS clients API/emulator: role/disabled checks, staged batches, idempotent resume, serialized import, duplicate/forged rows, revisions, country/tax conflicts, missing tax confirmation, multiple FOM clients, stale links, ambiguous work, firm isolation, denied direct Firestore access, unchanged FOM clients, no SAGA connection.",
    );

    console.log("Browser: building fixture");
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{SagaClientsImport}from'./components/settings/saga-clients-import';import{SagaClientAssociation}from'./components/clients/saga-client-association';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';createRoot(document.getElementById('root')).render(<main style={{padding:16,minHeight:1400}}>{location.pathname==='/ticket'?<InvoiceDraftSection workId="w" work={window.testWork}/>:location.pathname==='/client'||location.pathname==='/readonly'?<SagaClientAssociation clientId="c" canEdit={location.pathname!=='/readonly'}/>:<SagaClientsImport/>}</main>);`,
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
          path.join(root, "components/settings/saga-clients-import.tsx"),
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
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.testRole=${JSON.stringify(role)};window.testToken=${JSON.stringify(tokens[role])};window.testWork=${JSON.stringify(workBefore)};</script><script src="/app.js"></script>`,
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
    page.setDefaultTimeout(12000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Browser error", e.message);
    });
    await page.goto(url);
    console.log("Browser: import page loaded");
    await page.getByLabel("Export clienți", { exact: false }).setInputFiles({
      name: "browser.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Cod;Denumire;CUI;Tara\n00000;Client CSV;RO123;RO\n00999;Client browser;RO999;RO",
      ),
    });
    await page
      .getByRole("button", { name: "Citește exportul", exact: true })
      .click();
    for (const [name, index] of [
      ["Cod SAGA", "0"],
      ["Denumire", "1"],
      ["CUI/CIF", "2"],
      ["Țară", "3"],
    ])
      await page
        .getByLabel(`Coloană ${name}`, { exact: true })
        .selectOption(index);
    await page
      .getByRole("button", { name: "Pregătește previzualizarea" })
      .click();
    await expect(
      page.getByLabel("Cod SAGA rând 1", { exact: true }),
    ).toHaveValue("00000");
    await page
      .getByRole("button", { name: "Confirmă și salvează lista în FOM" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Import finalizat: 2 / 2",
    );
    // Excel worksheet mapping and explicit numeric code correction.
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Prima").addRows([
      ["ID", "Nume"],
      ["IGN", "Ignorat"],
    ]);
    workbook.addWorksheet("Lista").addRows([
      ["ID", "Nume", "CUI"],
      [888, "Client Excel", "RO888"],
    ]);
    await page.getByLabel("Export clienți", { exact: false }).setInputFiles({
      name: "browser.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
    await page
      .getByRole("button", { name: "Citește exportul", exact: true })
      .click();
    await page.getByLabel("Foaia exportului").selectOption("Lista");
    await page
      .getByLabel("Coloană Cod SAGA", { exact: true })
      .selectOption("0");
    await page
      .getByLabel("Coloană Denumire", { exact: true })
      .selectOption("1");
    await page.getByLabel("Coloană CUI/CIF", { exact: true }).selectOption("2");
    await page.getByLabel("Țară pentru rândurile", { exact: false }).fill("RO");
    await page
      .getByRole("button", { name: "Pregătește previzualizarea" })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirmă și salvează lista în FOM" }),
    ).toBeDisabled();
    await page.getByLabel("Cod SAGA rând 1", { exact: true }).fill("00888");
    await page
      .getByRole("button", { name: "Confirmă și salvează lista în FOM" })
      .click();
    await expect(page.getByRole("status")).toContainText(
      "Import finalizat: 1 / 1",
    );
    const artifacts = path.join(root, "test-results/saga-clients");
    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "import.png") });
    await page.goto(`${url}/client`);
    await expect(
      page.getByText("Asocierea necesită reconfirmare", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Schimbă asocierea", exact: true })
      .click();
    await page
      .getByLabel("Țara fiscală a clientului FOM", { exact: false })
      .fill("RO");
    await page
      .getByRole("button", { name: "Propune după CUI", exact: true })
      .click();
    await expect(page.getByRole("radio")).toHaveCount(2);
    await page.getByRole("radio", { name: /^00000 · Client CSV/ }).check();
    await page
      .getByRole("button", { name: "Confirmă asocierea în FOM", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Asociere salvată în FOM.",
    );
    await page.screenshot({ path: path.join(artifacts, "association.png") });
    await page.goto(`${url}/readonly`);
    await expect(
      page.getByText("Client SAGA asociat:", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Schimbă asocierea", exact: true }),
    ).toHaveCount(0);
    await page.goto(`${url}/ticket`);
    await page
      .getByRole("button", { name: "Începe factura", exact: true })
      .click();
    const invoice = page.getByRole("dialog", { name: "Ciorna facturii" }),
      info = page.getByRole("region", { name: "Client SAGA al facturii" });
    await expect(info).toContainText("Client CSV");
    await page.getByLabel("CUI/CIF", { exact: true }).fill("456");
    await expect(info).toContainText("diferă de clientul FOM");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      invoice.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Continuă ciorna", exact: true })
      .click();
    await expect(page.getByLabel("CUI/CIF", { exact: true })).toHaveValue(
      "456",
    );
    await expect(info).toContainText("diferă de clientul FOM");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await expect
        .poll(() => invoice.evaluate((el) => getComputedStyle(el).position))
        .not.toBe("fixed");
      await info.scrollIntoViewIfNeeded();
    }
    await page.screenshot({ path: path.join(artifacts, "invoice-mobile.png") });
    await page.goto(`${url}/client`);
    await page
      .getByRole("button", { name: "Elimină asocierea", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Păstrează asocierea", exact: true })
      .click();
    await expect(
      page.getByText("Client SAGA asociat:", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Elimină asocierea", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmă eliminarea", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Asociere eliminată.");
    assert.deepEqual(
      (await db.collection("clienti").get()).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })),
      originalClients,
    );
    assert.deepEqual((await db.doc("lucrari/w").get()).data(), workBefore);
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS clients browser: CSV/XLSX local preview, worksheet/column mapping, numeric code correction, import progress, explicit tax-match confirmation, readonly dispatcher, invoice identity warnings and preserved saved beneficiary, mobile widths and removal confirmation. No external HTTP requests.",
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
