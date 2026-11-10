import { eurFixtureHandlers } from "../lib/invoicing/eur-rate.fixtures";
/** Isolated Auth + Firestore emulators, real HTTP handlers/service and editor.
 * No production credentials, SAGA calls, invoice numbers or email delivery. */
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
import { createInvoiceDraftService } from "../lib/invoicing/service";
import { invoiceDraftHandlers } from "../lib/invoicing/http";
import { InvoiceDraftError, invoiceContent } from "../lib/invoicing/draft";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-invoice-draft",
  firestoreHost = "127.0.0.1:8398",
  authHost = "127.0.0.1:9398";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(
      path.join(tmpdir(), "fom-invoice-emulator-"),
    );
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8398 },
          auth: { host: "127.0.0.1", port: 9398 },
          hub: { port: 4498 },
          logging: { port: 4598 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-invoice-draft.ts")}\"`,
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
  const app = initializeApp({ projectId }, "invoice-draft-test"),
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
    const client = {
      id: "c",
      nume: "Client test",
      cui: "RO123",
      regCom: "J123",
      adresa: "Sediu fiscal",
      banca: "Bancă",
      contBancar: "RO-test",
      locatii: [
        {
          id: "l",
          nume: "Locație",
          adresa: "Adresa intervenției",
          persoaneContact: [
            {
              id: "p",
              nume: "Contact",
              telefon: "0700",
              email: "contact@example.test",
            },
          ],
          echipamente: [],
        },
      ],
    };
    const work = {
      clientId: "c",
      client: "Client test",
      locationId: "l",
      contactId: "p",
      locatie: "Locație",
      persoanaContact: "Contact",
      telefon: "0700",
      persoanaContactEmail: "contact@example.test",
      preluatDispecer: true,
      nrLucrare: "#123",
      tipLucrare: "Intervenție",
      statusLucrare: "În lucru",
      statusFacturare: "Nefacturat",
      createdByName: "Autor test",
      descriere: "Descrierea tichetului",
      devizProducts: [
        { name: "Piesă deviz", um: "buc", quantity: 2, price: 100 },
      ],
      devizVAT: 0,
      devizAdjustmentPercent: 10,
    };
    await db.doc("clienti/c").set(client);
    await db.doc("lucrari/w").set(work);
    await db
      .doc("predefinedSettings/offers_default_vat_percent")
      .set({ value: 19 });
    const service = createInvoiceDraftService(db);
    const authenticate = async (request: Request) => {
      const bearer = request.headers
        .get("authorization")
        ?.replace(/^Bearer /, "");
      if (!bearer) throw new InvoiceDraftError("Autentificare necesară.", 401);
      const verified = await auth.verifyIdToken(bearer);
      const user = (await db.doc(`users/${verified.uid}`).get()).data();
      return { uid: verified.uid, role: user?.role || "" };
    };
    const handlers = invoiceDraftHandlers(service, authenticate),
      eurHttp = eurFixtureHandlers(db, authenticate);
    const call = (
      method: "GET" | "PUT",
      role = "admin",
      body?: unknown,
      source = false,
    ) =>
      handlers[method](
        new Request(
          `http://localhost/api/lucrari/w/invoice-draft${source ? "?source=1" : ""}`,
          {
            method,
            headers: role
              ? { Authorization: `Bearer ${tokens[role]}` }
              : { Cookie: "userRole=admin" },
            body: body ? JSON.stringify(body) : undefined,
          },
        ),
        { params: Promise.resolve({ id: "w" }) },
      );
    assert.equal((await call("GET", "")).status, 401);
    for (const role of ["client", "tehnician"])
      assert.equal((await call("GET", role)).status, 403);
    const first = await (await call("GET")).json();
    assert.equal(first.draft.lines[0].name, "Piesă deviz");
    assert.equal(first.draft.beneficiary.cui, "RO123");
    assert.equal(first.draft.references.locationAddress, "Adresa intervenției");
    assert.equal((await db.doc("invoiceDrafts/w").get()).exists, false);
    const content = invoiceContent(first.draft);
    assert.equal(
      (await call("PUT", "", { expectedRevision: 0, content })).status,
      401,
    );
    for (const role of ["client", "tehnician"]) {
      assert.equal(
        (await call("PUT", role, { expectedRevision: 0, content })).status,
        403,
      );
    }
    await db.doc("users/admin").update({ disabled: true });
    assert.equal((await call("GET")).status, 403);
    await db.doc("users/admin").update({ disabled: false });
    for (const patch of [
      { preluatDispecer: false },
      { anulat: true },
      { statusFacturare: "Facturat" },
      { statusFacturare: "Nu se facturează" },
    ]) {
      await db.doc("lucrari/w").set({ ...work, ...patch });
      assert.equal((await (await call("GET")).json()).draft, null);
      assert.equal(
        (await call("PUT", "admin", { expectedRevision: 0, content })).status,
        409,
      );
      assert.equal((await db.doc("invoiceDrafts/w").get()).exists, false);
    }
    await db.doc("lucrari/w").set(work);
    let result = await call("PUT", "admin", {
      expectedRevision: 0,
      content,
      totals: { totalCents: 1 },
    });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).draft.totals.totalCents, 18000);
    assert.deepEqual((await db.doc("lucrari/w").get()).data(), work);
    assert.deepEqual((await db.doc("clienti/c").get()).data(), client);
    assert.equal((await db.collection("numarRaport").get()).size, 0);
    const concurrent = await Promise.all([
      call("PUT", "admin", {
        expectedRevision: 1,
        content: {
          ...content,
          beneficiary: { ...content.beneficiary, name: "Operator A" },
        },
      }),
      call("PUT", "dispecer", {
        expectedRevision: 1,
        content: {
          ...content,
          beneficiary: { ...content.beneficiary, name: "Operator B" },
        },
      }),
    ]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await db.doc("invoiceDrafts/w").get()).data()!.revision, 2);
    for (const role of ["admin", "dispecer", "tehnician", "client", ""]) {
      const headers: Record<string, string> = role
        ? { Authorization: `Bearer ${tokens[role]}` }
        : {};
      const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/invoiceDrafts/w`;
      assert.equal(
        (await fetch(url, { headers })).status,
        403,
        `direct read blocked: ${role}`,
      );
      assert.equal(
        (
          await fetch(url, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: { revision: { integerValue: "999" } },
            }),
          })
        ).status,
        403,
      );
      assert.equal(
        (await fetch(url + "/private/nested", { headers })).status,
        403,
      );
    }
    await db.doc("lucrari/w").update({ statusLucrare: "Arhivată" });
    assert.equal((await (await call("GET")).json()).canEdit, false);
    assert.equal(
      (await call("PUT", "admin", { expectedRevision: 2, content })).status,
      409,
    );
    await db.doc("lucrari/w").set(work);
    const invalid = structuredClone(content);
    invalid.lines[0].price = "NaN";
    assert.equal(
      (await call("PUT", "admin", { expectedRevision: 2, content: invalid }))
        .status,
      400,
    );
    await db.doc("lucrari/ambiguous").set({
      ...work,
      clientId: "",
      client: "Duplicat",
      devizProducts: [],
      devizVAT: null,
    });
    await Promise.all([
      db.doc("clienti/a").set({ nume: "Duplicat", cui: "A" }),
      db.doc("clienti/b").set({ nume: "Duplicat", cui: "B" }),
    ]);
    const ambiguous = await service.get("ambiguous", {
      uid: "admin",
      role: "admin",
    });
    assert.equal(ambiguous.draft!.source.clientId, null);
    assert.equal(ambiguous.draft!.beneficiary.cui, "");
    assert.ok(ambiguous.draft!.source.issues.length);
    assert.equal(ambiguous.draft!.vatPercent, "19");
    console.log(
      "PASS: real Auth/Firestore emulator + HTTP handlers: prefill, no GET writes, server totals, concurrent revisions, role/cookie rejection, direct Firestore denials, readonly/invalid/ambiguous cases, unchanged ticket/client/counter.",
    );

    // Start the actual component against the same real HTTP service and emulator.
    await db.doc("invoiceDrafts/w").delete();
    const mocks: Record<string, string> = {
      "@/contexts/AuthContext": `export const useAuth=()=>({user:{getIdToken:async()=>window.testToken,uid:'admin'}});`,
    };
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';createRoot(document.getElementById('root')).render(<main style={{minHeight:1800,padding:24}}><h1>Tichet test</h1><button onClick={()=>window.backgroundClicks++}>Consultă detaliile tichetului</button><section><h2>Deviz</h2></section><InvoiceDraftSection workId="w" work={window.testWork}/><section><h2>Documente PDF</h2></section></main>);`,
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
            b.onResolve({ filter: /.*/ }, (a) =>
              mocks[a.path]
                ? { path: a.path, namespace: "fixture" }
                : undefined,
            );
            b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({
              contents: mocks[a.path],
              loader: "tsx",
              resolveDir: root,
            }));
          },
        },
      ],
    });
    const postcss = (await import("postcss")).default,
      tailwind = (await import("tailwindcss")).default;
    const tailwindConfig = (await import("../tailwind.config")).default;
    const css = await postcss([
      tailwind({
        ...tailwindConfig,
        content: [
          path.join(root, "components/invoicing/**/*.tsx"),
          path.join(root, "components/ui/{button,input}.tsx"),
        ],
      }),
    ]).process(await readFile(path.join(root, "app/globals.css"), "utf8"), {
      from: path.join(root, "app/globals.css"),
    });
    assert.ok(
      css.css.includes(".fixed"),
      "fixture must include actual Tailwind utilities",
    );
    server = createServer(async (req, res) => {
      try {
        if (req.url?.startsWith("/api/lucrari/w/invoice-draft/eur-rate")) {
          const response = await eurHttp.get(
            new Request("http://localhost" + req.url, {
              headers: req.headers as Record<string, string>,
            }),
            "w",
          );
          res.writeHead(response.status, Object.fromEntries(response.headers));
          res.end(await response.text());
          return;
        }
        if (req.url === "/api/integrations/saga/commercial-policy") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              enabled: false,
              revision: 0,
              canAdmin: false,
              writesEnabled: false,
            }),
          );
          return;
        }
        // Empty catalog fixture: invoice regression tests never consult SAGA.
        if (req.url === "/api/integrations/saga/catalog") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              fiscalCode: "123456",
              products: [],
              warehouses: [],
            }),
          );
          return;
        }
        if (req.url === "/api/lucrari/w/invoice-saga") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              mode: "dry-run",
              canStart: true,
              reason: "",
              transfer: null,
            }),
          );
          return;
        }
        if (req.url === "/api/lucrari/w/invoice-xml") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ document: null }));
          return;
        }
        if (req.url === "/api/lucrari/w/invoice-draft/number") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              fiscalCode: "123456",
              number: null,
              reserved: false,
              reason: "",
            }),
          );
          return;
        }
        if (req.url === "/api/lucrari/w/invoice-draft/client-association") {
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              fiscalCode: "123456",
              clientId: "c",
              clientName: "Client test",
              taxId: "",
              revision: 0,
              link: null,
              entry: null,
              issues: ["Clientul FOM nu este asociat cu SAGA."],
            }),
          );
          return;
        }
        if (req.url?.startsWith("/api/lucrari/w/invoice-draft")) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const request = new Request("http://localhost" + req.url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body:
              req.method === "PUT"
                ? Buffer.concat(chunks).toString()
                : undefined,
          });
          const response = await handlers[req.method === "PUT" ? "PUT" : "GET"](
            request,
            { params: Promise.resolve({ id: "w" }) },
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
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.testToken=${JSON.stringify(tokens.admin)};window.testWork=${JSON.stringify(work)};window.backgroundClicks=0;</script><script src="/app.js"></script>`,
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
    page.setDefaultTimeout(10000);
    page.setDefaultNavigationTimeout(10000);
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error("Browser error:", e.message);
    });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto(url);
    console.log("Browser: editor page loaded");
    await page
      .getByRole("button", { name: "Începe factura", exact: true })
      .click();
    const panel = page.getByRole("dialog", { name: "Ciorna facturii" });
    await expect(panel).toBeVisible();
    await expect(
      page.getByLabel("Denumire beneficiar", { exact: true }),
    ).toHaveValue("Client test");
    await expect(
      page.getByLabel("invoice: TVA (%)", { exact: true }),
    ).toHaveValue("0");
    await expect(
      page.getByLabel("invoice: Denumire 1", { exact: true }),
    ).toHaveValue("Piesă deviz");
    await page
      .getByRole("button", {
        name: "Consultă detaliile tichetului",
        exact: true,
      })
      .click();
    assert.equal(
      await page.evaluate(() => (window as any).backgroundClicks),
      1,
    );
    const header = page.getByLabel("Mută fereastra facturii"),
      before = (await panel.boundingBox())!;
    const h = (await header.boundingBox())!;
    await page.mouse.move(h.x + 120, h.y + 24);
    await page.mouse.down();
    await page.mouse.move(h.x - 100, h.y + 100, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const box = (await panel.boundingBox())!;
        return box.x < before.x && box.y > before.y;
      })
      .toBe(true);
    const after = (await panel.boundingBox())!;
    await header.focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(async () => (await panel.boundingBox())!.x)
      .toBeLessThan(after.x);
    console.log(
      "Browser: background interaction and pointer/keyboard move passed",
    );
    await page
      .getByLabel("Denumire beneficiar", { exact: true })
      .fill("Beneficiar modificat");
    await page
      .getByRole("button", { name: "Minimizează factura", exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await page
      .getByRole("button", { name: "Continuă ciorna · nesalvată", exact: true })
      .click();
    await expect(
      page.getByLabel("Denumire beneficiar", { exact: true }),
    ).toHaveValue("Beneficiar modificat");
    await page
      .getByRole("button", { name: "Închide factura", exact: true })
      .click();
    await expect(
      page.getByRole("group", { name: "Confirmare în editor" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Continuă editarea", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Ciornă salvată.");
    await page.reload();
    await page
      .getByRole("button", { name: "Continuă ciorna", exact: true })
      .click();
    await expect(
      page.getByLabel("Denumire beneficiar", { exact: true }),
    ).toHaveValue("Beneficiar modificat");
    console.log("Browser: save and reload passed");
    await db.doc("lucrari/w").update({
      devizProducts: [{ name: "Deviz nou", um: "buc", quantity: 1, price: 50 }],
    });
    await page
      .getByRole("button", { name: "Reia datele din tichet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Înlocuiește datele", exact: true })
      .click();
    await expect(
      page.getByLabel("invoice: Denumire 1", { exact: true }),
    ).toHaveValue("Deviz nou");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText("Ciornă salvată.");
    const current = (await db.doc("invoiceDrafts/w").get()).data()!;
    await service.put(
      "w",
      {
        expectedRevision: current.revision,
        content: {
          ...invoiceContent(current as any),
          beneficiary: { ...current.beneficiary, name: "Alt operator" },
        },
      },
      { uid: "dispecer", role: "dispecer" },
    );
    await page
      .getByLabel("Denumire beneficiar", { exact: true })
      .fill("Modificarea mea");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "alt operator" }),
    ).toContainText("alt operator");
    await expect(
      page.getByLabel("Denumire beneficiar", { exact: true }),
    ).toHaveValue("Modificarea mea");
    await page
      .getByRole("button", { name: "Reia datele din tichet", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Înlocuiește datele", exact: true })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "alt operator" }),
    ).toContainText("alt operator");
    await expect(
      page.getByLabel("Denumire beneficiar", { exact: true }),
    ).toHaveValue("Modificarea mea");
    await page.getByText("Compară versiunea salvată de dispecer").click();
    await expect(
      page.getByLabel("Versiune salvată: Denumire beneficiar", { exact: true }),
    ).toHaveValue("Alt operator");
    console.log("Browser: source reload and conflict passed");
    const artifacts = path.join(root, "test-results/invoice-draft");
    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await page.screenshot({
      path: path.join(artifacts, "desktop-conflict.png"),
    });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(async () => (await panel.boundingBox())!.width)
        .toBeLessThanOrEqual(width);
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await expect
        .poll(() =>
          panel.evaluate((element) => getComputedStyle(element).position),
        )
        .toBe("relative");
      await page
        .getByLabel("invoice: Preț unitar 1", { exact: true })
        .fill("51,25");
      const save = page.getByRole("button", {
        name: "Salvează ciorna",
        exact: true,
      });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
    }
    await page.screenshot({
      path: path.join(artifacts, "mobile-inline.png"),
      fullPage: true,
    });
    await db.doc("lucrari/w").update({
      statusFacturare: "Nu se facturează",
      motivNefacturare: "Contract",
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Vezi ciorna", exact: true })
      .click();
    await expect(
      page.getByLabel("Denumire beneficiar", { exact: true }),
    ).toBeDisabled();
    assert.deepEqual(errors, []);
    assert.equal((await db.collection("numarRaport").get()).size, 0);
    console.log(
      "PASS: real editor → HTTP → Auth/Firestore: background interaction, drag/keyboard, minimize/unsaved close, save/reload, explicit reimport, conflict comparison, 320/390px, read-only. SAGA never called.",
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
