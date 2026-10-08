import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { versionOf } from "../packages/fom-domain";

async function main() {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8189");
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9199");
  const uid = `shared-browser-${Date.now()}`, id = `${uid}-work`;
  const app = initializeApp({ projectId: "demo-fom-mobile-auth" }, uid), db = getFirestore(app);
  const email = `${uid}@fom.test`, password = "FomTest123!";
  await getAuth(app).createUser({ uid, email, password, displayName: uid });
  await db.doc(`users/${uid}`).set({ uid, email, displayName: uid, role: "tehnician" });
  await db.doc(`clienti/${uid}`).set({ nume: "Client browser comun", locatii: [{ id: "loc", nume: "Sediu comun", echipamente: [{ id: "eq", cod: "BROWSER-QR", denumire: "Unitate" }] }] });
  await db.doc(`lucrari/${id}`).set({ clientId: uid, client: "Client browser comun", locatie: "Sediu comun", locationId: "loc", echipamentCod: "BROWSER-QR", equipmentId: "eq", echipament: "Unitate", tipLucrare: "Intervenție", dataInterventie: new Date().toISOString().slice(0, 10), tehnicieni: [uid], statusLucrare: "În lucru", equipmentVerified: true, timpSosire: new Date(Date.now()-3600000).toISOString(), cauzaPrincipalaDefectId: "uzura", cauzaPrincipalaDefect: "Uzură", updatedAt: Timestamp.now() });
  const output = createWriteStream("/tmp/fom-unify-web-server.log");
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3102"], {
    env: { ...process.env, FOM_TEST_DIST_DIR: `.next/revision-ui-${uid}`, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_E2E_TEST_MODE: "false",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-fom-mobile-auth", NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key", NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo-fom-mobile-auth.firebaseapp.com", NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-fom-mobile-auth.appspot.com",
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_PORT: "9199", NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT: "8189", NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_PORT: "9198",
      FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9198", MAIL_TRANSPORT_MODE: "disabled", APP_DEPLOYMENT_ENV: "emulator",
      SENTRY_AUTH_TOKEN: "", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "", SENTRY_DISABLE_AUTO_UPLOAD: "true",
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(output); server.stderr.pipe(output);
  const base = "http://localhost:3102";
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${base}/login`)).ok) break; } catch {}
    if (i === 59 || server.exitCode !== null) { server.kill(); throw new Error("Local test server did not start."); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(async ({svg}) => {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas=document.createElement("canvas");canvas.width=720;canvas.height=720;
      const image=new Image();image.src=`data:image/svg+xml;base64,${btoa(svg)}`;await image.decode();
      const ctx=canvas.getContext("2d")!;ctx.fillStyle="white";ctx.fillRect(0,0,720,720);ctx.drawImage(image,40,40,640,640);
      const stream=canvas.captureStream(10);const timer=setInterval(()=>ctx.drawImage(image,40,40,640,640),100);
      stream.getTracks()[0].addEventListener("ended",()=>clearInterval(timer));return stream;
    };
  },{svg:renderToStaticMarkup(createElement(QRCodeSVG,{value:"REVQR1",size:640,marginSize:4,level:"H",xmlns:"http://www.w3.org/2000/svg"}))});
  const page = await context.newPage();
  page.on("response", async response => {
    if(response.url().endsWith("/api/technician/commands") && response.status() === 409) {
      const command=response.request().postDataJSON();
      console.error("Command conflict",command.action,command.baseVersion,versionOf((await db.doc(`lucrari/${command.entityId}`).get()).data() || {}));
    }
  });
  page.on("console", message => { if (message.type() === "error") console.error("Browser console:", message.text().slice(0, 250)); });
  const runtimeErrors:string[]=[];
  page.on("pageerror", error => { runtimeErrors.push(error.message); console.error("Browser page error:", error.message) });
  try {
    await page.goto(`${base}/login`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Parolă", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Autentificare", exact: true }).click();
    await page.waitForURL("**/dashboard**", { timeout: 60000, waitUntil: "domcontentloaded" });
    const root=`${uid}-root`, revisionId=`${uid}-revision`;
    await db.doc(`clienti/${uid}`).update({locatii:[{id:"loc",nume:"Sediu comun",echipamente:[{id:"eq",cod:"REVQR1",denumire:"Unitate",dynamicSettings:{"revision.checklistParentId":` ${root} `}}]}]});
    for(const [node,data] of [[root,{name:"Fișă revizie",type:"category"}],[`${root}-cat`,{name:"Categorie mixtă",type:"category",parentId:root}],[`${root}-point`,{name:"Punct vizibil",type:"variable",parentId:`${root}-cat`}],[`${root}-hidden`,{name:"Subcategorie",type:"category",parentId:`${root}-cat`}],[`${root}-hidden-point`,{name:"Punct ascuns",type:"variable",parentId:`${root}-hidden`}]] as const) await db.doc(`settings/${node}`).set(data);
    const common={clientId:uid,client:"Client browser comun",locationId:"loc",locatie:"Sediu comun",equipmentIds:["eq"],echipamentCod:"REVQR1",tehnicieni:[uid],technicianIds:[uid],statusLucrare:"Atribuită",dataInterventie:new Date().toISOString().slice(0,10),updatedAt:Timestamp.now()};
    await db.doc(`lucrari/${revisionId}`).set({...common,tipLucrare:"Revizie",revision:{equipmentStatus:{eq:"pending"},equipment:[{equipmentId:"eq",equipmentName:"Unitate"}]}});
    const legacyPhoto={path:`revisions/${revisionId}/eq/legacy.png`,url:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=",createdAt:Timestamp.fromMillis(1720000000123),fileName:"legacy.png"};
    await db.doc(`lucrari/${revisionId}/revisions/eq`).set({sections:[],photos:[legacyPhoto]});
    await page.goto(`${base}/dashboard/lucrari/${revisionId}/revizie/eq`);
    await page.getByRole("button",{name:"Scanează QR Code",exact:true}).click();
    await expect(page.getByText("Punct vizibil",{exact:true}).first()).toBeVisible({timeout:30000});
    await expect(page.getByRole("dialog")).toHaveCount(0,{timeout:30000});
    await expect(page.getByText("Punct ascuns",{exact:true})).toHaveCount(0);
    await page.getByRole("checkbox").first().check();
    await page.locator('input[type="file"]').first().setInputFiles({name:"control.png",mimeType:"image/png",buffer:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=","base64")});
    await page.getByLabel("Observații",{exact:true}).fill("Observații păstrate după eroare");
    await page.route("**/api/technician/commands",route=>route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({error:"Eroare API simulată",kind:"blocked"})}));
    await page.getByRole("button",{name:"Salvează",exact:true}).click();
    await expect(page.getByText(/Eroare API simulată/).first()).toBeVisible();
    await expect(page.getByLabel("Observații",{exact:true})).toHaveValue("Observații păstrate după eroare");
    await page.unroute("**/api/technician/commands");
    await page.getByRole("button",{name:"Salvează",exact:true}).click();
    await expect.poll(async()=>(await db.doc(`lucrari/${revisionId}/revisions/eq`).get()).data()?.finalObservations).toBe("Observații păstrate după eroare");
    const photos=(await db.doc(`lucrari/${revisionId}/revisions/eq`).get()).data()!.photos;
    assert.equal(photos.length,2);assert.deepEqual(photos[0],legacyPhoto);assert.ok(photos[1].id);
    await page.goto(`${base}/dashboard/lucrari/${revisionId}/revizie/eq`);
    await expect(page.getByRole("checkbox").first()).toBeChecked();
    await expect(page.getByLabel("Observații",{exact:true})).toHaveValue("Observații păstrate după eroare");
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:"/private/tmp/fom-revision-fix-mobile.png",fullPage:true});
    // A fresh sheet keeps edits if the template changes, and asks for reload.
    const changedId=`${uid}-changed`;
    await db.doc(`lucrari/${changedId}`).set({...common,tipLucrare:"Revizie",revision:{equipmentStatus:{eq:"in_progress"}},revisionEquipmentTimes:{eq:{startIso:new Date().toISOString(),verifiedAt:new Date().toISOString()}}});
    await db.doc(`lucrari/${changedId}/revisions/eq`).set({qrVerified:true,sections:[]});
    await page.goto(`${base}/dashboard/lucrari/${changedId}/revizie/eq`);
    await page.getByRole("checkbox").first().check();
    await page.getByLabel("Observații",{exact:true}).fill("Nu pierde textul");
    await db.doc(`settings/${root}-new`).set({name:"Punct nou",type:"variable",parentId:`${root}-cat`});
    await expect(page.getByText(/Checklistul a fost actualizat/)).toBeVisible();
    await expect(page.getByLabel("Observații",{exact:true})).toHaveValue("Nu pierde textul");
    // Draft save on an unchanged template remains available.
    await page.reload();
    await page.getByRole("checkbox").first().check();
    await page.getByLabel("Observații",{exact:true}).fill("Ciornă reală");
    await page.getByRole("button",{name:"Înapoi la lucrare",exact:true}).click();
    await page.getByRole("button",{name:"Salvează și ieși",exact:true}).click();
    await expect.poll(async()=>(await db.doc(`lucrari/${changedId}/revisions/eq`).get()).data()?.finalObservations).toBe("Ciornă reală");
    for(const mode of (process.env.FOM_REVISION_ONLY === "true" ? [] : ["save","finalize","later"])){
      const paidId=`${uid}-paid-${mode}`;
      await db.doc(`lucrari/${paidId}`).set({...common,tipLucrare:"Intervenție contra cost",statusLucrare:"În lucru",equipmentVerified:true,timpSosire:new Date(Date.now()-3600000).toISOString(),cauzaPrincipalaDefectId:"uzura",cauzaPrincipalaDefect:"Uzură"});
      await page.goto(`${base}/raport/${paidId}`);
      await page.getByLabel("Constatarea la locație *",{exact:true}).fill(`Diagnostic ${mode}`);
      await page.getByLabel("Descrierea intervenției *",{exact:true}).fill(`Reparație ${mode}`);
      if(mode==="save"){
        await page.route("**/api/technician/commands",route=>route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:"Salvare indisponibilă",kind:"blocked"})}));
        await page.getByRole("button",{name:"Salvează intervenția",exact:true}).click();
        await expect(page.getByText("Salvare indisponibilă",{exact:true})).toBeVisible();
        await expect(page.getByLabel("Descrierea intervenției *",{exact:true})).toHaveValue("Reparație save");
        await page.unroute("**/api/technician/commands");
        await page.getByRole("button",{name:"Salvează intervenția",exact:true}).click();
        await expect.poll(async()=>(await db.doc(`lucrari/${paidId}`).get()).data()?.descriereInterventie).toBe("Reparație save");
        await page.reload();await expect(page.getByLabel("Descrierea intervenției *",{exact:true})).toHaveValue("Reparație save");
      }else{
        await page.getByLabel("Nume și prenume beneficiar",{exact:true}).fill("Beneficiar test");
        await page.getByRole("button",{name: mode==="later" ? "Semnează mai târziu" : "Finalizează și Trimite Raport",exact:true}).click();
        await expect.poll(async()=>(await db.doc(`lucrari/${paidId}`).get()).data()?.descriereInterventie).toBe(`Reparație ${mode}`);
        const saved=(await db.doc(`lucrari/${paidId}`).get()).data()!;
        if(mode==="finalize") {
          assert.equal(saved.raportSnapshot.constatareLaLocatie,"Diagnostic finalize");
          const {servicePdf}=await import("../lib/technician/documents");
          const pdfPath="/private/tmp/fom-paid-report-fix.pdf";
          writeFileSync(pdfPath,await servicePdf(db,{...saved,id:paidId}));
          const text=execFileSync("pdftotext",[pdfPath,"-"],{encoding:"utf8"});
          assert.match(text,/Diagnostic finalize/);
          assert.match(text,/Repara.*finalize/);
        }
        else assert.equal(saved.statusLucrare,"Fără semnătură");
      }
    }
    assert.deepEqual(runtimeErrors,[]);
    console.log("PASS browser: real revision QR -> legacy and new photos -> checks -> errors/retry -> saved data; template edits preserve input." + (process.env.FOM_REVISION_ONLY === "true" ? "" : " Paid report save/finalize/later."));
  } catch (error) {
    await page.screenshot({ path: "/tmp/fom-unify-web-failure.png", fullPage: true });
    console.error("Browser URL:", page.url(), "Visible page:", (await page.locator("body").innerText()).slice(-2500));
    throw error;
  } finally {
    await context.close(); await browser.close(); server.kill("SIGTERM"); output.end(); await deleteApp(app);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
