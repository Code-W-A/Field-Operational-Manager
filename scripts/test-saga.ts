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

import { createInvoiceNumberingService } from "../lib/invoicing/numbering.server";
import { numberingHandlers } from "../lib/invoicing/numbering-http";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-saga-read",
  firestoreHost = "127.0.0.1:8397",
  authHost = "127.0.0.1:9397";
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-saga-emulator-"));
    const config = path.join(directory, "firebase.json");
    await writeFile(
      config,
      JSON.stringify({
        firestore: { rules: path.join(root, "firestore.rules") },
        emulators: {
          firestore: { host: "127.0.0.1", port: 8397 },
          auth: { host: "127.0.0.1", port: 9397 },
          hub: { port: 4497 },
          logging: { port: 4597 },
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-saga.ts")}\"`,
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
  const app = initializeApp({ projectId }, "saga-read-test"),
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
      SAGA_API_KEY: "fixture-bootstrap-token",
      SAGA_COD_FISCAL: "123456",
      SAGA_API_BASE_URL: "https://web.sagasoft.ro/api/v20260225",
      SAGA_TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
    });
    const connectionRef = db.doc("sagaConnections/123456");
    const actor = { uid: "admin", role: "admin" };
    const calls: { url: string; token: string }[] = [];
    const articleXML =
      "<Articol><Denumire>Motor poartă</Denumire><TVA>0</TVA><UM>BUC</UM><Pret_Vanzare1>100.50</Pret_Vanzare1></Articol>";
    let transport: (url: URL, init: RequestInit) => Promise<Response> = async (
      url,
      init,
    ) => {
      calls.push({
        url: url.href,
        token: new Headers(init.headers).get("Authorization")!,
      });
      return new Response(
        url.pathname.endsWith("GetArticol")
          ? articleXML
          : JSON.stringify({ success: true, data: "12.50" }),
        { headers: { "X-Saga-Refresh-Token": "fixture-renewed-token" } },
      );
    };
    const service = createSagaService(db, {
      config: () => config,
      fetch: ((url, init) =>
        transport(new URL(String(url)), init!)) as typeof fetch,
    });
    const authenticate = async (request: Request) => {
      const bearer = request.headers
        .get("Authorization")
        ?.replace(/^Bearer /, "");
      if (!bearer)
        throw new SagaError("UNAUTHENTICATED", "Autentificare necesară.", 401);
      const verified = await auth.verifyIdToken(bearer);
      return {
        uid: verified.uid,
        role: (await db.doc(`users/${verified.uid}`).get()).data()!.role,
      };
    };
    const handlers = sagaHandlers(service, authenticate);
    const numbering = numberingHandlers(
      createInvoiceNumberingService(db, () => config),
      authenticate,
    );
    const catalogs = sagaCatalogHandlers(
      createSagaCatalogService(db, service.readForInvoice, () => config),
      authenticate,
    );
    const call = (kind: "status" | "read", role = "admin", body?: unknown) =>
      handlers[kind](
        new Request(`http://localhost/api/integrations/saga/${kind}`, {
          method: kind === "read" ? "POST" : "GET",
          headers: role
            ? { Authorization: `Bearer ${tokens[role]}` }
            : { Cookie: "userRole=admin" },
          body: kind === "read" && body ? JSON.stringify(body) : undefined,
        }),
      );
    for (const operation of ["status", "read"] as const) {
      assert.equal(
        (await call(operation, "", { kind: "article", code: "0001" })).status,
        401,
      );
      for (const role of ["dispecer", "tehnician", "client"])
        assert.equal(
          (
            await call(
              operation,
              role,
              operation === "read"
                ? { kind: "article", code: "0001" }
                : undefined,
            )
          ).status,
          403,
        );
    }
    await db.doc("users/admin").update({ disabled: true });
    assert.equal((await call("status")).status, 403);
    await db.doc("users/admin").update({ disabled: false });
    const initial = await (await call("status")).json();
    assert.equal(initial.state, "ready");
    assert.equal(calls.length, 0);
    assert.equal((await connectionRef.get()).exists, false);
    const disabledService = createSagaService(db, {
      config: () => ({ ...config, readsEnabled: false }),
      fetch: (async () => {
        throw Error("Disabled connector must not call SAGA");
      }) as typeof fetch,
    });
    assert.equal((await disabledService.status(actor)).state, "disabled");
    await assert.rejects(
      disabledService.read(actor, { kind: "article", code: "0001" }),
      (e) => (e as SagaError).code === "READS_DISABLED",
    );
    assert.equal((await connectionRef.get()).exists, false);
    const invalid = await call("read", "admin", {
      kind: "import",
      code: "0001",
    });
    assert.equal(invalid.status, 400);
    assert.equal(calls.length, 0);
    let response = await call("read", "admin", {
      kind: "article",
      code: "0001",
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).article.name, "Motor poartă");
    let stored = (await connectionRef.get()).data()!;
    assert.equal(stored.state, "connected");
    assert.ok(!JSON.stringify(stored).includes("fixture-bootstrap-token"));
    assert.ok(!JSON.stringify(stored).includes("fixture-renewed-token"));
    assert.equal(
      decryptToken(stored.tokenEnc, config.encryptionKey, "123456"),
      "fixture-renewed-token",
    );
    response = await call("read", "admin", {
      kind: "stock",
      code: "0001",
      warehouse: "0002",
      date: "2026-11-06",
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).quantity, "12.50");
    assert.equal(calls[1].token, "Bearer fixture-renewed-token");
    const stockUrl = new URL(calls[1].url);
    assert.equal(stockUrl.searchParams.get("codArticol"), "0001");
    assert.equal(stockUrl.searchParams.get("gestiune"), "0002");
    assert.equal(stockUrl.searchParams.get("data"), "06.11.2026");
    for (const role of ["admin", "dispecer", "tehnician", "client", ""]) {
      const headers: Record<string, string> = role
        ? { Authorization: `Bearer ${tokens[role]}` }
        : {};
      const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/sagaConnections/123456`;
      assert.equal((await fetch(url, { headers })).status, 403);
      assert.equal(
        (
          await fetch(url, {
            method: "PATCH",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: { state: { stringValue: "ready" } },
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
    // Rotated keys must be saved even on upstream HTTP/auth errors.
    transport = async () =>
      new Response("secret echoed in an error", {
        status: 401,
        headers: { "X-Saga-Refresh-Token": "fixture-error-renewed-token" },
      });
    response = await call("read", "admin", { kind: "article", code: "0001" });
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("secret echoed"));
    stored = (await connectionRef.get()).data()!;
    assert.equal(
      decryptToken(stored.tokenEnc, config.encryptionKey, "123456"),
      "fixture-error-renewed-token",
    );
    assert.equal(stored.state, "authorization_error");
    assert.equal(
      (await call("read", "admin", { kind: "article", code: "0001" })).status,
      409,
    );
    await connectionRef.delete();
    // Two service instances share the same company lease; second never reaches SAGA.
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((r) => (entered = r)),
      blocked = new Promise<void>((r) => (release = r));
    transport = async () => {
      entered();
      await blocked;
      return new Response(articleXML);
    };
    const first = service.read(actor, { kind: "article", code: "0001" });
    await started;
    const secondService = createSagaService(db, {
      config: () => config,
      fetch: (async () => {
        throw Error("Must not call");
      }) as typeof fetch,
    });
    await assert.rejects(
      secondService.read(actor, { kind: "article", code: "0001" }),
      (e) => (e as SagaError).code === "BUSY",
    );
    release();
    await first;
    // Crashed operation with expired lease stays blocked, instead of using stale token.
    await connectionRef.update({
      state: "processing",
      owner: "orphan",
      leaseUntil: 0,
    });
    assert.equal((await service.status(actor)).state, "needs_review");
    await assert.rejects(
      service.read(actor, { kind: "article", code: "0001" }),
      (e) => (e as SagaError).code === "NEEDS_REVIEW",
    );
    assert.equal((await connectionRef.get()).data()!.state, "needs_review");
    await connectionRef.delete();
    // Persistence loss immediately after receiving a rotated key must fail closed.
    let failWrites = false;
    const unreliableDb = new Proxy(db, {
      get(target, property) {
        if (property === "runTransaction")
          return (...args: any[]) =>
            failWrites
              ? Promise.reject(Error("disk unavailable"))
              : (target.runTransaction as any)(...args);
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const unreliable = createSagaService(unreliableDb, {
      config: () => config,
      fetch: (async () => {
        failWrites = true;
        return new Response(articleXML, {
          headers: { "X-Saga-Refresh-Token": "lost-renewed-token" },
        });
      }) as typeof fetch,
    });
    await assert.rejects(
      unreliable.read(actor, { kind: "article", code: "0001" }),
      (e) => (e as SagaError).code === "TOKEN_SAVE_FAILED",
    );
    failWrites = false;
    assert.equal((await connectionRef.get()).data()!.state, "processing");
    await connectionRef.update({ leaseUntil: 0 });
    assert.equal((await unreliable.status(actor)).state, "needs_review");
    await connectionRef.delete();
    const timed = createSagaService(db, {
      config: () => config,
      timeoutMs: 30,
      fetch: ((_, init) =>
        new Promise((_, reject) =>
          init!.signal!.addEventListener("abort", () =>
            reject(new Error("timeout")),
          ),
        )) as typeof fetch,
    });
    await assert.rejects(
      timed.read(actor, { kind: "article", code: "0001" }),
      (e) => (e as SagaError).code === "TIMEOUT",
    );
    assert.equal((await connectionRef.get()).data()!.state, "needs_review");
    await connectionRef.delete();
    transport = async () =>
      new Response('{"success":false,"data":"0"}', {
        headers: { "X-Saga-Refresh-Token": "fixture-json-error-token" },
      });
    assert.equal(
      (await call("read", "admin", { kind: "stock", code: "0001" })).status,
      502,
    );
    assert.equal(
      decryptToken(
        (await connectionRef.get()).data()!.tokenEnc,
        config.encryptionKey,
        "123456",
      ),
      "fixture-json-error-token",
    );
    assert.equal((await db.collection("lucrari").get()).size, 0);
    assert.equal((await db.collection("invoiceDrafts").get()).size, 0);
    console.log(
      "PASS: real Auth/Firestore + HTTP: role/cookie/disabled denial, no calls/writes on status, official query parameters, encrypted rotation on success and errors, direct SDK denial, concurrent instances, interrupted lease, persistence failure, timeout, no invoices/tickets changed.",
    );

    // Real component -> HTTP handlers -> real Auth/Firestore emulator. Only SAGA transport is simulated.
    await connectionRef.delete();
    let browserReads = 0;
    transport = async (url, init) => {
      browserReads++;
      calls.push({
        url: url.href,
        token: new Headers(init.headers).get("Authorization")!,
      });
      if (url.searchParams.get("codArticol") === "bad")
        return new Response('{"success":false,"data":"0"}');
      return new Response(
        url.pathname.endsWith("GetArticol")
          ? articleXML
          : '{"success":true,"data":"0"}',
        { headers: { "X-Saga-Refresh-Token": "fixture-browser-token" } },
      );
    };
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{SagaTab}from'./components/settings/saga-tab';createRoot(document.getElementById('root')).render(<main style={{padding:16}}><SagaTab/></main>);`,
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
              contents: `export const useAuth=()=>({user:{uid:'admin',getIdToken:async()=>window.testToken},userData:{role:'admin'}})`,
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
          path.join(
            root,
            "components/settings/{saga*,invoice-numbering-settings}.tsx",
          ),
          path.join(root, "components/ui/{card,input,button}.tsx"),
        ],
      }),
    ]).process(await readFile(path.join(root, "app/globals.css"), "utf8"), {
      from: path.join(root, "app/globals.css"),
    });
    server = createServer(async (req, res) => {
      try {
        if (req.url?.startsWith("/api/integrations/saga/")) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const request = new Request("http://localhost" + req.url, {
            method: req.method,
            headers: req.headers as Record<string, string>,
            body:
              req.method === "POST"
                ? Buffer.concat(chunks).toString()
                : undefined,
          });
          const response = req.url.endsWith("/commercial-policy")
            ? Response.json({
                enabled: false,
                revision: 0,
                writesEnabled: false,
              })
            : req.url.endsWith("/numbering/users")
              ? Response.json({
                  entries: [],
                  nextCursor: null,
                  mode: "legacy",
                  revision: 0,
                  writesEnabled: false,
                })
              : req.url.includes("/references/")
                ? Response.json(
                    req.url.includes("/imports")
                      ? { job: null }
                      : {
                          fiscalCode: "123456",
                          writesEnabled: false,
                          entries: [],
                          nextCursor: null,
                        },
                  )
                : req.url.endsWith("/issuers/users")
                  ? Response.json({ users: [], nextCursor: null })
                  : req.url.endsWith("/issuer")
                    ? Response.json({
                        fiscalCode: "123456",
                        profile: null,
                        writesEnabled: false,
                      })
                    : req.url.endsWith("/numbering")
                      ? await numbering.get(request)
                      : req.url.endsWith("/clients/imports")
                        ? Response.json({ job: null })
                        : req.url.endsWith("/catalog")
                          ? await catalogs.list(request)
                          : await handlers[
                              req.url.endsWith("/read") ? "read" : "status"
                            ](request);
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
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.testToken=${JSON.stringify(tokens.admin)};</script><script src="/app.js"></script>`,
        );
      } catch {
        res.statusCode = 500;
        res.end("Fixture failure");
      }
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1000 },
    });
    page.setDefaultTimeout(10000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const uiUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    await page.goto(uiUrl);
    await expect(page.getByRole("status")).toContainText("Pregătită");
    assert.equal(browserReads, 0);
    assert.equal((await connectionRef.get()).exists, false);
    await page
      .getByRole("button", { name: "Actualizează starea", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Pregătită");
    assert.equal(browserReads, 0);
    await page.getByText("Administrare avansată", { exact: true }).click();
    await page.getByLabel("Cod articol SAGA", { exact: true }).fill("0001");
    await page
      .getByRole("button", { name: "Consultă articolul", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Rezultat SAGA" }),
    ).toContainText("Motor poartă");
    await expect(page.getByRole("status")).toHaveText("Conexiune verificată");
    await page.getByLabel("Ce consulți", { exact: true }).selectOption("stock");
    await expect(
      page.getByText("Fără gestiune selectată", { exact: false }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Consultă stocul", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Rezultat SAGA" }),
    ).toContainText("Stoc: 0");
    await page.getByLabel("Cod gestiune", { exact: true }).fill("0002");
    await page.getByLabel("Data stocului", { exact: true }).fill("2026-11-06");
    await page
      .getByRole("button", { name: "Consultă stocul", exact: true })
      .click();
    await expect(
      page.getByRole("region", { name: "Rezultat SAGA" }),
    ).toContainText("Gestiune: 0002");
    assert.ok(calls.at(-1)!.url.includes("gestiune=0002"));
    const artifacts = path.join(root, "test-results/saga");
    await (
      await import("node:fs/promises")
    ).mkdir(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "desktop.png") });
    await page.getByLabel("Cod articol SAGA", { exact: true }).fill("bad");
    await page
      .getByRole("button", { name: "Consultă stocul", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("nu a confirmat");
    await expect(
      page.getByRole("region", { name: "Rezultat SAGA" }),
    ).toHaveCount(0);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await expect(
        page.getByRole("button", { name: "Consultă stocul", exact: true }),
      ).toBeVisible();
    }
    await page.screenshot({ path: path.join(artifacts, "mobile.png") });
    assert.equal(
      await page.evaluate(() =>
        document.body.textContent!.includes("fixture-browser-token"),
      ),
      false,
    );
    await page.reload();
    await expect(page.getByRole("status")).toContainText("Pregătită");
    const beforeStatus = browserReads;
    await page
      .getByRole("button", { name: "Actualizează starea", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Pregătită");
    assert.equal(browserReads, beforeStatus);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real component/browser -> real HTTP/Auth/Firestore, manual-only calls, article, zero stock, warehouse/date, no zero on error, leading zeros, 320/390px, no secret in DOM. No live SAGA call.",
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
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
