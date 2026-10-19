// Real management and invoice components; Firebase, file storage and editor
// dialogs are isolated. The service suite separately verifies real transactions.
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import postcss from "postcss";
import tailwind from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig.js";

const mocks = {
  "next/link": `import React from 'react';export default React.forwardRef(({href,children,...props},ref)=><a ref={ref} href={href} {...props}>{children}</a>);`,
  "next/navigation": `const router={push(){},replace(){}};export const useRouter=()=>router;export const usePathname=()=>'/dashboard/lucrari/installation';export const useSearchParams=()=>new URLSearchParams();`,
  "@/components/dashboard-shell": `export const DashboardShell=({children})=><main>{children}</main>;`,
  "@/components/qr-code-scanner": `export const QRCodeScanner=()=>null;`,
  "@/lib/installations/client": `export const installationApi=id=>'/installation/'+id;export const installationRequest=async()=>({work:structuredClone(window.work),sheets:[],canStart:false,currentSession:null,completion:null});`,
  "@/components/installation/overview": `export const InstallationSummary=()=>null;export const InstallationContext=()=>null;export const InstallationEquipmentList=()=> <p>Lista echipamentelor</p>;export const InstallationHistory=()=>null;export const InstallationDocuments=()=>null;`,
  "@/components/installation/forms": `export const InstallationSheetForm=()=>null;export const InstallationCompletionForm=()=>null;`,
  "@/components/installation/team": `export const InstallationTeam=()=>null;`,
  "@/contexts/AuthContext": `export const useAuth=()=>({userData:{uid:'dispatcher',role:window.role,displayName:'Dispecer test'}});`,
  "@/lib/firebase/firestore": `export const getLucrareById=async()=>structuredClone(window.work); export const updateLucrare=async(id,patch)=>{window.calls.writes.push(patch); await new Promise(r=>setTimeout(r,window.saveDelay||30)); if(window.failSave) throw new Error('Salvare indisponibilă'); window.work={...window.work,...patch,...(patch.preluatDispecer?{preluatDe:'Dispecer test'}:{})};};`,
  "@/lib/firebase/storage": `export const uploadFile=async(file,path)=>{window.calls.uploads.push({name:file.name,path}); return {url:'https://storage.test/invoice.pdf',fileName:file.name};}; export const deleteFile=async()=>{};`,
  "@/hooks/use-toast": `export const toast=value=>window.calls.toasts.push(value);`,
  "@/components/report-generator": `export const ReportGenerator=()=>{throw new Error('Installation must not generate an intervention report')};`,
  "@/lib/pdf/revision-operations": `export const generateRevisionOperationsPDF=async()=>new Blob();`,
  "@/app/dashboard/lucrari/[id]/offer-editor-dialog": `export const OfferEditorDialog=({open,onOpenChange})=>open?<div role="dialog" aria-label="Editor ofertă existent"><button onClick={()=>onOpenChange(false)}>Închide oferta</button></div>:null;`,
  "@/app/dashboard/lucrari/[id]/deviz-editor-dialog": `export const DevizEditorDialog=({open,onOpenChange})=>open?<div role="dialog" aria-label="Editor deviz existent"><button onClick={()=>onOpenChange(false)}>Închide devizul</button></div>:null;`,
};
const result = await build({
  stdin: {
    contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {InstallationManagement} from '@/components/installation/management';import {InstallationTicketDetails} from '@/components/installation/ticket-details';import {InstallationWorkspace} from '@/components/installation-workspace';function Fixture(){const [work,setWork]=useState(window.work);window.replaceWork=patch=>{window.work={...window.work,...patch};setWork(window.work)};return <div className="mx-auto max-w-7xl p-4"><InstallationManagement work={work} onUpdate={setWork}>{({headerAction,clientControls,documents})=><InstallationWorkspace workId={work.id} compact headerActions={headerAction} onEdit={()=>{}} ticketDetails={<><InstallationTicketDetails work={work} role={window.role} display={{identity:{name:work.client},contact:{location:work.locatie,name:'Contact test',address:'Adresă test'},issues:[]}} syncIssues={[]} commercialControls={clientControls}/>{documents}</>}/>}</InstallationManagement></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  plugins: [
    {
      name: "isolated-dependencies",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) => {
          const key = args.path.startsWith(".")
            ? "@/" +
              path
                .relative(
                  process.cwd(),
                  path.resolve(args.resolveDir, args.path),
                )
                .replaceAll("\\", "/")
            : args.path;
          return mocks[key] ? { path: key, namespace: "mock" } : undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents: mocks[args.path],
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const config = loadConfig(path.resolve("tailwind.config.ts"));
const css = (
  await postcss([
    tailwind({
      ...config,
      content: [
        "./components/installation-workspace.tsx",
        "./components/dashboard-header.tsx",
        "./components/installation/{management,ticket-details}.tsx",
        "./components/ui/*.tsx",
        "./components/document-upload.tsx",
        "./components/ticket-client-information.tsx",
        { raw: "mx-auto max-w-7xl p-4" },
      ],
    }),
  ]).process(await readFile("app/globals.css", "utf8"), {
    from: "app/globals.css",
  })
).css;
const browser = await chromium.launch({ headless: true, channel: "chrome" });
let checks = 0;
async function fixture(
  role = "dispecer",
  completed = false,
  picked = false,
  width = 390,
  overrides = {},
) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.route("https://installation-management.test/**", (route) =>
    route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }),
  );
  await page.goto("https://installation-management.test/work");
  await page.evaluate(
    ({ role, completed, picked, overrides }) => {
      window.role = role;
      window.work = {
        id: "installation",
        nrLucrare: "#002144",
        client: "Client test edit",
        locatie: "Sediu",
        tipLucrare: "Instalare",
        statusLucrare: completed ? "Finalizat" : "În lucru",
        preluatDispecer: picked,
        statusFacturare: "Nefacturat",
        equipmentIds: [],
        installation: {
          schemaVersion: 1,
          equipment: [],
          equipmentStatus: {},
          activeSheetByEquipment: {},
          rootWorkId: "installation",
          ...(completed
            ? { closedReason: "completed", completionDocumentId: "final" }
            : {}),
        },
        ...overrides,
      };
      window.calls = { writes: [], uploads: [], toasts: [] };
      window.failSave = false;
    },
    { role, completed, picked, overrides },
  );
  await page.addStyleTag({ content: css + "\nhtml,body{height:auto!important;overflow:visible!important}" });
  await page.addScriptTag({ content: result.outputFiles[0].text });
  return page;
}
try {
  for (const role of ["admin", "dispecer"]) {
    const page = await fixture(role);
    await expect(
      page.getByRole("region", { name: "Ofertare și deviz" }),
    ).toBeVisible();
    await expect(
      page.getByText("Preluare, ofertare și facturare", { exact: true }),
    ).toHaveCount(0);
    const header = page
      .getByRole("heading", { name: /Instalare/ })
      .locator('xpath=ancestor::div[contains(@class,"md:flex-row")][1]');
    await expect(
      header.getByRole("button", { name: "Preia tichetul", exact: true }),
    ).toHaveCount(1);
    const clientCard = page
      .getByRole("heading", { name: "Informații client", exact: true })
      .locator('xpath=ancestor::div[contains(@class,"shadow-sm")][1]');
    await expect(
      clientCard.getByRole("region", { name: "Ofertare și deviz" }),
    ).toHaveCount(1);
    await expect(page.getByText("Preluare", { exact: true })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Preia tichetul", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Încarcă factură", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Editor deviz", exact: true }),
    ).toBeDisabled();
    await page.getByRole("switch", { name: "Necesită ofertă" }).click();
    await expect(
      page.getByRole("button", { name: "Editor ofertă", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Editor ofertă", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Editor ofertă existent" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Închide oferta" }).click();
    assert.equal(
      await page
        .getByRole("button", { name: /Generează.*raport|Descarcă raport/ })
        .count(),
      0,
    );
    checks++;
    await page.close();
  }
  for (const role of ["tehnician", "client"]) {
    const page = await fixture(role, true);
    await expect(
      page.getByRole("heading", { name: "Informații client", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preia tichetul", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Ofertare și deviz" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Încarcă factură", exact: true }),
    ).toHaveCount(0);
    checks++;
    await page.close();
  }
  const pickup = await fixture("dispecer", true);
  await pickup.evaluate(() => (window.saveDelay = 250));
  await pickup
    .getByRole("button", { name: "Preia tichetul", exact: true })
    .evaluate((button) => {
      button.click();
      button.click();
    });
  await expect(
    pickup.getByRole("switch", { name: "Necesită ofertă" }),
  ).toBeDisabled();
  await expect(
    pickup.getByText("Preluat de Dispecer test", { exact: true }),
  ).toBeVisible();
  await expect(
    pickup.getByRole("button", { name: "Încarcă factură", exact: true }),
  ).toBeEnabled();
  await pickup
    .getByRole("button", { name: "Editor deviz", exact: true })
    .click();
  await expect(
    pickup.getByRole("dialog", { name: "Editor deviz existent" }),
  ).toBeVisible();
  await pickup.getByRole("button", { name: "Închide devizul" }).click();
  await pickup
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "factura.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-test"),
    });
  await expect(pickup.getByText("Facturat", { exact: true })).toBeVisible();
  const calls = await pickup.evaluate(() => window.calls);
  assert.equal(calls.uploads.length, 1);
  assert.equal(calls.writes[0].preluatDispecer, true);
  assert.equal(calls.writes.filter((patch) => patch.preluatDispecer).length, 1);
  await expect(
    pickup.getByRole("button", { name: "Preia tichetul", exact: true }),
  ).toHaveCount(0);
  assert.equal(calls.writes.at(-1).statusFacturare, "Facturat");
  assert(
    !calls.writes.some(
      (patch) => "installation" in patch || "statusLucrare" in patch,
    ),
  );
  checks++;
  await pickup.close();

  const retry = await fixture("admin", true);
  await retry.evaluate(() => (window.failSave = true));
  await retry
    .getByRole("button", { name: "Preia tichetul", exact: true })
    .click();
  await expect
    .poll(() => retry.evaluate(() => window.calls.toasts.at(-1)?.description))
    .toBe("Salvare indisponibilă");
  await expect(
    retry.getByRole("button", { name: "Preia tichetul", exact: true }),
  ).toBeEnabled();
  await expect(
    retry.getByRole("button", { name: "Încarcă factură", exact: true }),
  ).toBeDisabled();
  await retry.evaluate(() => (window.failSave = false));
  await retry
    .getByRole("button", { name: "Preia tichetul", exact: true })
    .click();
  await expect(
    retry.getByText("Preluat de Dispecer test", { exact: true }),
  ).toBeVisible();
  checks++;
  await retry.close();

  const sent = await fixture("admin", true, true);
  await sent.evaluate(() =>
    window.replaceWork({ necesitaOferta: true, offerSendCount: 1 }),
  );
  await expect(
    sent.getByRole("switch", { name: "Necesită ofertă" }),
  ).toBeDisabled();
  await sent.evaluate(() => window.replaceWork({ statusLucrare: "Arhivată" }));
  await expect(
    sent.getByRole("button", { name: "Editor ofertă", exact: true }),
  ).toHaveCount(0);
  await expect(
    sent.getByRole("button", {
      name: "Indisponibil pentru tichete arhivate",
      exact: true,
    }),
  ).toBeDisabled();
  checks++;
  await sent.close();
  for (const width of [360, 390, 1440]) {
    const page = await fixture("dispecer", true, false, width);
    const pickupButton = page.getByRole("button", {
      name: "Preia tichetul",
      exact: true,
    });
    await expect(pickupButton).toBeEnabled();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "No horizontal page overflow",
    );
    const heading = await page
      .getByRole("heading", { name: /Instalare/ })
      .boundingBox();
    const action = await pickupButton.boundingBox();
    if (width >= 768)
      assert(
        action.x > heading.x + heading.width,
        "Pickup belongs to the right-hand header actions",
      );
    const clientCard = page
      .getByRole("heading", { name: "Informații client", exact: true })
      .locator('xpath=ancestor::div[contains(@class,"shadow-sm")][1]');
    await expect(
      clientCard.getByRole("button", { name: "Editor ofertă", exact: true }),
    ).toHaveCount(1);
    assert(
      !(await clientCard
        .getByRole("button", { name: "Încarcă factură", exact: true })
        .count()),
    );
    await expect(
      page.getByRole("tab", { name: "Echipamente", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Fișe zilnice", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "Documente", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `/private/tmp/fom-installation-layout-${width}.png`,
      fullPage: true,
    });
    checks++;
    await page.close();
  }
  const canceled = await fixture("admin", true, false, 390, {
    statusLucrare: "Anulat",
    anulat: true,
  });
  await expect(
    canceled.getByRole("button", { name: "Preia tichetul", exact: true }),
  ).toHaveCount(0);
  await expect(
    canceled.getByRole("region", { name: "Ofertare și deviz" }),
  ).toHaveCount(0);
  checks++;
  await canceled.close();
  console.log(
    `PASS: ${checks} installation management browser scenarios, isolated Firebase/storage/editor dependencies.`,
  );
} finally {
  await browser.close();
}
