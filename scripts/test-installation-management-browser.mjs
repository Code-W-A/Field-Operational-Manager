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
  "next/navigation": `import{useSyncExternalStore}from'react';let query='';const listeners=new Set();const router={push(url){window.destination=url},replace(url){query=url.split('?')[1]||'';listeners.forEach(fn=>fn());}};export const useRouter=()=>router;export const usePathname=()=>'/dashboard/lucrari/installation';export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn)},()=>query));`,
  "@/components/dashboard-shell": `export const DashboardShell=({children})=><main>{children}</main>;`,
  "@/components/equipment-qr-code": `export const EquipmentQRCode=()=>null;`,
  "@/components/qr-code-scanner": `export const QRCodeScanner=()=>null;`,
  "@/lib/installations/client": `import{installationArchiveReasons}from'@/lib/installations/archive';export const installationApi=id=>'/installation/'+id;export const installationRequest=async(url,body)=>{if(body){window.calls.requests.push(body);if(body.action==='manage'&&body.work?.preluatDispecer){window.calls.writes.push(body.work);await new Promise(r=>setTimeout(r,window.saveDelay||30));if(window.failSave)throw Error('Salvare indisponibilă');if(body.expectedAssignmentVersion!==(window.work.installation.assignmentVersion||0))throw Error('Echipa a fost modificată');window.work={...window.work,...body.work,preluatDe:'Dispecer test',tehnicieni:[],statusLucrare:window.work.installation.closedReason==='completed'?'Finalizat':'Listată',installation:{...window.work.installation,assignmentVersion:body.expectedAssignmentVersion+1,lastPickupVersion:body.expectedAssignmentVersion}};return{}}if(window.failArchive)throw Error('La verificarea serverului: lipsește factura.');return{}}const work=structuredClone(window.work);const completed=!!work.installation.completionDocumentId;return{work,sheets:[],canStart:false,currentSession:null,completion:completed?{id:'final',documentSnapshot:{technicianName:'Tehnician',beneficiaryName:'Beneficiar'}}:null,managementActions:{archiveReasons:installationArchiveReasons(work,{completionExists:completed,openSheets:false,sessions:false})}}};`,
  "@/lib/pdf/installation": `export const downloadInstallationPdf=async(snapshot,id)=>{window.calls.downloads.push({snapshot,id})};`,
  "@/components/installation/overview": `export {InstallationSummary} from ${JSON.stringify(path.resolve("components/installation/overview.tsx"))};export const InstallationContext=()=>null;export const InstallationEquipmentList=()=> <p>Lista echipamentelor</p>;export const InstallationHistory=()=>null;export const InstallationDocuments=()=>null;`,
  "@/components/installation/forms": `export const InstallationSheetForm=()=>null;export const InstallationCompletionForm=()=>null;`,
  "@/components/installation/team": `export const InstallationTeam=()=>null;export const sheetStateLabel=state=>state;`,
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
    contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {InstallationManagement} from '@/components/installation/management';import {InstallationTicketDetails} from '@/components/installation/ticket-details';import {InstallationWorkspace} from '@/components/installation-workspace';function Fixture(){const [work,setWork]=useState(window.work);const[externalVersion,setExternalVersion]=useState(0);window.replaceWork=patch=>{window.work={...window.work,...patch};setWork(window.work);setExternalVersion(v=>v+1)};return <div className="mx-auto max-w-7xl p-4"><InstallationManagement work={work} onUpdate={setWork}>{({pickupAction,busy,version,clientControls,documents})=><InstallationWorkspace workId={work.id} compact pickupAction={pickupAction} managementBusy={busy} managementVersion={version+externalVersion} onEdit={()=>{}} managementDocuments={window.role==='admin'||window.role==='dispecer'?documents:undefined} ticketDetails={<><InstallationTicketDetails work={work} role={window.role} display={{identity:{name:work.client},contact:{location:work.locatie,name:'Contact test',address:'Adresă test'},issues:[]}} syncIssues={[]} commercialControls={clientControls}/>{window.role!=='admin'&&window.role!=='dispecer'&&documents}</>}/>}</InstallationManagement></div>};createRoot(document.getElementById('root')).render(<Fixture/>);`,
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
        "./components/installation/{management,header-action,ticket-details,overview}.tsx",
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
      window.calls = {
        writes: [],
        uploads: [],
        toasts: [],
        requests: [],
        downloads: [],
      };
      window.failSave = false;
    },
    { role, completed, picked, overrides },
  );
  await page.addStyleTag({
    content:
      css + "\nhtml,body{height:auto!important;overflow:visible!important}",
  });
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

  // Same-ticket handover must remain repeatable after commercial pickup.
  const handover = await fixture("dispecer", false, false, 390, {
    tehnicieni: ["Echipa inițială"], equipmentIds: ["e1", "e2"],
    installation: { schemaVersion: 1, rootWorkId: "installation", equipment: [],
      equipmentStatus: { e1: "in_progress", e2: "blocked" }, startedEquipmentIds: ["e1", "e2"],
      activeSheetByEquipment: {}, awaitingSheetByEquipment: {} },
  });
  const handoverButton = handover.getByRole("button", { name: "Preia tichetul", exact: true });
  await expect(handoverButton).toBeEnabled();
  await handoverButton.click();
  await expect.poll(() => handover.evaluate(() => window.work.statusLucrare)).toBe("Listată");
  await expect(handoverButton).toHaveCount(0);
  await expect(handover.getByRole("button", { name: "Editor deviz", exact: true })).toBeEnabled();
  assert.deepEqual(await handover.evaluate(() => window.work.tehnicieni), []);
  await handover.evaluate(() => window.replaceWork({ statusLucrare: "Atribuită", tehnicieni: ["Echipa nouă"],
    installation: {...window.work.installation, assignmentVersion: 2} }));
  await expect(handoverButton).toBeEnabled();
  await expect(handover.getByRole("button", { name: "Încarcă factură", exact: true })).toBeEnabled();
  await handover.evaluate(() => window.replaceWork({ installation: {...window.work.installation, activeSheetByEquipment: {e1: "active"}} }));
  await expect(handoverButton).toBeDisabled();
  await handover.evaluate(() => window.replaceWork({ installation: {...window.work.installation, activeSheetByEquipment: {}, awaitingSheetByEquipment: {e2: "unsigned"}} }));
  await expect(handoverButton).toBeDisabled();
  await handover.evaluate(() => window.replaceWork({ installation: {...window.work.installation, awaitingSheetByEquipment: {}} }));
  await expect(handoverButton).toBeEnabled();
  await handoverButton.click();
  await expect(handoverButton).toHaveCount(0);
  assert.equal(await handover.evaluate(() => window.calls.writes.filter(patch=>patch.preluatDispecer).length), 2);
  assert.equal(await handover.evaluate(() => window.work.installation.assignmentVersion), 3);
  checks++;
  await handover.close();

  const finalTeam = await fixture("dispecer", true, true, 390, { tehnicieni: ["Ultima echipă"] });
  const finalPickup = finalTeam.getByRole("button", { name: "Preia tichetul", exact: true });
  await expect(finalPickup).toBeEnabled();
  await finalPickup.click();
  await expect(finalPickup).toHaveCount(0);
  assert.equal(await finalTeam.evaluate(() => window.work.statusLucrare), "Finalizat");
  assert.deepEqual(await finalTeam.evaluate(() => window.work.tehnicieni), []);
  checks++;
  await finalTeam.close();

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
    const details = await page
      .getByRole("heading", { name: "Detalii instalare", exact: true })
      .boundingBox();
    const client = await clientCard.boundingBox();
    const totals = page.getByText("Echipamente totale", { exact: true });
    const stats = await totals
      .locator('xpath=ancestor::div[contains(@class,"grid-cols-2")][1]')
      .boundingBox();
    const invoice = await page
      .getByRole("button", { name: "Încarcă factură", exact: true })
      .boundingBox();
    const tabs = await page.getByRole("tablist").boundingBox();
    assert(details && client && stats && invoice && tabs);
    await expect(totals).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Încarcă factură", exact: true }),
    ).toHaveCount(1);
    assert(
      stats.y > details.y && invoice.y > client.y,
      "Summary and invoice follow ticket details",
    );
    if (width >= 1280) {
      assert(
        Math.abs(details.y - client.y - 24) < 45,
        "Top cards share the same row",
      );
      assert(client.x > details.x, "Client occupies the right column");
      assert(
        invoice.x > stats.x + stats.width,
        "Invoice occupies the right column beside summary",
      );
      assert(
        Math.abs(client.x - invoice.x + 24) < 50,
        "Invoice aligns with the client column",
      );
    } else {
      assert(
        client.y > details.y && invoice.y > stats.y + stats.height,
        "Mobile sections stack vertically",
      );
    }
    const finalStat = await page
      .getByText("Finalizate", { exact: true })
      .boundingBox();
    const remainingStat = await page
      .getByText("Rămase", { exact: true })
      .boundingBox();
    const totalStat = await totals.boundingBox();
    assert(
      Math.abs(finalStat.y - totalStat.y) < 2 && remainingStat.y > totalStat.y,
      "Statistics use a 2 by 2 grid",
    );
    assert(
      tabs.y > stats.y + stats.height && tabs.y > invoice.y,
      "Tabs follow the summary and invoice row",
    );
    for (const name of ["Fișe zilnice", "Documente", "Echipamente"]) {
      const tab = page.getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
    await page.screenshot({
      path: `/private/tmp/fom-installation-layout-${width}.png`,
      fullPage: true,
    });
    checks++;
    await page.close();
  }
  for (const role of ["admin", "dispecer"])
    for (const width of [360, 1440]) {
      const page = await fixture(role, false, false, width);
      const header = page
        .getByRole("heading", { name: /Instalare/ })
        .locator('xpath=ancestor::div[contains(@class,"md:flex-row")][1]');
      await expect(
        header.getByRole("button", { name: "Arhivează", exact: true }),
      ).toBeDisabled();
      await expect(
        header.getByRole("button", {
          name: "De ce este indisponibil: Anulează",
          exact: true,
        }),
      ).toHaveCount(0);
      const names = await header
        .locator("button,a")
        .evaluateAll((elements) =>
          elements
            .filter((e) => !e.getAttribute("aria-label")?.startsWith("De ce"))
            .map((e) => e.getAttribute("aria-label") || e.textContent.trim()),
        );
      assert.deepEqual(names, [
        "Înapoi la tichete",
        "Anulează",
        "Descarcă PV",
        "Arhivează",
        "Preia tichetul",
        "Editează",
        ...(role === "admin" ? ["Șterge tichetul"] : []),
        "Reîncarcă datele",
      ]);
      const info = header.getByRole("button", {
        name: "De ce este indisponibil: Descarcă PV",
        exact: true,
      });
      await info.focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("PV-ul final nu este încă semnat.", { exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(info).toBeFocused();
      await header
        .getByRole("button", {
          name: "De ce este indisponibil: Arhivează",
          exact: true,
        })
        .click();
      await expect(
        page.getByText("Preia tichetul înainte de arhivare.", { exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.locator("[data-radix-popper-content-wrapper]"),
      ).toHaveCount(0);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `/private/tmp/fom-installation-header-${role}-${width}.png`,
        fullPage: true,
      });
      await page.close();
      checks++;
    }
  const ready = await fixture("admin", true, true, 1440, {
    statusFacturare: "Nu se facturează",
    motivNefacturare: "Contract",
  });
  await expect(
    ready.getByRole("button", { name: "Arhivează", exact: true }),
  ).toBeEnabled();
  await ready.getByRole("button", { name: "Descarcă PV", exact: true }).click();
  await expect
    .poll(() => ready.evaluate(() => window.calls.downloads.length))
    .toBe(1);
  assert.equal(
    await ready.evaluate(() => window.calls.downloads[0].id),
    "installation",
  );
  await expect(
    ready.getByRole("button", { name: "Editează", exact: true }),
  ).toBeDisabled();
  await ready
    .getByRole("button", {
      name: "De ce este indisponibil: Editează",
      exact: true,
    })
    .click();
  await expect(
    ready.getByText("Instalarea este închisă; editarea este blocată.", {
      exact: true,
    }),
  ).toBeVisible();
  await ready.keyboard.press("Escape");
  await ready.evaluate(() => (window.failArchive = true));
  await ready.getByRole("button", { name: "Arhivează", exact: true }).click();
  await expect(ready.getByRole("alertdialog")).toBeVisible();
  await ready
    .getByRole("alertdialog")
    .getByRole("button", { name: "Arhivează", exact: true })
    .click();
  await expect(ready.getByRole("alert")).toHaveText(
    "La verificarea serverului: lipsește factura.",
  );
  assert.equal(await ready.evaluate(() => window.destination), undefined);
  await ready.evaluate(() => (window.failArchive = false));
  await ready
    .getByRole("alertdialog")
    .getByRole("button", { name: "Arhivează", exact: true })
    .click();
  await expect
    .poll(() => ready.evaluate(() => window.destination))
    .toBe("/dashboard/arhivate/installation");
  assert.equal(
    await ready.evaluate(() => window.calls.requests.at(-1).action),
    "archive",
  );
  await ready.close();
  checks++;
  const archived = await fixture("admin", true, true, 390, {
    statusLucrare: "Arhivată",
    archivedAt: "2026-10-21",
  });
  await expect(
    archived.getByRole("button", { name: "Arhivează", exact: true }),
  ).toBeDisabled();
  await archived
    .getByRole("button", {
      name: "De ce este indisponibil: Arhivează",
      exact: true,
    })
    .click();
  await expect(
    archived.getByText("Tichetul este deja arhivat.", { exact: true }),
  ).toBeVisible();
  await archived.close();
  checks++;
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
