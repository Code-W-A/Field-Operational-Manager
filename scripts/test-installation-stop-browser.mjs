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
  "@/contexts/AuthContext": `export const useAuth=()=>({userData:window.viewer});`,
  "next/navigation": `export const useRouter=()=>({push:()=>{}});export const useSearchParams=()=>new URLSearchParams();`,
  "next/link": `import React from 'react';export default React.forwardRef(({href,children,...props},ref)=><a ref={ref} href={href} {...props}>{children}</a>);`,
  "@/components/equipment-qr-code": `export const EquipmentQRCode=()=>null;`,
  "@/components/signature-pad": `export const SignaturePad=({title,onSave})=><button onClick={()=>onSave('data:image/png;base64,test')}>{title}</button>;`,
  "@/lib/installations/client": `export const installationApi=id=>'/installation/'+id;export const installationRequest=async(url,payload)=>{window.commands.push(payload);if(window.delay)await new Promise(resolve=>window.finishSave=resolve);if(window.fail)throw Error('Eroare de rețea');window.saved={...(window.saved||window.sheet),...payload.fields,state:payload.action==='stop'?'awaiting_signature':payload.action==='sign'?'closed':'draft',revision:2};return{sheet:window.saved};};`,
  "@/components/installation/shared": `export const statuses={in_progress:'În lucru'};export const dateLabel=v=>v;export const pdf=async()=>{};export const pageUrl=id=>'/instalare/'+id;export const StatusBadge=({status})=><span>{status}</span>;`,
};
const out = await build({
  stdin: {
    contents: `import React,{useState}from'react';import{createRoot}from'react-dom/client';import{InstallationSheetForm}from'./components/installation/forms';import{InstallationTeam}from'./components/installation/team';import{InstallationHistory}from'./components/installation/overview';function Fixture(){const[sheet,setSheet]=useState(window.sheet);const[left,setLeft]=useState(false);const[history,setHistory]=useState(window.historyView);return history?<div onClick={e=>{if(e.target.closest('a')){e.preventDefault();setHistory(false);}}}><InstallationHistory data={window.list} history={[sheet]} workId='work' busy={false} run={async fn=>fn()} onMore={async()=>{}} onClear={()=>{}} /></div>:left?<><h1>Fișe zilnice</h1><button onClick={()=>setLeft(false)}>Redeschide fișa</button></>:<><button onClick={()=>setHistory(true)}>Înapoi la listă</button><InstallationTeam sheet={sheet} compact={window.viewer?.role==='tehnician'}/><InstallationSheetForm readOnly={window.inactive} workId="work" sheet={sheet} onSheet={setSheet} onStopped={()=>{window.routes.push('/instalare?tab=sheets');setLeft(true)}} onRefresh={async()=>{window.refreshes++;throw Error('Reîncărcare indisponibilă')}}/></>;}createRoot(document.getElementById('root')).render(<Fixture/>);`,
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
      content: ["./components/installation/*.tsx", "./components/ui/*.tsx"],
    }),
  ]).process(await readFile("app/globals.css", "utf8"), {
    from: "app/globals.css",
  })
).css;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
async function fixture(opts = {}) {
  const p = await browser.newPage({ viewport: { width: opts.width || 360, height: 800 } });
  await p.route("https://installation-stop.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await p.goto("https://installation-stop.test/");
  await p.setContent(
    `<style>${css}</style><div id="root" style="padding:16px"></div>`,
  );
  await p.evaluate((opts) => {
    window.viewer = opts.viewer === undefined ? {uid:"tech",role:"tehnician",displayName:"Tehnician"} : opts.viewer;
    window.inactive = opts.inactive || false;
    window.historyView = opts.history || false;
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
      participants: [{uid: "tech", name: "Tehnician", role: "principal", active: false}],
      timeIntervals: [{uid: "tech", startedAt: "2026-10-21T05:30:00Z", endedAt: "2026-10-21T07:15:00Z"}],
    };
    Object.assign(window.sheet, opts.sheet || {});
    if (opts.legacy) delete window.sheet.participants;
    window.list = {work:{anulat:window.inactive,statusLucrare:window.inactive?'Anulat':'În lucru',installation:{equipment:[{id:'eq',name:'Bariera intrare 2'}]}},nextCursor:null};
  }, opts);
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
  await expect(p.getByText("Total echipă — ore-om: 1 h 45 min", {exact: true})).toBeVisible();
  const beneficiaryBox = await p.getByRole("button", {name: "Semnătura beneficiarului", exact:true}).boundingBox();
  const technicianBox = await p.getByRole("button", {name: /Semnătura tehnicianului/}).boundingBox();
  assert(beneficiaryBox.y < technicianBox.y);
  await p.addStyleTag({content:'* { scroll-behavior: auto !important; } html, body {overflow: visible !important; height: auto !important;}'});
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({path: '/tmp/fom-installation-time-web.png', fullPage:true, animations:'disabled'});
  await p.getByRole("button", { name: /Semnătura tehnicianului/ }).click();
  await p
    .getByRole("button", { name: "Semnătura beneficiarului", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Semnează fișa zilei", exact: true })
    .click();
  await expect(p.getByText(/^Fișă semnată ·/)).toBeVisible();
  await p.close();
  let noticeChecks = 0;
  const waiting = {state:'awaiting_signature',canSign:false,equipmentId:'eq',principalUid:'mihai',principalName:'Mihai Sima',participants:[{uid:'mihai',name:'Mihai Sima',role:'principal',active:false}]};
  const outsider = {uid:'alin',role:'tehnician',displayName:'Alin'};
  for (const width of [360,1280]) {
    for (const legacy of [false,true]) {
      const page = await fixture({width,legacy,viewer:outsider,sheet:waiting,history:true});
      await expect(page.getByTestId('installation-signing-notice').filter({visible:true})).toHaveCount(1);
      await expect(page.getByText('Semnare indisponibilă: nu ești participant la această fișă.').filter({visible:true})).toBeVisible();
      await page.getByRole('link',{name:'Deschide',exact:true}).filter({visible:true}).click();
      await expect(page.getByTestId('installation-signing-notice')).toHaveCount(1);
      await expect(page.getByText('Participant înregistrat: Mihai Sima.',{exact:true})).toBeVisible();
      await expect(page.getByText(/Nu poți semna această fișă/)).toBeVisible();
      await expect(page.getByText('Semnare ulterioară',{exact:true})).toHaveCount(0);
      await page.getByRole('button',{name:'Înapoi la listă',exact:true}).click();
      assert.equal(await page.evaluate(()=>window.commands.length),0);
      assert.equal(await page.evaluate(()=>window.saved),undefined);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:`/tmp/fom-signing-web-list-${width}-${legacy}.png`,fullPage:true});
      await page.close();noticeChecks++;
    }
  }
  for (const role of ['admin','dispecer']) {
    const page=await fixture({viewer:{uid:'manager',role},sheet:waiting});
    await expect(page.getByText(/Nu poți semna/)).toHaveCount(0);
    await expect(page.getByTestId('installation-signing-notice')).toContainText('Semnarea acestei fișe se face de un tehnician participant.');
    await expect(page.getByText('Semnare ulterioară',{exact:true})).toHaveCount(0);
    assert.equal(await page.evaluate(()=>window.commands.length),0);
    await page.close();noticeChecks++;
  }
  for (const opts of [{inactive:true},{sheet:{state:'closed'}},{sheet:{state:'draft'}},{sheet:{participants:[]}},{sheet:{participants:[{uid:'mihai',name:'',role:'principal',active:false}]}},{sheet:{canSign:undefined}}]) {
    const page=await fixture({...opts,viewer:outsider,sheet:{...waiting,...opts.sheet}});
    await expect(page.getByText(/Nu poți semna/)).toHaveCount(0);
    if(opts.inactive) await expect(page.getByTestId('installation-signing-notice')).toContainText('tichetul este închis, arhivat sau anulat');
    if(opts.sheet?.state) await expect(page.getByTestId('installation-signing-notice')).toHaveCount(0);
    if(opts.sheet?.participants) await expect(page.getByTestId('installation-signing-notice')).toContainText('incomplete');
    assert.equal(await page.evaluate(()=>window.commands.length),0);
    await page.close();noticeChecks++;
  }
  for (const legacy of [false,true]) {
    const page=await fixture({legacy,viewer:{uid:'mihai',role:'tehnician'},sheet:{...waiting,canSign:true,participants:[{...waiting.participants[0],moved:true}]}});
    await expect(page.getByText(/Nu poți semna/)).toHaveCount(0);
    await expect(page.getByText('Semnare ulterioară',{exact:true})).toBeVisible();
    assert.equal(await page.evaluate(()=>window.commands.length),0);
    await page.close();noticeChecks++;
  }
  const unavailable=await fixture({viewer:null,sheet:waiting});
  await expect(unavailable.getByTestId('installation-signing-notice')).toContainText('Verifică accesul');
  await expect(unavailable.getByText(/Nu poți semna/)).toHaveCount(0);
  assert.equal(await unavailable.evaluate(()=>window.commands.length),0);
  await unavailable.close();noticeChecks++;
  for (const width of [360,1280]) {
    const page=await fixture({width,viewer:outsider,sheet:{...waiting,participants:[...waiting.participants,{uid:'stefan',name:'Ștefan '+ 'NumeLung'.repeat(30),role:'secondary',active:false,moved:true}]}});
    await expect(page.getByTestId('installation-signing-notice')).toContainText('Participanți înregistrați: Mihai Sima, Ștefan');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`/tmp/fom-signing-web-detail-${width}.png`,fullPage:true});
    await page.close();noticeChecks++;
  }
  console.log(`Signing explanations web: ${noticeChecks} scenarios passed (legacy/current, list/detail, roles, inactive, incomplete data, long names, no writes).`);
  console.log(
    "Installation stop browser: orange/white at 360px, draft save, delayed confirmation, duplicate prevention, failure/retry, immediate exit, retained data/photos, deferred signing passed.",
  );
} finally {
  await browser.close();
}
