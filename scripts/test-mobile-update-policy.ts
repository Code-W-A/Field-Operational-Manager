/** Isolated demo emulators. Exercises the real verified-role helper, API wiring and Firestore rules. */
import assert from "node:assert/strict"
import { mkdtemp, writeFile, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { build } from "esbuild"
import { initializeApp, deleteApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { chromium, expect } from "@playwright/test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const projectId = "demo-fom-update-policy"
const firestoreHost = "127.0.0.1:8397", authHost = "127.0.0.1:9397"

async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const directory = await mkdtemp(path.join(tmpdir(), "fom-update-policy-emulators-"))
    const config = path.join(directory, "firebase.json")
    await writeFile(config, JSON.stringify({
      firestore: { rules: path.join(root, "firestore.rules") },
      emulators: { firestore: { host: "127.0.0.1", port: 8397 }, auth: { host: "127.0.0.1", port: 9397 }, hub: { port: 4497 }, logging: { port: 4597 }, ui: { enabled: false } },
    }))
    const child = spawn("firebase", ["emulators:exec", "--config", config, "--project", projectId, "--only", "auth,firestore",
      `"${path.join(root, "node_modules/.bin/tsx")}" --tsconfig "${path.join(root, "tsconfig.json")}" "${fileURLToPath(import.meta.url)}"`], {
      cwd: directory, stdio: "inherit",
      env: { ...process.env, DEBUG: "", GCLOUD_PROJECT: projectId, FIREBASE_EMULATORS_PATH: path.join(root, ".firebase-emulators") },
    })
    process.exitCode = await new Promise<number>((resolve, reject) => { child.on("error", reject); child.on("exit", code => resolve(code ?? 1)) })
    return
  }
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, firestoreHost)
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, authHost)
  assert.equal(process.env.GCLOUD_PROJECT, projectId)
  const app = initializeApp({ projectId }, "update-policy-test")
  const db = getFirestore(app), auth = getAuth(app)
  const globals = globalThis as typeof globalThis & { __updateDb?: unknown; __updateAuth?: unknown; __updateCookies?: Record<string, string> }
  globals.__updateDb = db; globals.__updateAuth = auth; globals.__updateCookies = {}
  try {
    const tokens: Record<string, string> = {}
    for (const role of ["admin", "tehnician", "client"]) {
      await auth.createUser({ uid: role, email: `${role}@update.test`, password: "UpdateTest123!" })
      await db.doc(`users/${role}`).set({ role })
      const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fixture`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `${role}@update.test`, password: "UpdateTest123!", returnSecureToken: true }),
      })
      tokens[role] = (await response.json()).idToken
      assert.ok(tokens[role])
    }
    const directory = await mkdtemp(path.join(tmpdir(), "fom-update-policy-api-"))
    await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"))
    const outfile = path.join(directory, "server.cjs")
    await build({ entryPoints: [path.join(root, "lib/mobile-update/server.ts")], outfile, platform: "node", format: "cjs", bundle: true, packages: "external", tsconfig: path.join(root, "tsconfig.json"), plugins: [{ name: "isolated-emulator-context", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/firebase\/admin$/ }, () => ({ path: "admin", namespace: "fixture" }))
      builder.onResolve({ filter: /^next\/headers$/ }, () => ({ path: "cookies", namespace: "fixture" }))
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "admin"
        ? "export const adminDb = globalThis.__updateDb; export const adminAuth = globalThis.__updateAuth;"
        : "export const cookies = async () => ({ get: key => globalThis.__updateCookies[key] ? { value: globalThis.__updateCookies[key] } : undefined });", loader: "js" }))
    } }] })
    const { updatePolicyHandlers: api } = createRequire(outfile)(outfile)
    const policy = { enabled: true, minimumAndroidVersionCode: 3, message: "Actualizează aplicația." }
    const request = (role?: string, data: unknown = policy) => new Request("http://localhost/api/admin/mobile-update-policy", {
      method: "PUT", headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}) }, body: JSON.stringify(data),
    })
    assert.equal((await (await api.publicGet()).json()).enabled, false)
    assert.equal((await db.doc("mobileUpdatePolicies/android").get()).exists, false)
    assert.equal((await api.adminGet(request())).status, 401)
    assert.equal((await api.adminPut(request())).status, 401)
    globals.__updateCookies = { userRole: "admin" }
    assert.equal((await api.adminPut(request())).status, 401)
    globals.__updateCookies = {}
    for (const role of ["tehnician", "client"]) {
      assert.equal((await api.adminGet(request(role))).status, 403)
      assert.equal((await api.adminPut(request(role))).status, 403)
    }
    assert.equal((await api.adminPut(request("admin", { ...policy, minimumAndroidVersionCode: -1 }))).status, 400)
    assert.equal((await api.adminPut(request("admin"))).status, 200)
    const stored = (await db.doc("mobileUpdatePolicies/android").get()).data()!
    assert.equal(stored.updatedBy, "admin")
    assert.ok(stored.updatedAt.toMillis() > 0)
    assert.deepEqual(await (await api.publicGet()).json(), policy)
    assert.deepEqual(await (await api.adminGet(request("admin"))).json(), policy)
    // Direct client writes must be denied even to an authenticated administrator.
    const firestoreUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/mobileUpdatePolicies/android`
    for (const role of [undefined, "admin", "tehnician", "client"]) {
      const headers: Record<string, string> = role ? { Authorization: `Bearer ${tokens[role]}` } : {}
      assert.equal((await fetch(firestoreUrl, { headers })).status, 403)
      assert.equal((await fetch(firestoreUrl, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ fields: { enabled: { booleanValue: false } } }) })).status, 403)
    }
    assert.equal((await api.adminPut(request("admin", { ...policy, enabled: false }))).status, 200)
    assert.equal((await (await api.publicGet()).json()).enabled, false)
    console.log("PASS: real Auth/Firestore emulators, verified admin API, cookie forgery rejection, audit metadata, public response, direct Firestore denial and disabling.")

    const ui = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MobileAppTab} from './components/settings/mobile-app-tab'; createRoot(document.getElementById('root')).render(<MobileAppTab/>);`, resolveDir: root, loader: "tsx" },
      bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: path.join(root, "tsconfig.json"),
      plugins: [{ name: "admin-test-identity", setup(builder) {
        builder.onResolve({ filter: /^@\/contexts\/AuthContext$/ }, () => ({ path: "auth", namespace: "ui-fixture" }))
        builder.onLoad({ filter: /.*/, namespace: "ui-fixture" }, () => ({ contents: "const user = {getIdToken: async()=>window.testToken}; export const useAuth = ()=>({user});", loader: "js" }))
      } }],
    })
    const server = createServer(async (req, res) => {
      try {
        if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); res.end(ui.outputFiles[0].text); return }
        if (req.url === "/api/admin/mobile-update-policy") {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(Buffer.from(chunk))
          const httpRequest = new Request("http://localhost/api/admin/mobile-update-policy", {
            method: req.method, headers: req.headers as Record<string, string>,
            ...(req.method === "PUT" ? { body: Buffer.concat(chunks).toString() } : {}),
          })
          const response = await (req.method === "PUT" ? api.adminPut(httpRequest) : api.adminGet(httpRequest))
          res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text()); return
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8")
        res.end('<!doctype html><html lang="ro"><meta charset="utf-8"><div id="root"></div><script src="/bundle.js"></script></html>')
      } catch { res.writeHead(500); res.end("test server error") }
    })
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
    try {
      browser = await chromium.launch({ headless: true, channel: "chrome" })
      const page = await browser.newPage()
      const errors: string[] = []
      page.on("pageerror", error => errors.push(error.message))
      await page.addInitScript(token => { (window as unknown as { testToken: string }).testToken = token }, tokens.admin)
      const address = server.address() as { port: number }
      await page.goto(`http://127.0.0.1:${address.port}`)
      const toggle = page.getByRole("switch", { name: "Actualizare obligatorie Android" })
      await expect(toggle).toBeEnabled()
      await expect(toggle).not.toBeChecked()
      await page.getByLabel("Build minim acceptat (versionCode)").fill("4")
      await page.getByLabel("Mesaj", { exact: true }).fill("Versiune nouă pentru teren.")
      await toggle.click()
      await page.getByRole("button", { name: "Salvează", exact: true }).click()
      await expect(page.getByRole("status")).toHaveText("Setările au fost salvate.")
      const saved = (await db.doc("mobileUpdatePolicies/android").get()).data()!
      assert.equal(saved.minimumAndroidVersionCode, 4); assert.equal(saved.enabled, true)
      await page.reload()
      await expect(page.getByLabel("Mesaj", { exact: true })).toHaveValue("Versiune nouă pentru teren.")
      await expect(toggle).toBeChecked()
      await toggle.click()
      await page.getByRole("button", { name: "Salvează", exact: true }).click()
      await expect(page.getByRole("status")).toHaveText("Setările au fost salvate.")
      assert.equal((await (await api.publicGet()).json()).enabled, false)
      await page.route("**/api/admin/mobile-update-policy", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Server indisponibil." }) }))
      await page.getByRole("button", { name: "Reîncarcă setările" }).click()
      await expect(page.getByRole("alert")).toHaveText("Server indisponibil.")
      await expect(page.getByRole("button", { name: "Salvează", exact: true })).toBeDisabled()
      await page.unroute("**/api/admin/mobile-update-policy")
      await page.getByRole("button", { name: "Reîncarcă setările" }).click()
      await expect(page.getByRole("button", { name: "Salvează", exact: true })).toBeEnabled()
      assert.deepEqual(errors, [])
      console.log("PASS: real settings component in Chromium → verified API → demo Firestore: load, enable, save, reload, disable, read error and retry.")
    } finally {
      await browser?.close()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  } finally {
    delete globals.__updateDb; delete globals.__updateAuth; delete globals.__updateCookies
    await deleteApp(app)
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
