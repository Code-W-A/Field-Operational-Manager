/** Real React/browser components; all API responses are isolated fixtures.
 * No credentials, Firebase writes or upstream SAGA/BNR traffic. */
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect, type Route } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  prepareInvoiceDraft,
  calculateInvoiceTotals,
} from "../lib/invoicing/draft";
import { preparedFixture } from "../lib/invoicing/saga-transfer.fixtures";
import type { SagaTransfer } from "../lib/invoicing/saga-transfer";

async function main() {
  const root = process.cwd();
  const prepared = preparedFixture("ux", "1");
  const draft = {
    ...prepareInvoiceDraft(
      "ux",
      { preluatDispecer: true, nrLucrare: "UX-TEST", clientId: "c" },
      { id: "c", nume: "Client test", cui: "RO123", adresa: "Adresă" },
      21,
      [],
      new Date("2026-11-12T12:00:00Z"),
    ),
    ...prepared.snapshot.content,
    revision: 1,
  };
  Object.assign(draft, {
    commercial: {
      version: 2,
      policyRevision: 1,
      dueMode: "manual",
      termKey: "",
      termDays: null,
    },
    discountPercent: "0",
  });
  draft.lines.forEach((line) => {
    line.vatPercent = "21";
  });
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';
      import{InvoiceDraftSection}from'./components/invoicing/invoice-draft-section';
      import{InvoiceFinalizationPanel}from'./components/invoicing/invoice-finalization-panel';
      import{InvoiceSagaPanel}from'./components/invoicing/invoice-saga-panel';
      import{useInvoiceActivity}from'./components/invoicing/invoice-feedback';
      function App(){const{busy,setActivity}=useInvoiceActivity();const mode=location.pathname;
      return <main className="p-4"><input aria-label="Editare locală" defaultValue="Păstrează"/>
      <button onClick={()=>window.backgroundClicks++}>Consultă tichetul</button>
      {mode==='/editor'?<InvoiceDraftSection workId="ux" work={{preluatDispecer:true,nrLucrare:'UX-TEST',clientId:'c'}}/>:
      mode==='/transfer'?<InvoiceSagaPanel workId="ux" sha256="hash" onBusy={v=>{window.wasBusy=v}}/>:
      mode==='/activity'?<><output aria-label="Ocupat">{String(busy)}</output>{['a','b'].map(key=><button key={key} onClick={async()=>{setActivity(key,true);try{await fetch('/api/fixture/'+key)}finally{setActivity(key,false)}}}>Începe {key}</button>)}</>:
      <InvoiceFinalizationPanel workId="ux" draft={window.fixture} dirty={true} readOnly={false}
        onSaveBeforePreview={async()=>{await fetch('/api/fixture/save');return window.fixture}}
        onPrepared={async()=>{}} onFrozen={()=>{}} onBusy={v=>{window.wasBusy=v}}/>}</main>}
      window.backgroundClicks=0;window.wasBusy=false;createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: root,
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    tsconfig: path.resolve("tsconfig.json"),
    plugins: [
      {
        name: "mock-auth",
        setup(b) {
          b.onResolve({ filter: /contexts\/AuthContext$/ }, () => ({
            path: "auth",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `const user={uid:'admin',getIdToken:async()=> 'fixture'};export function useAuth(){return {user,userData:{role:'admin'}}}`,
            loader: "tsx",
          }));
        },
      },
    ],
  });
  const postcss = (await import("postcss")).default,
    tailwind = (await import("tailwindcss")).default;
  const config = (await import("../tailwind.config")).default;
  const css = await postcss([
    tailwind({
      ...config,
      content: [
        path.join(root, "components/invoicing/**/*.tsx"),
        path.join(root, "components/ui/{button,input}.tsx"),
      ],
    }),
  ]).process(await readFile("app/globals.css", "utf8"), {
    from: path.join(root, "app/globals.css"),
  });
  const server = createServer((req, res) => {
    if (req.url === "/app.js") {
      res.setHeader("Content-Type", "application/javascript");
      res.end(bundle.outputFiles[0].text);
    } else if (req.url === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(css.css);
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<link rel="stylesheet" href="/style.css"><div id="root"></div><script>window.fixture=${JSON.stringify(draft).replace(/</g, "\\u003c")}</script><script src="/app.js"></script>`,
      );
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors: string[] = [],
    external: string[] = [];
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  let doc: typeof prepared | null = null;
  let transfer: SagaTransfer | null = null,
    failure = false,
    stockFailure = false,
    revision = 1;
  let saves = 0,
    imports = 0,
    rechecks = 0,
    polls = 0;
  const blocked = new Map<
    string,
    { promise: Promise<void>; release: () => void }
  >();
  function hold(key: string) {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    blocked.set(key, { promise, release });
  }
  function release(key: string) {
    blocked.get(key)?.release();
    blocked.delete(key);
  }
  const routeKey = (url: string) => new URL(url).pathname;
  const base = "/api/lucrari/ux/";
  const state = () => ({
    mode: "production",
    canStart: true,
    reason: "",
    transfer,
  });
  const summary = () => ({
    previewId: "preview",
    mode: "dry-run",
    canConfirm: true,
    issues: [],
    groups: [],
    snapshot: prepared.snapshot,
    estimatedNumber: prepared.number,
    prepared: false,
  });
  const makeTransfer = (
    phase: SagaTransfer["phase"],
    importStatus: SagaTransfer["importStatus"],
    stockStatus: SagaTransfer["stockStatus"],
  ): SagaTransfer => ({
    schemaVersion: 1,
    id: "operation",
    workId: "ux",
    fiscalCode: "123456",
    sha256: prepared.sha256,
    number: prepared.number,
    mode: "production",
    operationId: "op",
    phase,
    importStatus,
    stockStatus,
    groups: [
      {
        code: "0001",
        warehouse: "01",
        unit: "BUC",
        expected: "1",
        before: { quantity: "2", checkedAt: "2026-11-12T18:00:00Z" },
        after: null,
        delta: null,
        matches: false,
      },
    ],
    cursor: 0,
    attempts: 0,
    maxAttempts: 3,
    intervalMs: 5000,
    nextAt: 0,
    leaseOwner: null,
    leaseUntil: 0,
    createdAt: "2026-11-12T18:00:00Z",
    updatedAt: "2026-11-12T18:00:05Z",
    createdBy: "admin",
    actorRole: "admin",
    revision: revision++,
    error: null,
    httpStatus: null,
    reportAvailable: true,
    reportChunks: 1,
    reportTruncated: false,
    reportSha256: null,
  });
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      external.push(url.origin);
      await route.abort();
      return;
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const key = routeKey(url.href);
    // Capture the response before awaiting a gate to exercise stale polling safely.
    let json: unknown = {},
      status = 200,
      text: string | undefined;
    if (key === base + "invoice-saga") {
      if (route.request().method() === "GET") {
        polls++;
        json = structuredClone(state());
        if (failure) {
          status = 503;
          json = { error: "Conexiune indisponibilă" };
        }
      } else {
        imports++;
        json = state();
      }
    } else if (key === base + "invoice-saga/recheck") {
      rechecks++;
      transfer = makeTransfer("after", "imported", "checking");
      json = state();
    } else if (key.endsWith("/report")) text = "Raport simulat";
    else if (key.endsWith("/invoice-xml/download")) text = "<Facturi />";
    else if (key === base + "invoice-xml") json = { document: doc };
    else if (key === base + "invoice-finalization/preview") json = summary();
    else if (key === base + "invoice-finalization") {
      imports++;
      doc = prepared;
      transfer = makeTransfer("baseline", "pending", "pending");
      transfer.mode = "dry-run";
      json = { document: doc, transfer };
    } else if (key === "/api/fixture/save") {
      saves++;
      json = { ok: true };
    } else if (key.startsWith("/api/fixture/")) json = { ok: true };
    else if (key === base + "invoice-draft") {
      if (route.request().method() === "PUT") {
        saves++;
        Object.assign(draft, route.request().postDataJSON().content);
        draft.revision++;
        draft.totals = calculateInvoiceTotals(draft);
      }
      json = {
        draft,
        saved: true,
        canEdit: true,
        reason: "",
        commercialPolicy: false,
      };
    } else if (key.endsWith("/commercial-context"))
      json = { agent: { code: "0001", name: "Agent test" } };
    else if (key.endsWith("/number"))
      json = { number: "NRG000126", reserved: false, reason: "" };
    else if (key.endsWith("/client-association"))
      json = {
        clientId: "c",
        clientName: "Client test",
        taxId: "RO123",
        issues: [],
        link: { active: true, country: "RO" },
        entry: { code: "0002", name: "Client test" },
      };
    else if (key.endsWith("/eur-rate"))
      json = {
        reference: {
          status: "available",
          id: "eur",
          requestedDate: draft.date,
          rateDate: draft.date,
          value: "5.1234",
          source: "BNR",
          fetchedAt: "2026-11-12T18:00:00Z",
        },
      };
    else if (key.endsWith("/commercial-policy"))
      json = { enabled: true, revision: 1 };
    else if (key === "/api/integrations/saga/issuer")
      json = {
        fiscalCode: "123456",
        profile: prepared.snapshot.issuer,
        writesEnabled: true,
      };
    else if (key.endsWith("/saga-selection"))
      json = {
        snapshotId: "list",
        stale: false,
        checkedAt: "2026-11-12T18:00:00Z",
        rows: [
          {
            code: "0001",
            name: "Produs SAGA",
            typeCode: "M",
            typeName: "Marfă",
            warehouseCode: "01",
            warehouseName: "Depozit",
            unit: "BUC",
            vat: "21",
            quantity: "2",
            available: "2",
            selectionProof: "proof",
          },
        ],
      };
    else if (key.endsWith("/saga-article/preview"))
      json = {
        previewId: "article",
        article: { name: "Produs SAGA", unit: "BUC", vat: "21", price: "10" },
        currencyConfirmed: true,
        issues: [],
        warehouses: [{ id: "g", code: "01" }],
      };
    else if (key.endsWith("/stock")) {
      json = { quantity: "2", checkedAt: "2026-11-12T18:00:00Z" };
      if (stockFailure) {
        status = 503;
        json = { error: "Stoc indisponibil" };
      }
    } else if (key.endsWith("/saga-article/apply"))
      json = {
        line: {
          ...draft.lines[0],
          name: "Produs SAGA",
          um: "BUC",
          price: "10",
          vatPercent: "21",
        },
      };
    else throw new Error("Unexpected fixture route " + key);
    await blocked.get(key)?.promise;
    try {
      await route.fulfill({
        status,
        ...(text !== undefined
          ? { body: text, contentType: "text/plain" }
          : { json }),
      });
    } catch (e) {
      if (!page.isClosed()) throw e;
    }
  });
  try {
    // Full floating editor: initial reads, preserved inputs, dependent selectors and save.
    hold(base + "invoice-draft");
    await page.goto(origin + "/editor");
    await expect(
      page.getByRole("button", { name: "Se verifică ciorna…" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Se verifică ciorna…" }).locator("svg"),
    ).toBeVisible();
    release(base + "invoice-draft");
    await expect(
      page.getByRole("button", { name: "Continuă ciorna" }),
    ).toBeEnabled();
    hold(base + "invoice-draft/number");
    hold(base + "invoice-draft/client-association");
    hold(base + "invoice-draft/eur-rate");
    await page.getByRole("button", { name: "Continuă ciorna" }).click();
    await expect(page.getByText("Se încarcă numărul facturii…")).toBeVisible();
    await expect(page.getByText("Se încarcă asocierea SAGA…")).toBeVisible();
    await expect(page.getByText("Se preia cursul BNR…").first()).toBeVisible();
    release(base + "invoice-draft/number");
    release(base + "invoice-draft/client-association");
    release(base + "invoice-draft/eur-rate");
    await expect(page.getByText("Număr factură ·")).toBeVisible();
    await page
      .getByLabel("Informații suplimentare factură", { exact: true })
      .fill("Notă locală păstrată");
    hold(base + "invoice-draft/saga-selection");
    await page.getByRole("button", { name: "Continuă la produse" }).click();
    await expect(page.getByLabel("Tip SAGA", { exact: true })).toBeDisabled();
    await expect(page.getByText("Se încarcă tipurile…")).toBeVisible();
    release(base + "invoice-draft/saga-selection");
    await expect(page.getByLabel("Tip SAGA", { exact: true })).toBeEnabled();
    await page.getByLabel("Tip SAGA", { exact: true }).selectOption("M");
    await page.getByLabel("Gestiune SAGA", { exact: true }).selectOption("01");
    await page
      .getByRole("combobox", { name: "invoice: Denumire 1" })
      .fill("Produs");
    hold(base + "invoice-draft/saga-article/preview");
    hold(base + "invoice-draft/stock");
    hold(base + "invoice-draft/saga-article/apply");
    await page.getByRole("button", { name: "Produs SAGA · 0001" }).click();
    await expect(page.getByText("Se preiau datele articolului…")).toBeVisible();
    release(base + "invoice-draft/saga-article/preview");
    await expect(page.getByText("Se verifică stocul curent…")).toBeVisible();
    release(base + "invoice-draft/stock");
    await expect(page.getByText("Se completează linia…")).toBeVisible();
    release(base + "invoice-draft/saga-article/apply");
    await expect(
      page.getByRole("button", { name: "Salvează ciorna", exact: true }),
    ).toBeEnabled();
    stockFailure = true;
    await page
      .getByRole("button", { name: "Actualizează stocul", exact: true })
      .click();
    await expect(
      page.getByText("Stoc indisponibil", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Stoc disponibil 2 BUC/)).toBeVisible();
    stockFailure = false;
    await page
      .getByRole("button", { name: "Actualizează stocul", exact: true })
      .click();
    await expect(
      page.getByText("Stoc indisponibil", { exact: true }),
    ).toHaveCount(0);
    hold(base + "invoice-draft");
    await page
      .getByRole("button", { name: "Salvează ciorna", exact: true })
      .dblclick({ delay: 10, force: true });
    await expect(
      page.getByRole("button", { name: "Se salvează…", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Consultă tichetul", exact: true })
      .click();
    assert.equal(await page.evaluate("window.backgroundClicks"), 1);
    await page
      .getByRole("button", { name: "Minimizează factura", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Continuă ciorna · nesalvată", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Se salvează…", exact: true }),
    ).toBeDisabled();
    release(base + "invoice-draft");
    await expect(
      page.getByText("Ciornă salvată.", { exact: true }),
    ).toBeVisible();
    assert.equal(saves, 1, "double click saved once");
    await page
      .getByRole("button", { name: "Înapoi la datele facturii" })
      .click();
    await expect(
      page.getByLabel("Informații suplimentare factură", { exact: true }),
    ).toHaveValue("Notă locală păstrată");
    console.log(
      "PASS editor: delayed opening, header/EUR, list/article/stock/apply, double-click save, background access, preserved edits.",
    );

    // Autosave, summary and single confirmation use distinct labels and retain original actions.
    hold("/api/fixture/save");
    hold(base + "invoice-finalization/preview");
    await page.goto(origin + "/finalization");
    await page
      .getByRole("button", { name: "Emite și trimite în SAGA", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Se salvează ciorna…" }),
    ).toBeDisabled();
    release("/api/fixture/save");
    await expect(
      page.getByRole("button", { name: "Se verifică factura…" }),
    ).toBeDisabled();
    release(base + "invoice-finalization/preview");
    const confirmation = page.getByRole("button", {
      name: "Confirmă simularea emiterii și trimiterii",
    });
    await expect(confirmation).toBeVisible();
    hold(base + "invoice-finalization");
    await confirmation.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Se confirmă emiterea…" }),
    ).toBeDisabled();
    release(base + "invoice-finalization");
    await expect(
      page.getByText(
        "Simulare — netransmis. Cantitățile și rezultatele de mai jos sunt simulate.",
      ),
    ).toBeVisible();
    assert.equal(imports, 1, "confirmation sent only once (mock API)");
    await page.getByText("Detaliile documentului", { exact: true }).click();
    hold(base + "invoice-xml/download");
    await page
      .getByRole("button", { name: "Descarcă XML", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Se pregătește descărcarea…",
        exact: true,
      }),
    ).toBeDisabled();
    assert.equal(
      await page.evaluate("window.wasBusy"),
      false,
      "download does not block editor",
    );
    const xmlDownload = page.waitForEvent("download");
    release(base + "invoice-xml/download");
    await xmlDownload;
    console.log(
      "PASS finalization: autosave/preview/confirm/download loading, duplicate protection, dry-run labeling.",
    );

    // Polling, slow server, transient errors, terminal warnings and GET-only recheck.
    transfer = makeTransfer("after", "imported", "checking");
    await page.clock.install();
    await page.goto(origin + "/transfer");
    await expect(
      page.getByText("Se verifică scăderea stocului…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Factură importată în SAGA; scăderea stocului nu este confirmată.",
        { exact: true },
      ),
    ).toHaveCount(0);
    await page.clock.fastForward(31_000);
    await expect(page.getByText(/Procesarea durează mai mult/)).toBeVisible();
    failure = true;
    await page.clock.fastForward(5000);
    await expect(page.getByText(/Ultimul rezultat este păstrat/)).toBeVisible();
    await expect(
      page.getByText("Importată în SAGA", { exact: false }),
    ).toBeVisible();
    failure = false;
    transfer = makeTransfer("done", "imported", "not_confirmed");
    await page.clock.fastForward(6000);
    await expect(
      page.getByText(
        "Factură importată în SAGA; scăderea stocului nu este confirmată.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Se verifică scăderea stocului…", { exact: true }),
    ).toHaveCount(0);
    hold(base + "invoice-saga/recheck");
    await page
      .getByRole("button", { name: "Reverifică stocul (fără retrimitere)" })
      .click();
    await expect(
      page.getByRole("button", { name: "Se pornește reverificarea…" }),
    ).toBeDisabled();
    const importCount = imports;
    release(base + "invoice-saga/recheck");
    await expect(
      page.getByText("Se verifică scăderea stocului…", { exact: true }),
    ).toBeVisible();
    assert.equal(rechecks, 1);
    assert.equal(imports, importCount, "recheck never imports");
    transfer = makeTransfer("done", "imported", "observed");
    await page.clock.fastForward(3000);
    await expect(
      page.getByText("Diferența așteptată a fost observată", { exact: false }),
    ).toBeVisible();
    hold(base + "invoice-saga/report");
    await page
      .getByRole("button", { name: "Descarcă raportul importului" })
      .click();
    await expect(
      page.getByRole("button", { name: "Se pregătește descărcarea…" }),
    ).toBeDisabled();
    const reportDownload = page.waitForEvent("download");
    release(base + "invoice-saga/report");
    await reportDownload;
    const beforePolls = polls;
    await page.clock.fastForward(10_000);
    assert.equal(polls, beforePolls, "terminal operation stops polling");
    console.log(
      "PASS transfer: active stages, 30s delay, poll failure recovery, terminal-only warning, GET-only recheck, report download.",
    );
    // Terminal statuses and narrow widths remain usable, with reduced motion.
    for (const [result, stock] of [
      ["partial", "not_confirmed"],
      ["failed", "not_confirmed"],
      ["unknown", "not_confirmed"],
      ["imported", "not_applicable"],
    ] as const) {
      transfer = makeTransfer(
        result === "imported" ? "done" : "review",
        result,
        stock,
      );
      if (stock === "not_applicable") transfer.groups = [];
      await page.goto(origin + "/transfer");
      await expect(
        page.getByText("Transmitere factură și stoc SAGA", { exact: true }),
      ).toBeVisible();
      await expect(page.locator('[aria-current="step"]')).toHaveCount(0);
      if (stock === "not_applicable")
        await expect(
          page.getByText("Neaplicabil — servicii", { exact: true }),
        ).toBeVisible();
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      transfer = makeTransfer("sending", "sending", "pending");
      await page.goto(origin + "/transfer");
      await expect(
        page.getByText("Se trimite factura în SAGA…", { exact: true }),
      ).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        "no horizontal overflow",
      );
      const animation = await page
        .locator('[aria-current="step"] svg')
        .evaluate((el) => getComputedStyle(el).animationName);
      assert.equal(animation, "none");
    }
    await mkdir("/tmp/fom-invoice-feedback", { recursive: true });
    await page.screenshot({
      path: "/tmp/fom-invoice-feedback/mobile-progress.png",
      fullPage: true,
    });
    hold("/api/fixture/a");
    hold("/api/fixture/b");
    await page.goto(origin + "/activity");
    await page.getByRole("button", { name: "Începe a" }).click();
    await page.getByRole("button", { name: "Începe b" }).click();
    release("/api/fixture/a");
    await expect(page.getByLabel("Ocupat")).toHaveText("true");
    release("/api/fixture/b");
    await expect(page.getByLabel("Ocupat")).toHaveText("false");
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      "PASS responsive/reduced motion and concurrent operation locks. No upstream requests or real data writes.",
    );
  } finally {
    blocked.forEach((g) => g.release());
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
