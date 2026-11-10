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
import { createSagaClientsService } from "../lib/saga/clients.server";
import { invoiceXml } from "../lib/invoicing/xml";
import { createInvoiceXmlService } from "../lib/invoicing/xml.server";
import { createInvoiceFinalizationService } from "../lib/invoicing/finalization.server";
import { invoiceFinalizationHandlers } from "../lib/invoicing/finalization-http";
import { createInvoiceSagaService } from "../lib/invoicing/saga-transfer.server";
import { invoiceSagaHandlers } from "../lib/invoicing/saga-transfer-http";
import { importPolicy } from "../lib/saga/import";
import { createIssuerSetupService } from "../lib/invoicing/issuer-setup.server";
import { issuerSetupHandlers } from "../lib/invoicing/issuer-setup-http";
import { createSagaReferencesService } from "../lib/saga/references.server";
import { sagaCatalogHandlers } from "../lib/saga/catalog-http";
import { invoiceXmlHandlers } from "../lib/invoicing/xml-http";
import { issuerFixture, contentFixture } from "../lib/invoicing/xml.fixtures";
import { isUninvoicedWork } from "../lib/reports/uninvoiced";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  projectId = "demo-fom-issuer-setup",
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
        `\"${path.join(root, "node_modules/.bin/tsx")}\" --tsconfig \"${path.join(root, "tsconfig.json")}\" \"${path.join(root, "scripts/test-issuer-setup.ts")}\"`,
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
    const transferDeps = {
      config: () => config,
      policy: () => importPolicy({}),
      gateway: {
        readForInvoice: async () => {
          throw new Error("NO SAGA IN DRY RUN");
        },
        importForInvoice: async () => {
          throw new Error("NO SAGA IN DRY RUN");
        },
      },
    };
    const finalization = createInvoiceFinalizationService(db, transferDeps);
    const finalHttp = invoiceFinalizationHandlers(finalization, authenticate);
    const transferService = createInvoiceSagaService(db, transferDeps);
    const transferHttp = invoiceSagaHandlers(transferService, authenticate);
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
    const setup = createIssuerSetupService(db, () => config),
      setupHttp = issuerSetupHandlers(setup, authenticate);
    const references = createSagaReferencesService(
      db,
      async () => {
        throw Error("NO SAGA");
      },
      () => config,
    );
    const catalogHttp = sagaCatalogHandlers(catalog, authenticate);
    const eurHttp = eurFixtureHandlers(db, authenticate);
    const calls: string[] = [];
    async function dispatch(r: Request) {
      const p = new URL(r.url).pathname,
        id = p.split("/")[3];
      calls.push(`${r.method} ${p}`);
      if (p === "/api/users/mail-credentials")
        return Response.json(
          r.method === "GET" ? { credentials: null } : { saved: true },
        );
      const match = p.match(
        /^\/api\/integrations\/saga\/issuers\/([^/]+)\/setup(\/preview)?$/,
      );
      if (match)
        return match[2]
          ? setupHttp.preview(r, match[1])
          : r.method === "POST"
            ? setupHttp.save(r, match[1])
            : setupHttp.get(r, match[1]);
      if (p === "/api/integrations/saga/references/agents")
        return Response.json(
          await references.list(
            await authenticate(r),
            "agents",
            Object.fromEntries(new URL(r.url).searchParams),
          ),
        );
      if (p === "/api/integrations/saga/issuer")
        return r.method === "PUT"
          ? handlers.saveProfile(r)
          : handlers.profile(r);
      if (p === "/api/integrations/saga/status")
        return Response.json({
          configured: true,
          fiscalCode: "123456",
          state: "ready",
          lastReadAt: null,
          missing: [],
        });
      if (p === "/api/integrations/saga/commercial-policy")
        return Response.json({ enabled: false, revision: 0, canAdmin: false });
      if (p === "/api/integrations/saga/catalog/warehouses")
        return catalogHttp.save(r, "warehouses");
      if (p === "/api/integrations/saga/catalog") return catalogHttp.list(r);
      if (p.endsWith("/invoice-finalization/preview"))
        return finalHttp.preview(r, id);
      if (p.endsWith("/invoice-finalization")) return finalHttp.confirm(r, id);
      if (p.endsWith("/invoice-xml")) return handlers.document(r, id);
      if (p.endsWith("/invoice-saga")) return transferHttp.get(r, id);
      if (p.endsWith("/eur-rate")) return eurHttp.get(r, id);
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
      if (p.endsWith("/invoice-draft"))
        return drafts[r.method === "PUT" ? "PUT" : "GET"](r, {
          params: Promise.resolve({ id }),
        });
      return Response.json(
        { error: "Fixture route unavailable" },
        { status: 404 },
      );
    }
    const request = (p: string, role = "admin", body?: unknown) =>
      dispatch(
        new Request("http://localhost" + p, {
          method: body ? "POST" : "GET",
          headers: role ? { Authorization: `Bearer ${tokens[role]}` } : {},
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
    for (const uid of [
      "setup-a",
      "setup-b",
      "setup-race",
      "setup-race2",
      "setup-conflict",
      "setup-import",
      "setup-rollback",
      "setup-case",
    ])
      await db.doc(`users/${uid}`).set({ role: "admin", displayName: uid });
    const make = (prefix: string, code = "0002") => ({
      expectedRevision: 0,
      prefix,
      lastVerifiedNumber: "0001",
      agent: { code, name: "Agent " + code, confirmed: true },
      exclusiveConfirmed: true,
      lastNumberConfirmed: true,
    });
    for (const role of ["", "dispecer", "tehnician", "client"]) {
      const r = await request(
        "/api/integrations/saga/issuers/setup-a/setup",
        role,
      );
      assert.equal(r.status, role ? 403 : 401);
    }
    const ai = make("NRGV F26"),
      ap = await setup.preview(actor, "setup-a", ai);
    assert.equal(ap.nextNumber, "NRGV F260002");
    assert.equal(ap.firstActivation, true);
    assert.equal((await db.collection("invoiceCounters").get()).size, 0);
    const saved = await setup.save(actor, "setup-a", {
      ...ai,
      confirmationHash: ap.confirmationHash,
    });
    assert.ok(saved.profile.numbering);
    assert.equal(
      (await setup.get(actor, "setup-a")).counter!.allocationCount,
      0,
    );
    assert.equal(
      (
        await rootCatalog
          .collection("referenceItems")
          .doc(saved.profile.agentId)
          .get()
      ).data()!.source,
      "Confirmat de admin",
    );
    const bi = make("NRGA F26", "0003"),
      bp = await setup.preview(actor, "setup-b", bi);
    await setup.save(actor, "setup-b", {
      ...bi,
      confirmationHash: bp.confirmationHash,
    });
    const race = make("RACE", "0008"),
      r1 = await setup.preview(actor, "setup-race", race),
      r2 = await setup.preview(actor, "setup-race2", race);
    const raced = await Promise.allSettled([
      setup.save(actor, "setup-race", {
        ...race,
        confirmationHash: r1.confirmationHash,
      }),
      setup.save(actor, "setup-race2", {
        ...race,
        confirmationHash: r2.confirmationHash,
      }),
    ]);
    assert.equal(raced.filter((r) => r.status === "fulfilled").length, 1);
    const stale = make("STALE", "0002"),
      sp = await setup.preview(actor, "setup-conflict", stale);
    await db.doc("users/setup-conflict").update({ displayName: "Changed" });
    await assert.rejects(
      setup.save(actor, "setup-conflict", {
        ...stale,
        confirmationHash: sp.confirmationHash,
      }),
      (e: any) => e.status === 409,
    );
    assert.equal(
      (
        await rootCatalog
          .collection("issuerProfiles")
          .doc("setup-conflict")
          .get()
      ).exists,
      false,
    );
    await assert.rejects(
      setup.preview(actor, "tehnician", make("TECH")),
      (e: any) => e.status === 400,
    );
    await assert.rejects(
      setup.preview(actor, "setup-import", {
        ...make("IMP"),
        agent: { code: "0002", name: "Alt agent", confirmed: true },
      }),
      (e: any) => e.status === 409,
    );
    await rootCatalog
      .collection("referenceControl")
      .doc("import")
      .set({ active: "test" });
    await assert.rejects(
      setup.preview(actor, "setup-import", make("IMP")),
      (e: any) => e.status === 409,
    );
    await rootCatalog.collection("referenceControl").doc("import").delete();
    const off = createIssuerSetupService(db, () => ({
      ...config,
      readsEnabled: false,
    }));
    await assert.rejects(
      off.save(actor, "setup-import", make("IMP")),
      (e: any) => e.status === 409,
    );
    const other = createIssuerSetupService(db, () => ({
      ...config,
      fiscalCode: "654321",
    }));
    assert.equal((await other.get(actor, "setup-a")).profile, null);
    // Every staged write rolls back if counter creation fails, including the new manual agent.
    const ri = make("ROLLBACK", "0099"),
      rp = await setup.preview(actor, "setup-rollback", ri);
    const failingDb = new Proxy(db, {
      get(target, key) {
        if (key === "runTransaction")
          return (fn: any) =>
            target.runTransaction(async (tx) => {
              const create = tx.create.bind(tx);
              tx.create = ((ref: any, data: any) => {
                if (ref.parent.id === "invoiceCounters")
                  throw Error("Injected setup rollback");
                return create(ref, data);
              }) as typeof tx.create;
              return fn(tx);
            });
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await assert.rejects(
      createIssuerSetupService(failingDb, () => config).save(
        actor,
        "setup-rollback",
        { ...ri, confirmationHash: rp.confirmationHash },
      ),
      /Injected setup rollback/,
    );
    assert.equal(
      (
        await rootCatalog
          .collection("issuerProfiles")
          .doc("setup-rollback")
          .get()
      ).exists,
      false,
    );
    assert.equal(
      (
        await rootCatalog
          .collection("referenceItems")
          .where("code", "==", "0099")
          .get()
      ).size,
      0,
    );
    // An old, not-yet-active profile can normalize spelling without deleting its own series claim.
    await references.saveProfile(actor, "setup-case", {
      expectedRevision: 0,
      prefix: "CASE",
      lastVerifiedNumber: "0001",
      agentId: saved.profile.agentId,
      agentRevision: 1,
      exclusiveConfirmed: true,
      lastNumberConfirmed: true,
    });
    const ci = { ...make("case"), expectedRevision: 1 },
      csp = await setup.preview(actor, "setup-case", ci);
    await setup.save(actor, "setup-case", {
      ...ci,
      confirmationHash: csp.confirmationHash,
    });
    assert.ok(
      (
        await rootCatalog
          .collection("issuerSeries")
          .where("uid", "==", "setup-case")
          .get()
      ).size === 1,
    );
    for (const path of [
      `sagaCatalogs/123456/issuerProfiles/setup-a`,
      `invoiceCounters/${saved.profile.numbering!.counterId}`,
    ])
      for (const token of ["", tokens.admin])
        for (const verb of ["GET", "PATCH"]) {
          const response = await fetch(
            `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`,
            {
              method: verb,
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                "Content-Type": "application/json",
              },
              body: verb === "PATCH" ? "{}" : undefined,
            },
          );
          assert.equal(response.status, 403);
        }
    // Forward-only correction still uses the existing audited service. Active setup never resets it.
    const users = numbering.users,
      list = await users.list(actor),
      aEntry = list.entries.find((e: any) => e.user.uid === "setup-a")!;
    const cp = await users.preview(actor, {
      expectedRevision: list.revision,
      profiles: [],
      correction: {
        uid: "setup-a",
        lastVerifiedNumber: "0010",
        reason: "fixture",
      },
    });
    await users.activate(actor, {
      ...cp.input,
      confirmationHash: cp.confirmationHash,
    });
    const again = await setup.preview(actor, "setup-a", {
      ...ai,
      expectedRevision: saved.profile.revision,
    });
    await setup.save(actor, "setup-a", {
      ...ai,
      expectedRevision: saved.profile.revision,
      confirmationHash: again.confirmationHash,
    });
    assert.equal((await setup.get(actor, "setup-a")).counter!.lastNumber, "10");
    await assert.rejects(
      setup.preview(actor, "setup-a", {
        ...ai,
        expectedRevision: saved.profile.revision + 1,
        prefix: "OTHER",
      }),
      (e: any) => e.status === 409,
    );
    // Setup creates no document, reservation, draft or SAGA connection.
    for (const col of [
      "invoices",
      "invoiceArtifacts",
      "invoiceNumberReservations",
      "invoiceDrafts",
      "sagaConnections",
    ])
      assert.equal((await db.collection(col).get()).size, 0);
    await seed("browser");
    const workBefore = (await db.doc("lucrari/browser").get()).data();
    console.log(
      "PASS issuer setup API/emulator: one atomic setup without imports, text codes, independent counters, exclusivity/concurrency, stale previews, active seed protection/forward correction, roles/company/write gate, no invoice allocation or SAGA traffic.",
    );
    const bundle = await build({
      stdin: {
        resolveDir: root,
        loader: "tsx",
        contents: `import React,{useRef,useState} from'react';import{createRoot}from'react-dom/client';import{UserEditForm}from'./components/user-edit-form';import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';import{InvoiceWarehouseSetup}from'./components/invoicing/invoice-warehouse-setup';import{SagaTab}from'./components/settings/saga-tab';function Fixture(){const edit=useRef(null),[dirty,setDirty]=useState(false),[saved,setSaved]=useState(false),[notice,setNotice]=useState('');return <main style={{padding:16,minHeight:1500}}>{location.pathname==='/ticket'?<InvoiceDraftSection workId="browser" work={window.testWork}/>:location.pathname==='/settings'?<SagaTab/>:location.pathname==='/warehouse'?<><InvoiceWarehouseSetup readOnly={false} onSaved={()=>setSaved(true)}/>{saved&&<p>Gestiune salvată</p>}</>:<><h1>Editează utilizatorul</h1><UserEditForm ref={edit} user={{uid:'admin',role:'admin',displayName:'Admin cont',email:'admin@invoice.test'}} onSavedInPlace={()=>setNotice('Date cont salvate fără închidere')} onSuccess={()=>setNotice('Închis')}/><button onClick={()=>setDirty(edit.current.hasUnsavedChanges())}>Verifică editările</button><p>Modificări facturare: {dirty?'da':'nu'}</p><p>{notice}</p></>}</main>}createRoot(document.getElementById('root')).render(<Fixture/>);`,
      },
      bundle: true,
      write: false,
      jsx: "automatic",
      format: "iife",
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [
        {
          name: "auth",
          setup(b) {
            const fixtures: Record<string, string> = {
              auth: `export const useAuth=()=>({user:{uid:'admin',getIdToken:async()=>window.testToken},userData:{uid:'admin',role:'admin'}})`,
              db: `export const db={};`,
              firestore: `export const doc=(...args)=>({args});export const collection=(...args)=>({args});export const getDocs=async()=>({forEach(){},docs:[]});export const getDoc=async()=>({exists:()=>false,data:()=>({})});export const deleteField=()=>null;export const updateDoc=async(_ref,values)=>{window.accountUpdate=values;};`,
              navigation: `export const useRouter=()=>({refresh(){},push(){}});`,
              accountAuth: `export const updateUserEmail=async()=>{};`,
              groups: `export const subscribeTechnicianGroups=(fn)=>{fn([]);return()=>{}};`,
              fields: `export const DynamicDialogFields=()=>null;`,
              password: `export const PasswordResetDialog=()=>null;`,
            };
            for (const [filter, key] of [
              [/^@\/contexts\/AuthContext$/, "auth"],
              [/^@\/lib\/firebase\/config$/, "db"],
              [/^firebase\/firestore$/, "firestore"],
              [/^next\/navigation$/, "navigation"],
              [/^@\/lib\/firebase\/auth$/, "accountAuth"],
              [/^@\/lib\/firebase\/technician-groups$/, "groups"],
              [/^@\/components\/DynamicDialogFields$/, "fields"],
              [/^\.\/password-reset-dialog$/, "password"],
            ] as const)
              b.onResolve({ filter }, () => ({
                path: key,
                namespace: "fixture",
              }));
            b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
              contents: fixtures[args.path],
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
          path.join(root, "components/settings/**/*.tsx"),
          path.join(root, "components/ui/*.tsx"),
          path.join(root, "components/user-edit-form.tsx"),
        ],
      }),
    ]).process(await readFile(path.join(root, "app/globals.css"), "utf8"), {
      from: path.join(root, "app/globals.css"),
    });
    server = createServer(async (req, res) => {
      try {
        if (req.url?.startsWith("/api/")) {
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const r = await dispatch(
            new Request("http://localhost" + req.url, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: ["POST", "PUT"].includes(req.method!)
                ? Buffer.concat(chunks).toString()
                : undefined,
            }),
          );
          res.writeHead(r.status, Object.fromEntries(r.headers));
          res.end(await r.text());
          return;
        }
        if (req.url === "/app.js") {
          res.setHeader("Content-Type", "text/javascript");
          res.end(bundle.outputFiles[0].text);
          return;
        }
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style><div id="root"></div><script>window.testToken=${JSON.stringify(tokens.admin)};window.testWork=${JSON.stringify(work)}</script><script src="/app.js"></script>`,
        );
      } catch (e) {
        res.statusCode = 500;
        res.end("fixture failure");
        console.log(e);
      }
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const url = `http://127.0.0.1:${(server.address() as any).port}`;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    page.setDefaultTimeout(12000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (r) =>
      ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    await page.goto(url + "/profile");
    const panel = page.getByRole("region", { name: "Facturare SAGA" });
    await page
      .getByLabel("Nume complet", { exact: true })
      .fill("Notă nesalvată");
    await page
      .getByRole("tab", { name: "Facturare SAGA", exact: true })
      .click();
    await panel.getByLabel("Serie utilizator", { exact: true }).fill("NRG F26");
    await panel
      .getByLabel("Ultimul număr utilizator", { exact: true })
      .fill("0001");
    await panel
      .getByLabel("Introduc agentul după codul din SAGA", { exact: true })
      .check();
    await panel.getByLabel("Cod agent SAGA", { exact: true }).fill("0004");
    await panel
      .getByLabel("Denumire agent SAGA", { exact: true })
      .fill("Admin SAGA");
    await expect(panel).toContainText("NRG F260002");
    await page
      .getByRole("button", { name: "Verifică editările", exact: true })
      .click();
    await expect(
      page.getByText("Modificări facturare: da", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("tab", { name: "Date utilizator", exact: true })
      .click();
    await expect(page.getByLabel("Nume complet", { exact: true })).toHaveValue(
      "Notă nesalvată",
    );
    await page
      .getByRole("button", { name: "Salvează modificările", exact: true })
      .click();
    await expect(
      page.getByText("Date cont salvate fără închidere", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: /Facturare SAGA/ }).click();
    await panel
      .getByLabel("Confirm că am verificat codul", { exact: false })
      .check();
    await panel
      .getByLabel("Confirm ultimul număr verificat", { exact: false })
      .check();
    await panel
      .getByRole("button", {
        name: "Salvează configurarea facturării",
        exact: true,
      })
      .click();
    await expect(panel.getByRole("status")).toContainText("nerezervat");
    await expect(page.getByLabel("Nume complet", { exact: true })).toHaveValue(
      "Notă nesalvată",
    );
    await page
      .getByRole("button", { name: "Verifică editările", exact: true })
      .click();
    await expect(
      page.getByText("Modificări facturare: nu", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByLabel("Serie utilizator", { exact: true }),
    ).toBeDisabled();
    assert.equal((await setup.get(actor, "admin")).counter!.allocationCount, 0);
    await page.goto(url + "/warehouse");
    await page.getByLabel("Cod gestiune nouă").fill("0010");
    await page.getByLabel("Denumire gestiune nouă").fill("Depozit nou");
    await page
      .getByLabel("Confirm codul și denumirea gestiunii", { exact: false })
      .check();
    await page
      .getByRole("button", { name: "Salvează gestiunea în FOM" })
      .click();
    await expect(
      page.getByText("Gestiune salvată", { exact: true }),
    ).toBeVisible();
    assert.deepEqual(
      (await rootCatalog.collection("products").doc("p").get()).data(),
      product,
    );
    await page.goto(url + "/ticket");
    await page
      .getByRole("button", { name: /Continuă ciorna|Vezi ciorna/ })
      .click();
    const issuer = page.getByRole("region", { name: "Firma emitentă" });
    await expect(issuer).toBeVisible();
    for (const [label, value] of Object.entries({
      "Denumire firmă emitentă": "Emitent & Fii",
      "CIF firmă emitentă": "RO123456",
      "Registrul comerțului emitent": "J00/1/2020",
      "Țara emitentului": "RO",
      "Județ emitent (cod, ex. IF)": "IF",
      "Localitate emitent": "Otopeni",
      "Adresă fiscală emitent": "Strada test 1",
    }))
      await issuer.getByLabel(label, { exact: true }).fill(value);
    await issuer.getByLabel("Confirm datele fiscale", { exact: false }).check();
    await issuer
      .getByRole("button", { name: "Salvează firma emitentă", exact: true })
      .click();
    await expect(issuer).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Simulează emiterea și trimiterea",
        exact: true,
      })
      .click();
    const summary = page.getByRole("group", {
      name: "Confirmare emitere și trimitere",
    });
    await expect(summary).toContainText("NRG F260002");
    await page
      .getByRole("button", {
        name: "Confirmă simularea emiterii și trimiterii",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("region", { name: "Emiterea facturii" }),
    ).toContainText("NRG F260002");
    await expect(
      page.getByRole("region", { name: "Emiterea facturii" }),
    ).toContainText("Document pregătit în FOM");
    assert.equal((await setup.get(actor, "admin")).counter!.lastNumber, "2");
    assert.equal((await setup.get(actor, "admin")).counter!.allocationCount, 1);
    assert.deepEqual(
      (await db.doc("lucrari/browser").get()).data(),
      workBefore,
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    await page.goto(url + "/settings");
    await expect(
      page.getByText("Administrare avansată", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Catalog asocieri SAGA" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Profiluri de emitere" }),
    ).toHaveCount(0);
    const n = calls.length;
    await page.waitForTimeout(400);
    assert.equal(
      calls
        .slice(n)
        .some((v) => v.includes("/references/") || v.includes("/catalog")),
      false,
    );
    await page.goto(url + "/profile");
    await page
      .getByRole("tab", { name: "Facturare SAGA", exact: true })
      .click();
    await expect(
      panel.getByLabel("Serie utilizator", { exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: "/tmp/fom-invoice-user-setup-mobile.png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    assert.equal((await db.collection("sagaConnections").get()).size, 0);
    console.log(
      "PASS setup browser: one-save automatic preview/manual agent, unsaved general field retained and dirty signal, locked active series, inline warehouse/issuer, no product permission expansion, full invoice from user profile without settings, narrow layouts, advanced panels not mounted. No external HTTP or SAGA.",
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
