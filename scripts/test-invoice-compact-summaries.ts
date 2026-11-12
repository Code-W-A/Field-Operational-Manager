/** Isolated presentation fixtures: no Firebase credentials or upstream SAGA traffic. */
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import { createServer } from "node:http";
import path from "node:path";

async function main() {
  const bundle = await build({
    stdin: {
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import{InvoiceNumberEstimate}from'./components/invoicing/invoice-number-estimate';import{InvoiceClientAssociation}from'./components/invoicing/invoice-client-association';function App(){const[cui,setCui]=React.useState('RO123');return <main><input aria-label="Editare locală" value={cui} onChange={e=>setCui(e.target.value)}/><InvoiceNumberEstimate workId="w"/><InvoiceClientAssociation workId="w" beneficiaryCui={cui} beneficiaryCountry="RO"/></main>}createRoot(document.getElementById('root')).render(<App/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    plugins: [
      {
        name: "fixture-auth",
        setup(b) {
          b.onResolve({ filter: /contexts\/AuthContext$/ }, () => ({
            path: "auth",
            namespace: "fixture",
          }));
          b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: `const user={uid:'admin',getIdToken:async()=> 'fixture'};export function useAuth(){return {user}};`,
          }));
        },
      },
    ],
    tsconfig: path.resolve("tsconfig.json"),
  });
  const server = createServer((req, res) => {
    res.setHeader(
      "Content-Type",
      req.url === "/app.js" ? "application/javascript" : "text/html",
    );
    res.end(
      req.url === "/app.js"
        ? bundle.outputFiles[0].text
        : '<div id="root"></div><script src="/app.js"></script>',
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let number: any = { number: "DISP0002", reserved: false, reason: "" };
    const valid: any = {
      clientId: "client",
      clientName: "Client test",
      taxId: "RO123",
      issues: [],
      link: { active: true, country: "RO" },
      entry: { code: "00974", name: "Client test" },
    };
    let client: any = valid,
      fail = false,
      calls = 0;
    await page.route("**/api/**", async (route) => {
      calls++;
      await route.fulfill({
        status: fail ? 503 : 200,
        json: fail
          ? { error: "unavailable" }
          : route.request().url().endsWith("/number")
            ? number
            : client,
      });
    });
    await page.goto(`http://127.0.0.1:${port}`);
    const n = page.getByRole("region", { name: "Numărul facturii" });
    const c = page.getByRole("region", { name: "Client SAGA al facturii" });
    await expect(n).toHaveText("Număr factură · DISP0002");
    await expect(c).toHaveText("Client test · RO123 · Asociat SAGA 00974");
    await expect(page.getByRole("button")).toHaveCount(0);
    async function refresh() {
      const before = calls;
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => calls).toBeGreaterThanOrEqual(before + 2);
    }
    number = {
      number: null,
      reserved: false,
      reason: "Lipsește profilul de facturare pentru test.",
    };
    client = { ...valid, link: null, entry: null, issues: ["neasociat"] };
    await refresh();
    await expect(n).toContainText("Configurează numerotarea din");
    await expect(c).toContainText("Client neasociat cu SAGA");
    await expect(c.getByRole("link")).toHaveAttribute(
      "href",
      "/dashboard/clienti/client",
    );
    number = {
      number: null,
      reserved: false,
      reason: "Tichetul este arhivat.",
    };
    client = {
      ...valid,
      clientId: null,
      link: null,
      entry: null,
      issues: ["ambiguu"],
    };
    await refresh();
    await expect(n).toHaveText("Tichetul este arhivat.");
    await expect(c).toContainText("lipsește sau este ambiguu");
    client = { ...valid, issues: ["Asocierea necesită reconfirmare"] };
    await refresh();
    await expect(c).toContainText("necesită reconfirmare");
    client = valid;
    number = { number: "DISP0003", reserved: false, reason: "" };
    await refresh();
    await expect(n).toContainText("DISP0003");
    await page.getByLabel("Editare locală").fill("RO456");
    await expect(c).toContainText("diferă de clientul FOM");
    fail = true;
    await refresh();
    await expect(n).toContainText("nu poate fi încărcat");
    await expect(c).toContainText("nu poate fi încărcată");
    fail = false;
    await refresh();
    await expect(n).toContainText("DISP0003");
    await expect(page.getByLabel("Editare locală")).toHaveValue("RO456");
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(c).toBeVisible();
      await expect(n).toBeVisible();
    }
    expect(errors).toEqual([]);
    console.log(
      "PASS compact invoice summaries: configured/missing/blocked numbering, associated/missing/ambiguous/stale/fiscal mismatch clients, load failures, focus refresh, preserved local edits, mobile 320/390. Mock APIs only; no SAGA traffic.",
    );
  } finally {
    await browser.close();
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
