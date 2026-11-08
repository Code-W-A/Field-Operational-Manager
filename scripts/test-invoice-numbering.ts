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
import { createInvoiceNumberingService } from "../lib/invoicing/numbering.server";
import { numberingHandlers } from "../lib/invoicing/numbering-http";
import { InvoiceNumberingError } from "../lib/invoicing/numbering";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-invoice-numbering",
  firestoreHost = "127.0.0.1:8394",
  authHost = "127.0.0.1:9394";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8394 },
          auth: { host: "127.0.0.1", port: 9394 },
          hub: { port: 4494 },
          logging: { port: 4594 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-invoice-numbering.ts")}\"`,
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
  const app = initializeApp({ projectId }, "invoice-numbering-test"),
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
    let date = new Date("2026-11-07T12:00:00Z");
    const service = createInvoiceNumberingService(
        db,
        () => config,
        () => date,
      ),
      actor = { uid: "admin", role: "admin" },
      dispatcher = { uid: "dispecer", role: "dispecer" };
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
    const handlers = numberingHandlers(service, authenticate),
      drafts = invoiceDraftHandlers(
        createInvoiceDraftService(db),
        authenticate,
      );
    const base = "/api/integrations/saga/numbering";
    async function dispatch(r: Request) {
      const p = new URL(r.url).pathname;
      if (p === base)
        return r.method === "GET"
          ? handlers.get(r)
          : r.method === "PUT"
            ? handlers.put(r)
            : new Response(null, { status: 405 });
      if (p === `${base}/preview`) return handlers.preview(r);
      if (p.endsWith("/invoice-xml")) return Response.json({ document: null });
      if (p.endsWith("/number")) return handlers.estimate(r, "w");
      if (p.endsWith("/client-association"))
        return Response.json({
          fiscalCode: "123456",
          clientId: null,
          clientName: "",
          taxId: "",
          revision: 0,
          link: null,
          entry: null,
          issues: [],
        });
      if (p.endsWith("/catalog"))
        return Response.json({
          fiscalCode: "123456",
          products: [],
          warehouses: [],
        });
      if (p.includes("/invoice-draft"))
        return drafts[r.method === "PUT" ? "PUT" : "GET"](r, {
          params: Promise.resolve({ id: "w" }),
        });
      return new Response(null, { status: 404 });
    }
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
    const input = {
      expectedRevision: 0,
      prefix: "NRG",
      lastVerifiedNumber: "000125",
      reason: "",
      exclusiveConfirmed: true,
      sagaVerified: true,
    };
    assert.equal((await request(base, "")).status, 401);
    for (const role of ["client", "tehnician"])
      assert.equal((await request(base, role)).status, 403);
    assert.equal((await request(base, "dispecer")).status, 200);
    assert.equal(
      (await request(`${base}/preview`, "dispecer", input)).status,
      403,
    );
    assert.equal((await request(base, "dispecer", input, "PUT")).status, 403);
    await db.doc("users/admin").update({ disabled: true });
    assert.equal((await request(base)).status, 403);
    await db.doc("users/admin").update({ disabled: false });
    const disabled = createInvoiceNumberingService(db, () => ({
      ...config,
      readsEnabled: false,
    }));
    const disabledPreview = await disabled.preview(actor, input);
    await assert.rejects(
      disabled.put(actor, {
        ...input,
        confirmationHash: disabledPreview.confirmationHash,
      }),
      (e) => (e as InvoiceNumberingError).code === "NUMBERING_DISABLED",
    );
    assert.equal((await db.collection("invoiceCounters").get()).size, 0);
    const preview = await (
      await request(`${base}/preview`, "admin", input)
    ).json();
    assert.equal(preview.nextNumber, "NRG000126");
    assert.equal((await db.collection("invoiceNumbering").get()).size, 0);
    assert.equal(
      (
        await request(
          base,
          "admin",
          { ...input, confirmationHash: "forged" },
          "PUT",
        )
      ).status,
      409,
    );
    let state = await (
      await request(
        base,
        "admin",
        { ...input, confirmationHash: preview.confirmationHash },
        "PUT",
      )
    ).json();
    assert.equal(state.counter.allocationCount, 0);
    assert.equal(state.estimatedNumber, "NRG000126");
    const work = {
      preluatDispecer: true,
      client: "Client test",
      statusFacturare: "Nefacturat",
      nrLucrare: "TEST-NUMBER",
      products: [{ name: "Piesă", um: "buc", quantity: 1, price: 100 }],
    };
    for (const id of ["w", "w2", "w3", "stale", "blocked"]) {
      await db.doc(`lucrari/${id}`).set(work);
      await db.doc(`invoiceDrafts/${id}`).set({ revision: 1 });
    }
    const beforeWork = (await db.doc("lucrari/w").get()).data();
    const beforeCounter = JSON.stringify((await service.get(actor)).counter);
    assert.equal((await service.estimate(dispatcher, "w")).number, "NRG000126");
    assert.equal(
      JSON.stringify((await service.get(actor)).counter),
      beforeCounter,
    );
    // Identical retries and different operation keys for the same work return one number.
    const same = await Promise.all([
      service.reserve(actor, {
        workId: "w",
        operationId: "op1",
        expectedDraftRevision: 1,
      }),
      service.reserve(dispatcher, {
        workId: "w",
        operationId: "op1",
        expectedDraftRevision: 1,
      }),
    ]);
    assert.equal(same[0].fullNumber, "NRG000126");
    assert.deepEqual(same[0], same[1]);
    assert.equal(
      (
        await service.reserve(actor, {
          workId: "w",
          operationId: "alias",
          expectedDraftRevision: 1,
        })
      ).fullNumber,
      "NRG000126",
    );
    await assert.rejects(
      service.reserve(actor, {
        workId: "w2",
        operationId: "alias",
        expectedDraftRevision: 1,
      }),
      (e) => (e as InvoiceNumberingError).status === 409,
    );
    // Concurrent different works get consecutive distinct numbers.
    const different = await Promise.all([
      service.reserve(actor, {
        workId: "w2",
        operationId: "op2",
        expectedDraftRevision: 1,
      }),
      service.reserve(dispatcher, {
        workId: "w3",
        operationId: "op3",
        expectedDraftRevision: 1,
      }),
    ]);
    assert.deepEqual(different.map((v) => v.fullNumber).sort(), [
      "NRG000127",
      "NRG000128",
    ]);
    await assert.rejects(
      service.reserve(actor, {
        workId: "stale",
        operationId: "stale",
        expectedDraftRevision: 2,
      }),
      (e) => (e as InvoiceNumberingError).status === 409,
    );
    await db
      .doc("lucrari/blocked")
      .update({ statusFacturare: "Facturat", numarFactura: "MANUAL1" });
    await assert.rejects(
      service.reserve(actor, {
        workId: "blocked",
        operationId: "blocked",
        expectedDraftRevision: 1,
      }),
      (e) => (e as InvoiceNumberingError).code === "DRAFT_READ_ONLY",
    );
    assert.equal((await service.get(actor)).counter!.allocationCount, 3);
    for (const patch of [
      { prefix: "OTHER" },
      { lastVerifiedNumber: "000127" },
      { reason: "" },
    ])
      assert.equal(
        (
          await request(`${base}/preview`, "admin", {
            ...input,
            expectedRevision: 1,
            lastVerifiedNumber: "000128",
            reason: "Corecție",
            ...patch,
          })
        ).status,
        400,
      );
    // A counter allocation after preview invalidates its confirmation, even if config revision is unchanged.
    const correction = {
      ...input,
      expectedRevision: 1,
      lastVerifiedNumber: "000200",
      reason: "Ultimul număr verificat cu contabilitatea",
    };
    const correctionPreview = await service.preview(actor, correction);
    await service.reserve(actor, {
      workId: "stale",
      operationId: "op4",
      expectedDraftRevision: 1,
    });
    await assert.rejects(
      service.put(actor, {
        ...correction,
        confirmationHash: correctionPreview.confirmationHash,
      }),
      (e) => (e as InvoiceNumberingError).code === "NUMBERING_CONFLICT",
    );
    const fresh = await service.preview(actor, correction);
    state = await service.put(actor, {
      ...correction,
      confirmationHash: fresh.confirmationHash,
    });
    assert.equal(state.estimatedNumber, "NRG000201");
    assert.equal(state.counter.allocationCount, 4);
    assert.equal(
      (
        await service.reserve(actor, {
          workId: "w",
          operationId: "op1",
          expectedDraftRevision: 1,
        })
      ).fullNumber,
      "NRG000126",
    );
    date = new Date("2027-01-01T12:00:00Z");
    assert.equal((await service.get(actor)).estimatedNumber, "NRG000201");
    const otherFirm = createInvoiceNumberingService(db, () => ({
      ...config,
      fiscalCode: "654321",
    }));
    const otherPreview = await otherFirm.preview(actor, input);
    await otherFirm.put(actor, {
      ...input,
      confirmationHash: otherPreview.confirmationHash,
    });
    assert.equal(
      (
        await otherFirm.reserve(actor, {
          workId: "w",
          operationId: "op1",
          expectedDraftRevision: 1,
        })
      ).fullNumber,
      "NRG000126",
    );
    assert.equal((await service.get(actor)).estimatedNumber, "NRG000201");
    // Series scope before first allocation is separate; the prior unused counter is retained.
    const third = createInvoiceNumberingService(db, () => ({
      ...config,
      fiscalCode: "111111",
    }));
    let p = await third.preview(actor, input);
    await third.put(actor, { ...input, confirmationHash: p.confirmationHash });
    const changedSeries = {
      ...input,
      expectedRevision: 1,
      prefix: "ALT-",
      lastVerifiedNumber: "009",
      reason: "Corectare serie înainte de folosire",
    };
    p = await third.preview(actor, changedSeries);
    await third.put(actor, {
      ...changedSeries,
      confirmationHash: p.confirmationHash,
    });
    assert.equal(
      (
        await third.reserve(actor, {
          workId: "w",
          operationId: "op1",
          expectedDraftRevision: 1,
        })
      ).fullNumber,
      "ALT-010",
    );
    for (const collection of ["invoiceCounters", "invoiceNumberReservations"]) {
      const doc = (await db.collection(collection).get()).docs[0];
      for (const token of ["", tokens.admin]) {
        const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${collection}/${doc.id}`,
          headers: Record<string, string> = token
            ? { Authorization: `Bearer ${token}` }
            : {};
        assert.equal((await fetch(url, { headers })).status, 403);
        assert.equal(
          (
            await fetch(url, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: '{"fields":{"lastNumber":{"stringValue":"0"}}}',
            })
          ).status,
          403,
        );
      }
    }
    for (const path of [
      "invoiceNumbering/123456",
      "invoiceNumbering/123456/audit/test",
      "invoiceNumbering/123456/operations/test",
    ]) {
      const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
      for (const token of ["", tokens.admin]) {
        const headers: Record<string, string> = token
          ? { Authorization: `Bearer ${token}` }
          : {};
        assert.equal((await fetch(url, { headers })).status, 403);
        assert.equal(
          (
            await fetch(url, {
              method: "PATCH",
              headers: { ...headers, "Content-Type": "application/json" },
              body: '{"fields":{"lastNumber":{"stringValue":"0"}}}',
            })
          ).status,
          403,
        );
      }
    }
    assert.equal((await request(base, "admin", {}, "POST")).status, 405);
    assert.equal((await request(`${base}/reserve`, "admin", {})).status, 404);
    assert.deepEqual((await db.doc("lucrari/w").get()).data(), beforeWork);
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    console.log(
      "PASS numbering API/emulator: authorization, no preview writes, explicit hash confirmation, zero padding, internal-only allocation, retry/concurrency/operation isolation, forward-only correction and stale previews, stable series and year, firm/series isolation, denied direct Firestore access, unchanged tickets, no SAGA traffic.",
    );
    // Browser uses another company: configuration + draft estimate without any reservation.
    const uiService = createInvoiceNumberingService(db, () => ({
        ...config,
        fiscalCode: "222222",
      })),
      uiHandlers = numberingHandlers(uiService, authenticate);
    const originalDispatch = dispatch;
    async function uiDispatch(r: Request) {
      const path = new URL(r.url).pathname;
      if (path === base)
        return r.method === "GET" ? uiHandlers.get(r) : uiHandlers.put(r);
      if (path === `${base}/preview`) return uiHandlers.preview(r);
      if (path.endsWith("/number")) return uiHandlers.estimate(r, "w");
      return originalDispatch(r);
    }
    await db.doc("invoiceDrafts/w").delete();
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from'react';import{createRoot}from'react-dom/client';import{InvoiceNumberingSettings}from'./components/settings/invoice-numbering-settings';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';createRoot(document.getElementById('root')).render(<main style={{padding:16,minHeight:1500}}>{location.pathname==='/ticket'?<InvoiceDraftSection workId="w" work={window.testWork}/>:<InvoiceNumberingSettings/>}</main>);`,
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
          path.join(root, "components/settings/invoice-numbering-settings.tsx"),
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
          const result = await uiDispatch(
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
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page
      .getByLabel("Serie / prefix factură", { exact: true })
      .fill("NRG");
    await page
      .getByLabel("Ultimul număr verificat în SAGA (doar cifre)", {
        exact: true,
      })
      .fill("000125");
    await page.getByLabel("Confirm că am verificat", { exact: false }).check();
    await page.getByLabel("Confirm că această serie", { exact: false }).check();
    await page
      .getByRole("button", { name: "Pregătește numerotarea", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare numerotare" }),
    ).toContainText("NRG000126");
    assert.equal((await uiService.get(actor)).config, null);
    await page
      .getByRole("button", { name: "Anulează confirmarea", exact: true })
      .click();
    assert.equal((await uiService.get(actor)).config, null);
    await page
      .getByRole("button", { name: "Pregătește numerotarea", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Confirmă și salvează numerotarea",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Numerotare salvată în FOM.",
    );
    const artifacts = path.join(root, "test-results/invoice-numbering");
    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "settings.png") });
    await page.reload();
    await expect(
      page.getByLabel("Ultimul număr verificat în SAGA (doar cifre)", {
        exact: true,
      }),
    ).toHaveValue("000125");
    await page.goto(`${url}/ticket`);
    await page
      .getByRole("button", { name: "Începe factura", exact: true })
      .click();
    const panel = page.getByRole("dialog", { name: "Ciorna facturii" }),
      estimate = page.getByRole("region", { name: "Numărul facturii" });
    await expect(estimate).toContainText("Număr estimat — nerezervat");
    await expect(estimate).toContainText("NRG000126");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      panel.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    assert.equal((await uiService.get(actor)).counter!.allocationCount, 0);
    assert.equal(
      (
        await db
          .collection("invoiceNumberReservations")
          .where("fiscalCode", "==", "222222")
          .get()
      ).size,
      0,
    );
    await page.reload();
    await page
      .getByRole("button", { name: "Continuă ciorna", exact: true })
      .click();
    await expect(estimate).toContainText("NRG000126");
    await page
      .getByRole("button", { name: "Minimizează factura", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continuă ciorna", exact: true })
      .last()
      .click();
    await expect(estimate).toContainText("nerezervat");
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() => panel.evaluate((el) => getComputedStyle(el).position))
        .not.toBe("fixed");
      await estimate.scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    await page.screenshot({ path: path.join(artifacts, "draft-mobile.png") });
    // The browser also enforces the configuration constraints after an internal allocation.
    const draftRevision = (await db.doc("invoiceDrafts/w").get()).data()!
      .revision;
    await uiService.reserve(actor, {
      workId: "w",
      operationId: "ui-fixture-allocation",
      expectedDraftRevision: draftRevision,
    });
    await page.goto(url);
    await expect(
      page.getByLabel("Serie / prefix factură", { exact: true }),
    ).toHaveAttribute("readonly", "");
    await page
      .getByLabel("Ultimul număr verificat în SAGA (doar cifre)", {
        exact: true,
      })
      .fill("000125");
    await page
      .getByLabel("Motivul corecției", { exact: true })
      .fill("Verificare corecție");
    await page.getByLabel("Confirm că am verificat", { exact: false }).check();
    await page.getByLabel("Confirm că această serie", { exact: false }).check();
    await page
      .getByRole("button", { name: "Pregătește numerotarea", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("nu poate fi micșorat");
    await page
      .getByLabel("Ultimul număr verificat în SAGA (doar cifre)", {
        exact: true,
      })
      .fill("200");
    await page
      .getByRole("button", { name: "Pregătește numerotarea", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare numerotare" }),
    ).toContainText("NRG000201");
    await page
      .getByRole("button", {
        name: "Confirmă și salvează numerotarea",
        exact: true,
      })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Numerotare salvată în FOM.",
    );
    assert.equal((await uiService.get(actor)).estimatedNumber, "NRG000201");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(artifacts, "settings-mobile.png"),
    });
    assert.deepEqual(errors, []);
    assert.deepEqual((await db.doc("lucrari/w").get()).data(), beforeWork);
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    assert.equal((await uiService.get(actor)).estimatedNumber, "NRG000201");
    console.log(
      "PASS numbering browser: admin preview/cancel/confirm and reload, dispatcher estimate, draft save/reopen/minimize, 320/390px, draft operations consume no numbers, internal allocation separate; immutable series and forward correction; unchanged legacy statuses. No external HTTP requests.",
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
