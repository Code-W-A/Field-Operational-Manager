import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { writeFileSync, createWriteStream } from "node:fs"
import { initializeApp, deleteApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { chromium, expect, type Page } from "@playwright/test"
import { installationService } from "../lib/installations/service"

async function main() {
const projectId = "demo-fom-installation"
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/)
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^(127\.0\.0\.1|localhost):\d+$/)
const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` }, "installation-browser")
const db = getFirestore(app)
const auth = getAuth(app)
const password = "InstallationDemo123!"
for (const [uid, role, displayName] of [["browser-tech", "tehnician", "Tehnician browser"], ["browser-admin", "admin", "Admin browser"]]) {
  await auth.createUser({ uid, email: `${uid}@example.invalid`, password, displayName })
  await db.collection("users").doc(uid).set({ uid, email: `${uid}@example.invalid`, displayName, role })
}
await db.collection("clienti").doc("browser-client").set({ nume: "Client browser", cui: "ROTEST", adresa: "Adresă test", persoaneContact: [], locatii: [{ id: "browser-location", nume: "Locație browser", adresa: "Adresă locație", persoaneContact: [{ id: "browser-contact", nume: "Beneficiar browser", telefon: "0700000000", email: "beneficiar@example.invalid" }], echipamente: [{ id: "browser-equipment", nume: "Server browser", cod: "BROWSER1", model: "Test" }, { id: "browser-equipment2", nume: "Cameră browser", cod: "BROWSER2", model: "Test" }] }] })
const manager = { uid: "browser-admin", role: "admin" }
const tech = { uid: "browser-tech", role: "tehnician" }
const service = installationService(db)
const input = { clientId: "browser-client", locationId: "browser-location", contactId: "browser-contact", client: "Client browser", locatie: "Locație browser", persoanaContact: "Beneficiar browser", telefon: "0700000000", persoanaContactEmail: "beneficiar@example.invalid", equipmentIds: ["browser-equipment"], tehnicieni: ["Tehnician browser"], nrLucrare: "#000999", dataEmiterii: "03.10.2026 10:00", dataInterventie: "03.10.2026 10:00", descriere: "Instalare test" }
const work = await service.create(manager, input, "browser-installation")
const started = await service.start(tech, work.id, { equipmentId: "browser-equipment", qrRaw: "BROWSER1", requestId: "browser-sheet" })
const env = {
  ...process.env, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_E2E_TEST_MODE: "false",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`, NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app",
  SENTRY_DISABLE_AUTO_UPLOAD: "true", SENTRY_AUTH_TOKEN: "", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "",
}
const log = createWriteStream("/private/tmp/fom-installation-dev.log")
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3100"], { env, stdio: ["ignore", "pipe", "pipe"] })
server.stdout.pipe(log); server.stderr.pipe(log)
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  const origin = "http://127.0.0.1:3100"
  let ready = false
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${origin}/login`)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  assert.ok(ready, "Dev server did not start")
  // Mandatory dev-server gut check before functional browser work.
  for (const args of [["open", `${origin}/login`], ["snapshot", "-i"], ["screenshot", "/private/tmp/fom-installation-login.png"], ["eval", 'document.querySelector("[data-nextjs-dialog]") ? "ERROR_OVERLAY" : document.body.innerText.trim().length ? "HAS_CONTENT" : "BLANK"']]) {
    const result = spawnSync("agent-browser", ["--session", "fom-installation", ...args], { encoding: "utf8", timeout: 45000 })
    assert.equal(result.status, 0, result.stderr)
    assert.ok(!result.stdout.includes("ERROR_OVERLAY"))
    console.log(result.stdout.trim().slice(0, 1000))
  }
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()
  const errors: string[] = []
  page.on("pageerror", e => errors.push(e.message))
  async function login(p: Page, uid: string) {
    await p.goto(`${origin}/login`)
    await p.getByLabel("Email", { exact: true }).fill(`${uid}@example.invalid`)
    await p.getByLabel("Parolă", { exact: true }).fill(password)
    await p.getByRole("button", { name: "Autentificare", exact: true }).click()
    await p.waitForURL(/dashboard/, { timeout: 90000 })
  }
  await login(page, "browser-tech")
  await page.goto(`${origin}/dashboard/lucrari/${work.id}/instalare?sheetId=${started.sheet.id}`)
  await page.getByLabel("Constatare la locație *", { exact: true }).fill("Locație pregătită pentru instalare.")
  await page.getByLabel("Operațiuni executate *", { exact: true }).fill("Montaj server și verificare conexiuni.")
  await page.getByLabel("Notă internă — nu apare în PDF").fill("NOTA INTERNA BROWSER")
  await page.getByRole("button", { name: "Salvează ciorna", exact: true }).click()
  await expect(page.getByRole("status").filter({ hasText: "Ciorna a fost salvată" })).toBeVisible()
  await page.getByLabel("Fotografii (0/4)", { exact: true }).setInputFiles({ name: "montaj.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII=", "base64") })
  await expect(page.getByLabel("Fotografii (1/4)", { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole("img", { name: "montaj.jpg" })).toBeVisible()
  await page.reload()
  await expect(page.getByLabel("Constatare la locație *", { exact: true })).toHaveValue("Locație pregătită pentru instalare.", { timeout: 30000 })
  assert.equal((await db.collection("lucrari").doc(work.id).collection("installationSheets").get()).size, 1)
  await page.getByLabel("Statusul instalării").selectOption("completed")
  await page.getByLabel("Numele beneficiarului *", { exact: true }).fill("Beneficiar browser")
  async function drawSignatures(p: Page) {
    const canvases = p.locator("canvas")
    await expect(canvases).toHaveCount(2)
    for (let i = 0; i < 2; i++) {
      await canvases.first().scrollIntoViewIfNeeded()
      const bounds = await canvases.first().boundingBox(); assert.ok(bounds)
      await p.mouse.move(bounds.x + 20, bounds.y + 30); await p.mouse.down()
      await p.mouse.move(bounds.x + 95, bounds.y + 60, { steps: 12 }); await p.mouse.move(bounds.x + 140, bounds.y + 25, { steps: 12 }); await p.mouse.up()
      await p.getByRole("button", { name: "Salvează semnătura", exact: true }).first().click()
    }
  }
  await drawSignatures(page)
  await page.getByRole("button", { name: "Închide fișa zilei", exact: true }).click()
  await expect(page.getByText("Fișă semnată · Finalizat", { exact: true })).toBeVisible({ timeout: 30000 })
  const saved = (await db.collection("lucrari").doc(work.id).collection("installationSheets").doc(started.sheet.id).get()).data()!
  assert.equal(saved.state, "closed")
  assert.ok(!JSON.stringify(saved.documentSnapshot).includes("NOTA INTERNA BROWSER"))
  const downloadEvent = page.waitForEvent("download")
  await page.getByRole("button", { name: "Descarcă PDF", exact: true }).first().click()
  const download = await downloadEvent
  await download.saveAs("/private/tmp/fom-installation-sheet.pdf")
  await page.getByRole("button", { name: "Proces-verbal de terminare", exact: true }).click()
  await page.getByLabel("Observații finale", { exact: true }).fill("Predat beneficiarului.")
  await page.getByLabel("Numele beneficiarului *", { exact: true }).fill("Beneficiar browser")
  await drawSignatures(page)
  await page.getByRole("button", { name: "Semnează și finalizează lucrarea", exact: true }).click()
  await expect(page.getByRole("button", { name: "Descarcă procesul-verbal final", exact: true })).toBeVisible({ timeout: 30000 })
  const finalDownload = page.waitForEvent("download")
  await page.getByRole("button", { name: "Descarcă procesul-verbal final", exact: true }).click()
  await (await finalDownload).saveAs("/private/tmp/fom-installation-completion.pdf")
  await page.screenshot({ path: "/private/tmp/fom-installation-completed.png", fullPage: true })
  await page.goto(`${origin}/dashboard/lucrari/${work.id}`)
  await expect(page.getByText("Instalare — fișe de montaj", { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole("button", { name: "Descarcă procesul-verbal final", exact: true })).toBeVisible()
  assert.equal((await db.collection("lucrari").doc(work.id).get()).data()?.statusLucrare, "Finalizat")
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  await adminPage.route("**/api/notifications/**", route => route.fulfill({ status: 200, contentType: "application/json", body: '{"success":true}' }))
  await login(adminPage, "browser-admin")
  await adminPage.goto(`${origin}/dashboard/lucrari/new`)
  await adminPage.locator("#tipLucrare").click()
  await adminPage.getByRole("option", { name: "Instalare", exact: true }).click()
  await expect(adminPage.getByText("Echipamente pentru instalare", { exact: true })).toBeVisible()
  assert.equal(await adminPage.locator("#echipament").count(), 0)
  console.log("BROWSER PASS: dispatcher creation form exposes installation multiple equipment selector.")
  assert.deepEqual(errors, [])
  console.log("BROWSER PASS: authenticated draft save/reload, photo upload, signatures, daily PDF, final document/PDF, detail page, no runtime errors.")
  writeFileSync("/private/tmp/fom-installation-browser-result.json", JSON.stringify({ passed: true, errors, workId: work.id, sheetId: started.sheet.id }, null, 2))
} catch (error) {
  const failedPage = browser?.contexts().flatMap(context => context.pages())[0]
  if (failedPage) { console.log("FAILED PAGE", failedPage.url(), (await failedPage.locator("body").innerText()).slice(0, 2000)); await failedPage.screenshot({ path: "/private/tmp/fom-installation-browser-failure.png", fullPage: true }) }
  console.error(error)
  throw error
} finally {
  await browser?.close()
  spawnSync("agent-browser", ["--session", "fom-installation", "close"], { timeout: 10000 })
  server.kill("SIGTERM"); log.end()
  await db.terminate(); await deleteApp(app)
}

}
void main().catch(error => { console.error(error); process.exitCode = 1 })
