// Real form and controls; the server and signature canvas are isolated.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwind from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig.js";
import path from "node:path";
const mocks = {
  "@/contexts/AuthContext": `export const useAuth=()=>({userData:{uid:'tech',role:'tehnician',displayName:'Tehnician'}});`,
  "next/navigation": `export const useRouter=()=>({push:()=>{}});`,
  "@/components/signature-pad": `export const SignaturePad=({title,onSave})=><button onClick={()=>onSave('data:image/png;base64,test')}>{title}</button>;`,
  "@/lib/installations/client": `export const installationApi=id=>'/installation/'+id;export const installationRequest=async(url,payload)=>{window.commands.push(payload);if(window.delay)await new Promise(resolve=>window.finishSave=resolve);if(window.fail)throw Error('Eroare de rețea');window.saved={...(window.saved||window.sheet),...payload.fields,state:payload.action==='stop'?'awaiting_signature':payload.action==='sign'?'closed':'draft',revision:2};return{sheet:window.saved};};`,
  "@/components/installation/shared": `export const statuses={in_progress:'În lucru'};export const dateLabel=v=>v;export const pdf=async()=>{};`,
  "@/components/installation/team": `export const sheetStateLabel=()=> 'În așteptarea semnăturilor';`,
};
const out = await build({
  stdin: {
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{InstallationSheetForm}from'./components/installation/forms';function Fixture(){const[sheet,setSheet]=useState(window.sheet);const[left,setLeft]=useState(false);return left?<><h1>Fișe zilnice</h1><button onClick={()=>setLeft(false)}>Redeschide fișa</button></>:<InstallationSheetForm workId="work" sheet={sheet} onSheet={setSheet} onStopped={()=>{window.routes.push('/instalare?tab=sheets');setLeft(true)}} onRefresh={async()=>{window.refreshes++;throw Error('Reîncărcare indisponibilă')}}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  plugins: [
    {
      name: "mocks",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => {
          const key = a.path.startsWith(".")
            ? "@/" +
              path.relative(process.cwd(), path.resolve(a.resolveDir, a.path))
            : a.path;
          return mocks[key] ? { path: key, namespace: "mock" } : undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          contents: mocks[a.path],
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const css = (
  await postcss([
    tailwind({
      ...loadConfig(path.resolve("tailwind.config.ts")),
      content: ["./components/installation/forms.tsx", "./components/ui/*.tsx"],
    }),
  ]).process(await readFile("app/globals.css", "utf8"), {
    from: "app/globals.css",
  })
).css;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
async function fixture() {
  const p = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await p.route("https://installation-stop.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await p.goto("https://installation-stop.test/");
  await p.setContent(
    `<style>${css}</style><div id="root" style="padding:16px"></div>`,
  );
  await p.evaluate(() => {
    window.commands = [];
    window.routes = [];
    window.refreshes = 0;
    window.sheet = {
      id: "s",
      principalUid: "tech",
      principalName: "Tehnician",
      workDate: "2026-10-21",
      state: "draft",
      revision: 1,
      finding: "Constatare",
      operations: "Montaj",
      installationStatus: "in_progress",
      internalNote: "Notă",
      photos: [{ id: "p", name: "Fotografie existentă" }],
      canSign: true,
    };
  });
  await p.addScriptTag({ content: out.outputFiles[0].text });
  return p;
}
try {
  const p = await fixture();
  const stop = p.getByRole("button", {
    name: "Oprește lucrul și semnează ulterior",
    exact: true,
  });
  await expect(stop).toHaveCSS("background-color", "rgb(232, 98, 61)");
  await expect(stop).toHaveCSS("color", "rgb(255, 255, 255)");
  assert.ok(
    await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await p
    .getByLabel("Operațiuni executate *", { exact: true })
    .fill("Operațiuni noi");
  await p.getByRole("button", { name: "Salvează ciorna", exact: true }).click();
  await expect(p.getByRole("status")).toHaveText("Ciorna a fost salvată.");
  assert.equal(await p.evaluate(() => window.routes.length), 0);
  await p
    .getByLabel("Operațiuni executate *", { exact: true })
    .fill("Date pentru oprire");
  await p.evaluate(() => {
    window.delay = true;
    window.fail = true;
  });
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(stop).toHaveAttribute("aria-busy", "true");
  await expect(stop.locator("svg")).toBeVisible();
  await stop.evaluate((el) => el.click());
  assert.equal(await p.evaluate(() => window.commands.length), 2);
  assert.equal(await p.evaluate(() => window.routes.length), 0);
  await p.evaluate(() => window.finishSave());
  await expect(p.getByRole("alert")).toHaveText("Eroare de rețea");
  await expect(
    p.getByLabel("Operațiuni executate *", { exact: true }),
  ).toHaveValue("Date pentru oprire");
  await expect(
    p.getByRole("img", { name: "Fotografie existentă" }),
  ).toHaveCount(1);
  assert.equal(await p.evaluate(() => window.routes.length), 0);
  await p.evaluate(() => {
    window.fail = false;
    window.delay = false;
  });
  await stop.click();
  await expect(
    p.getByRole("heading", { name: "Fișe zilnice", exact: true }),
  ).toBeVisible();
  assert.equal(await p.evaluate(() => window.refreshes), 0);
  assert.equal(
    await p.evaluate(() => window.saved.operations),
    "Date pentru oprire",
  );
  assert.equal(await p.evaluate(() => window.saved.photos.length), 1);
  assert.equal(
    await p.evaluate(() => window.saved.state),
    "awaiting_signature",
  );
  await p.getByRole("button", { name: "Redeschide fișa" }).click();
  await expect(
    p.getByText("Semnare ulterioară", { exact: true }),
  ).toBeVisible();
  await p
    .getByLabel("Numele beneficiarului *", { exact: true })
    .fill("Beneficiar");
  await p.getByRole("button", { name: /Semnătura tehnicianului/ }).click();
  await p
    .getByRole("button", { name: "Semnătura beneficiarului", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Semnează fișa zilei", exact: true })
    .click();
  await expect(p.getByText(/^Fișă semnată ·/)).toBeVisible();
  await p.close();
  console.log(
    "Installation stop browser: orange/white at 360px, draft save, delayed confirmation, duplicate prevention, failure/retry, immediate exit, retained data/photos, deferred signing passed.",
  );
} finally {
  await browser.close();
}
