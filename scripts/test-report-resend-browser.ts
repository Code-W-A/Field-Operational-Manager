import assert from "node:assert/strict"
import { createServer } from "node:net"
import { spawn, spawnSync } from "node:child_process"
import { createWriteStream, writeFileSync, readFileSync } from "node:fs"
import { initializeApp, deleteApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { chromium, expect } from "@playwright/test"

async function main() {
  for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"]) assert.match(process.env[name] || "", /^(127\.0\.0\.1|localhost):\d+$/)
  const projectId = "demo-fom-resend"
  const app = initializeApp({ projectId }); const db = getFirestore(app); const adminAuth = getAuth(app)
  const password = "ReportTest123!"
  const tokens: Record<string, string> = {}
  for (const role of ["admin", "dispecer", "tehnician", "client"]) {
    const uid = `resend-${role}`; const email = `${uid}@example.invalid`
    try { await adminAuth.createUser({ uid, email, password }) } catch {}
    await db.collection("users").doc(uid).set({ uid, role, displayName: uid, email, active: true })
    const signed = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })
    tokens[role] = (await signed.json()).idToken; assert.ok(tokens[role])
  }
  const frozen = { clientSnapshot: { version: 1, clientId: "resend-client", client: "CLIENT FROZEN", locatie: "Locație frozen", persoanaContact: "Beneficiar", telefon: "0700000000", persoanaContactEmail: "old@example.invalid", clientInfo: { nume: "CLIENT FROZEN", cui: "ROTEST", rc: "", adresa: "Adresă frozen", locationName: "Locație frozen", locationAddress: "Adresă locație" } }, constatareLaLocatie: "CONSTATARE FROZEN", descriereInterventie: "OPERATIUNI FROZEN", timpPlecare: "2026-10-03T10:00:00Z", durataInterventie: "1 oră", products: [], numeTehnician: "Tehnician", numeBeneficiar: "Beneficiar" }
  const work = { clientId: "resend-client", locationId: "resend-location", client: "CLIENT FROZEN", locatie: "Locație frozen", persoanaContact: "Beneficiar", telefon: "0700000000", tipLucrare: "Intervenție", nrLucrare: "#009991", tehnicieni: ["resend-tehnician"], dataEmiterii: "03.10.2026 10:00", dataInterventie: "03.10.2026 10:00", statusLucrare: "Finalizat", statusFacturare: "Nefacturat", raportGenerat: true, raportDataLocked: true, raportSnapshot: frozen, constatareLaLocatie: "MODIFIED LIVE", descriereInterventie: "MODIFIED LIVE", updatedAt: "2026-10-03T10:00:00Z", timpSosire: "2026-10-03T09:00:00Z", timpPlecare: "2026-10-03T10:00:00Z" }
  await db.collection("clienti").doc("resend-client").set({ nume: "CLIENT ACTUAL", email: "main@example.invalid", locatii: [{ id: "resend-location", nume: "Locație actuală", email: "location@example.invalid", persoaneContact: [] }] })
  await db.collection("lucrari").doc("resend-work").set(work)
  await db.collection("lucrari").doc("resend-revision").set({ ...work, tipLucrare: "Revizie" })
  const accepted: { recipients: string[]; mime: string }[] = []; let rejectFailure = true
  // Loopback-only fake SMTP: records MIME, never forwards a message to external servers.
  const smtp = createServer(socket => {
    socket.setEncoding("utf8"); socket.write("220 localhost Test SMTP\r\n")
    let buffer = ""; let data = false; let mime = ""; let recipients: string[] = []
    socket.on("data", chunk => {
      buffer += chunk
      while (buffer.includes("\r\n")) {
        const index = buffer.indexOf("\r\n"); const line = buffer.slice(0, index); buffer = buffer.slice(index + 2)
        if (data) {
          if (line === ".") { accepted.push({ recipients: [...recipients], mime }); data = false; mime = ""; socket.write("250 Stored locally\r\n") }
          else mime += line + "\r\n"
        } else if (/^(EHLO|HELO)/i.test(line)) socket.write("250-localhost\r\n250 AUTH PLAIN\r\n")
        else if (/^AUTH/i.test(line)) socket.write("235 Authenticated\r\n")
        else if (/^MAIL FROM/i.test(line)) { recipients = []; socket.write("250 OK\r\n") }
        else if (/^RCPT TO/i.test(line)) { const recipient = line.match(/<([^>]+)>/)?.[1] || ""; if (rejectFailure && recipient === "fail@example.invalid") socket.write("550 Simulated failure\r\n"); else { recipients.push(recipient); socket.write("250 OK\r\n") } }
        else if (/^DATA/i.test(line)) { data = true; socket.write("354 Send data\r\n") }
        else if (/^QUIT/i.test(line)) { socket.end("221 Bye\r\n") }
        else socket.write("250 OK\r\n")
      }
    })
    socket.on("error", () => {})
  })
  await new Promise<void>(resolve => smtp.listen(0, "127.0.0.1", resolve))
  const smtpPort = (smtp.address() as { port: number }).port
  const env = { ...process.env, NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", NEXT_PUBLIC_E2E_TEST_MODE: "false", NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId, NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key", NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`, NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`, NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app", FOM_TEST_DIST_DIR: ".next/report-resend-test", EMAIL_SMTP_HOST: "127.0.0.1", EMAIL_HOST: "127.0.0.1", EMAIL_SMTP_PORT: String(smtpPort), EMAIL_SMTP_SECURE: "false", EMAIL_USER: "test@example.invalid", EMAIL_PASSWORD: "local-test", EMAIL_APPEND_TO_SENT: "false", SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_DSN: "", SENTRY_AUTH_TOKEN: "", SENTRY_DISABLE_AUTO_UPLOAD: "true" }
  const log = createWriteStream("/private/tmp/fom-resend-dev.log")
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3101"], { env, stdio: ["ignore", "pipe", "pipe"] }); server.stdout.pipe(log); server.stderr.pipe(log)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    const origin = "http://127.0.0.1:3101"
    let ready = false
    for (let i = 0; i < 90; i++) { try { if ((await fetch(`${origin}/login`)).ok) { ready = true; break } } catch {} await new Promise(resolve => setTimeout(resolve, 1000)) }
    assert.ok(ready)
    for (const args of [["open", `${origin}/login`], ["snapshot", "-i"], ["eval", 'document.querySelector("[data-nextjs-dialog]") ? "ERROR_OVERLAY" : document.body.innerText.trim().length ? "HAS_CONTENT" : "BLANK"']]) {
      const check = spawnSync("agent-browser", ["--session", "fom-resend", ...args], { encoding: "utf8", timeout: 45000 }); assert.equal(check.status, 0, check.stderr); assert.ok(!check.stdout.includes("ERROR_OVERLAY"))
    }
    const api = async (role: string, path: string, body?: FormData) => fetch(`${origin}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${tokens[role]}` }, body })
    const form = (emails: string[], id = "resend-work", ops = false) => { const data = new FormData(); data.set("recipientMode", "report-resend"); data.set("lucrareId", id); data.set("recipients", JSON.stringify(emails)); data.set("pdfFile", new File(["%PDF-1.4\nsimulated"], "report.pdf", { type: "application/pdf" })); if (ops) data.set("opsPdfFile", new File(["%PDF-1.4\noperations"], "ops.pdf", { type: "application/pdf" })); return data }
    for (const role of ["tehnician", "client"]) { assert.equal((await api(role, "/api/lucrari/resend-work/report-recipients")).status, 403); assert.equal((await api(role, "/api/send-email", form(["a@example.invalid"]))).status, 403) }
    const preview = await (await api("dispecer", "/api/lucrari/resend-work/report-recipients")).json(); assert.deepEqual(preview.emails, ["location@example.invalid", "main@example.invalid"])
    assert.equal((await api("admin", "/api/send-email", form([]))).status, 400)
    assert.equal((await api("admin", "/api/send-email", form(["bad"])) ).status, 400)
    assert.equal((await api("admin", "/api/send-email", form(["single@example.invalid"], "resend-revision"))).status, 400)
    assert.equal((await api("dispecer", "/api/send-email", form(["single@example.invalid"], "resend-revision", true))).status, 200)
    assert.ok(accepted[0].mime.includes("ops.pdf")); assert.deepEqual(accepted[0].recipients, ["single@example.invalid"])
    browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message))
    await page.goto(`${origin}/login`); await page.getByLabel("Email", { exact: true }).fill("resend-admin@example.invalid"); await page.getByLabel("Parolă", { exact: true }).fill(password); await page.getByRole("button", { name: "Autentificare", exact: true }).click(); await page.waitForURL(/dashboard/, { timeout: 90000 })
    await page.goto(`${origin}/dashboard/lucrari/resend-work`)
    await page.getByRole("button", { name: "Retrimite raportul", exact: true }).click()
    await expect(page.getByLabel("Destinatari", { exact: true })).toHaveValue("location@example.invalid\nmain@example.invalid", { timeout: 45000 })
    const before = (await db.collection("lucrari").doc("resend-work").get()).data()!
    await page.getByLabel("Destinatari", { exact: true }).fill("chosen@example.invalid\nfail@example.invalid")
    let posted = 0; page.on("request", req => { if (req.url().endsWith("/api/send-email")) posted++ })
    await page.getByRole("button", { name: "Trimite raportul", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
    await expect(page.getByText("Trimis către: chosen@example.invalid", { exact: true })).toBeVisible({ timeout: 90000 })
    assert.equal(posted, 1)
    const captured = accepted.find(message => message.recipients.includes("chosen@example.invalid"))!; assert.ok(captured)
    const part = captured.mime.split(/\r\n--[^\r\n]+/).find(part => part.includes("Content-Type: application/pdf"))!; assert.ok(part)
    const pdf = Buffer.from(part.split("\r\n\r\n")[1].trim(), "base64"); assert.ok(pdf.toString("ascii", 0, 5) === "%PDF-")
    writeFileSync("/private/tmp/fom-resend-report.pdf", pdf)
    assert.equal(spawnSync("pdftotext", ["/private/tmp/fom-resend-report.pdf", "/private/tmp/fom-resend-report.txt"]).status, 0)
    const pdfText = readFileSync("/private/tmp/fom-resend-report.txt", "utf8")
    assert.ok(pdfText.includes("009991") && pdfText.includes("CONSTATARE FROZEN") && pdfText.includes("OPERATIUNI FROZEN") && !pdfText.includes("MODIFIED LIVE"))
    await expect(page.getByLabel("Destinatari", { exact: true })).toHaveValue("fail@example.invalid")
    rejectFailure = false
    await page.getByRole("button", { name: "Retrimite la adresele eșuate", exact: true }).click()
    await expect(page.getByText("Trimis către: fail@example.invalid", { exact: true })).toBeVisible({ timeout: 90000 })
    const after = (await db.collection("lucrari").doc("resend-work").get()).data()!
    const { lastReportEmail: ignoredBefore, ...preservedBefore } = before; const { lastReportEmail: last, ...preservedAfter } = after
    assert.deepEqual(preservedAfter, preservedBefore)
    assert.equal((await db.collection("numarRaport").get()).size, 0)
    assert.equal(last.actorUid, "resend-admin"); assert.deepEqual(last.sent, ["fail@example.invalid"])
    assert.equal(accepted.filter(message => message.recipients.includes("chosen@example.invalid")).length, 1)
    assert.ok(accepted.every(message => message.recipients.length === 1))
    await page.screenshot({ path: "/private/tmp/fom-resend-completed.png", fullPage: true }); assert.deepEqual(errors, [])
    console.log("PASS: verified roles, exact current addresses, invalid addresses, required revision attachments, separate fake SMTP deliveries, partial result/failed-only retry, frozen PDF and unchanged report.")
  } finally { await browser?.close(); spawnSync("agent-browser", ["--session", "fom-resend", "close"], { timeout: 10000 }); server.kill("SIGTERM"); log.end(); await new Promise<void>(resolve => smtp.close(() => resolve())); await db.terminate(); await deleteApp(app) }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
