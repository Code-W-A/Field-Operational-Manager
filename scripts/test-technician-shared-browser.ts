import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

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
    env: { ...process.env, FOM_TEST_DIST_DIR: ".next/technician-ui-test", NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_E2E_TEST_MODE: "false",
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
  const page = await context.newPage();
  page.on("console", message => { if (message.type() === "error") console.error("Browser console:", message.text().slice(0, 250)); });
  page.on("pageerror", error => console.error("Browser page error:", error.message));
  try {
    await page.goto(`${base}/login`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Parolă", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Autentificare", exact: true }).click();
    await page.waitForURL("**/dashboard**", { timeout: 60000, waitUntil: "domcontentloaded" });
    await page.goto(`${base}/dashboard/lucrari/${id}`);
    const interventionTab = page.getByRole("tab", { name: /Intervenție/ });
    await interventionTab.click({ timeout: 60000 });
    await page.getByLabel("Constatare la locație", { exact: true }).fill("Diagnostic din browser web");
    await page.getByLabel("Descriere intervenție", { exact: true }).fill("Reparație prin serviciul comun");
    const ids: string[] = [];
    let loseResponse = true;
    await page.route("**/api/technician/commands", async route => {
      const body = route.request().postDataJSON();
      ids.push(body.mutationId);
      if (loseResponse) {
        loseResponse = false;
        const response = await route.fetch();
        assert.equal(response.status(), 200, await response.text());
        await route.abort("failed"); // Server committed, browser never receives confirmation.
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    await expect(page.getByRole("button", { name: "Salvează", exact: true })).toBeEnabled();
    await expect.poll(async () => (await db.doc(`lucrari/${id}`).get()).data()?.descriereInterventie).toBe("Reparație prin serviciul comun");
    await page.getByRole("button", { name: "Salvează", exact: true }).click();
    await expect(page.getByText("Datele au fost salvate cu succes.", { exact: true })).toBeVisible();
    assert.equal(ids.length, 2);
    assert.equal(ids[0], ids[1], "Lost response must retry the exact original mutation");
    assert.equal((await db.collection("mobileCommands").where("uid", "==", uid).get()).docs.filter(d => JSON.parse(d.data().fingerprint).action === "intervention.save").length, 1);
    const receipt = (await db.doc(`mobileCommands/${uid}_${ids[0]}`).get()).data()!;
    assert.equal(receipt.result.work.constatareLaLocatie, "Diagnostic din browser web");
    await page.screenshot({ path: "/tmp/fom-unify-web.png", fullPage: true });
    console.log("PASS browser: web form -> shared API -> canonical Firestore; lost response retries one receipt.");
  } catch (error) {
    await page.screenshot({ path: "/tmp/fom-unify-web-failure.png", fullPage: true });
    console.error("Browser URL:", page.url(), "Visible page:", (await page.locator("body").innerText()).slice(-2500));
    throw error;
  } finally {
    await context.close(); await browser.close(); server.kill("SIGTERM"); output.end(); await deleteApp(app);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
