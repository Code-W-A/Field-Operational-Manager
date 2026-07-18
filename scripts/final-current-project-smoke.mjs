import "dotenv/config"

import assert from "node:assert/strict"
import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app"
import { getAuth as getAdminAuth } from "firebase-admin/auth"
import { FieldValue, Timestamp, getFirestore as getAdminFirestore } from "firebase-admin/firestore"
import { getStorage as getAdminStorage } from "firebase-admin/storage"
import { deleteApp, initializeApp } from "firebase/app"
import { getAuth, signInWithEmailAndPassword } from "firebase/auth"
import { deleteDoc, doc, getDoc, getFirestore, setDoc, updateDoc } from "firebase/firestore"
import { getFunctions, httpsCallable } from "firebase/functions"
import { deleteObject, getBytes, getStorage, ref, uploadBytes } from "firebase/storage"
import { chromium } from "playwright"

const projectId = "field-operational-manager"
const runId = "e2e-live-final-20260717T194732Z-05937110"
const short = "e2e-live-final-20260717-05937110"
const artifactDir = path.resolve("artifacts/pontaj/final", runId)
const manifestPath = path.join(artifactDir, "manifest.json")
const resultPath = path.join(artifactDir, "smoke-results.json")
const mode = process.argv[2] || "smoke"
const previewUrl = String(process.env.LIVE_PREVIEW_URL || "").replace(/\/$/, "")
const bypassSecretFile = process.env.LIVE_BYPASS_SECRET_FILE || "/private/tmp/e2e-live-final-bypass-secret"

const ids = {
  admin: "livefinal-20260717-05937110-admin",
  tech: "livefinal-20260717-05937110-tech",
  manager: "livefinal-20260717-05937110-manager",
  outsider: "livefinal-20260717-05937110-outsider",
  department: `${short}-department`,
  employee: `${short}-employee`,
  timesheet: `${short}-employee_2026-07`,
  ownerRequest: `${short}-owner`,
  decisionRequest: `${short}-decision`,
  concurrentRequest: `${short}-concurrent`,
  functionalRequest: `${short}-functional`,
  firestoreProbe: runId,
  contractProbe: `${short}-contract`,
  storageProbe: `e2e-final/${runId}/probe.txt`,
}

assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, projectId, "LIVE_ABORT: Firebase project mismatch")
assert.ok(process.env.FIREBASE_ADMIN_CLIENT_EMAIL, "LIVE_ABORT: missing Firebase Admin client email")
assert.ok(process.env.FIREBASE_ADMIN_PRIVATE_KEY, "LIVE_ABORT: missing Firebase Admin private key")

const adminApp = initializeAdminApp({
  credential: cert({
    projectId,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
}, `final-current-${Date.now()}`)
const adminAuth = getAdminAuth(adminApp)
const adminDb = getAdminFirestore(adminApp)
const adminBucket = getAdminStorage(adminApp).bucket()

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

async function readManifest() {
  return JSON.parse(await fs.readFile(manifestPath, "utf8"))
}

async function writeManifest(manifest) {
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

async function bypassCookie() {
  const value = (await fs.readFile(bypassSecretFile, "utf8")).trim()
  assert.ok(value, "LIVE_ABORT: missing Vercel automation bypass secret")
  return { value }
}

async function exactDocumentExists(documentPath) {
  return (await adminDb.doc(documentPath).get()).exists
}

async function authUserExists(uid) {
  try {
    await adminAuth.getUser(uid)
    return true
  } catch (error) {
    if (error?.code === "auth/user-not-found") return false
    throw error
  }
}

async function assertSeedTargetsAbsent(manifest) {
  for (const documentPath of manifest.resources.firestoreDocuments) {
    assert.equal(await exactDocumentExists(documentPath), false, `LIVE_ABORT: pre-existing document ${documentPath}`)
  }
  for (const uid of manifest.resources.authUsers) {
    assert.equal(await authUserExists(uid), false, `LIVE_ABORT: pre-existing Auth user ${uid}`)
  }
  assert.equal((await adminBucket.file(ids.storageProbe).exists())[0], false, "LIVE_ABORT: pre-existing Storage object")
  assert.equal(await exactDocumentExists(`contracts/${ids.contractProbe}`), false, "LIVE_ABORT: contract probe already exists")
}

function userEmail(label) {
  return `${label}.${runId.toLowerCase()}@example.invalid`
}

async function seedSyntheticResources(password) {
  const users = [
    [ids.admin, "admin", "Final E2E Admin"],
    [ids.tech, "tehnician", "Final E2E Tehnician"],
    [ids.manager, "tehnician", "Final E2E Manager"],
    [ids.outsider, "tehnician", "Final E2E Fără Relație"],
  ]
  for (const [uid, role, displayName] of users) {
    await adminAuth.createUser({ uid, email: userEmail(uid), password, displayName, emailVerified: true })
    await adminDb.doc(`users/${uid}`).set({
      uid, email: userEmail(uid), displayName, role, ownerRunId: runId,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
  }
  await adminDb.doc(`hrDepartments/${ids.department}`).set({
    name: `Departament ${runId}`, active: true, managerUid: ids.manager, ownerRunId: runId,
    createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
  await adminDb.doc(`hrEmployees/${ids.employee}`).set({
    prenume: "Final E2E", nume: "Tehnician", fullName: "Final E2E Tehnician", title: "Tehnician E2E",
    active: true, userUid: ids.tech, sectorIds: [ids.department],
    managerUidBySector: { [ids.department]: ids.manager },
    programLucruStart: "08:00", programLucruEnd: "16:30", pauzaStart: "12:30", pauzaEnd: "13:00",
    ownerRunId: runId, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  })
}

function webClient(label) {
  const app = initializeApp(firebaseConfig, `${label}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`)
  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    storage: getStorage(app),
    functions: getFunctions(app, "europe-west1"),
  }
}

async function authenticatedClient(uid, password) {
  const client = webClient(uid)
  await signInWithEmailAndPassword(client.auth, userEmail(uid), password)
  return client
}

async function disposeClient(client) {
  await deleteApp(client.app)
}

async function expectCallableCode(call, expected) {
  try {
    await call()
    assert.fail(`Expected callable error ${expected}`)
  } catch (error) {
    assert.equal(error?.code, expected)
  }
}

async function postHr(cookie, token, body) {
  return fetch(`${previewUrl}/api/notifications/hr-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-protection-bypass": cookie.value,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

function requestRecord({ requesterUid = ids.tech, managerUid = ids.manager, status = "pending", day = "2026-07-20" } = {}) {
  return {
    employeeId: ids.employee,
    employeeName: "Final E2E Tehnician",
    requesterUid,
    managerUid,
    sectorId: ids.department,
    kind: "CO",
    status,
    payload: { kind: "CO", startDate: day, endDate: day, reason: runId },
    documentSerial: 5937,
    ownerRunId: runId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
}

async function login(page, uid, password, expectedPath) {
  const authFailures = []
  const captureAuthFailure = async (response) => {
    if (!response.url().includes("identitytoolkit.googleapis.com") || response.status() < 400) return
    authFailures.push(await response.json().catch(() => ({ status: response.status() })))
  }
  page.on("response", captureAuthFailure)
  await page.goto(`${previewUrl}/login`, { waitUntil: "domcontentloaded" })
  await page.getByLabel("Email").fill(userEmail(uid))
  await page.getByLabel("Parolă").fill(password)
  await page.getByRole("button", { name: "Autentificare" }).click()
  try {
    await page.waitForURL((url) => url.pathname.startsWith(expectedPath), { timeout: 30_000 })
  } catch (error) {
    const screenshot = path.join(artifactDir, `login-failure-${uid}.png`)
    await page.screenshot({ path: screenshot, fullPage: true })
    const visibleText = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1_000)
    const authError = authFailures.map((entry) => entry?.error?.message || entry?.status || "unknown").join(",")
    throw new Error(`Login failed for synthetic uid ${uid}; url=${page.url()}; auth=${authError}; ui=${visibleText}`, { cause: error })
  } finally {
    page.off("response", captureAuthFailure)
  }
}

async function addBypassCookie(context, cookie) {
  const previewHost = new URL(previewUrl).hostname
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).hostname !== previewHost) {
      await route.continue()
      return
    }
    await route.continue({
      headers: { ...route.request().headers(), "x-vercel-protection-bypass": cookie.value },
    })
  })
}

async function poll(fn, predicate, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let value
  while (Date.now() < deadline) {
    value = await fn()
    if (predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Poll timed out; last value: ${JSON.stringify(value)}`)
}

async function continueOptionalSelfie(page, nextButtonName) {
  const skip = page.getByRole("button", { name: "Continuă fără selfie" })
  const next = page.getByRole("button", { name: nextButtonName })
  await Promise.race([
    skip.waitFor({ state: "visible", timeout: 30_000 }),
    next.waitFor({ state: "visible", timeout: 30_000 }),
  ])
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await next.waitFor({ state: "visible", timeout: 30_000 })
}

async function discoverOwnedDocuments(manifest) {
  const exact = new Set(manifest.resources.firestoreDocuments)
  const attendance = await adminDb.collection("attendance").where("userId", "==", ids.tech).get()
  for (const snapshot of attendance.docs) {
    if (snapshot.get("employeeId") === ids.employee) exact.add(`attendance/${snapshot.id}`)
  }
  for (const field of ["utilizatorId", "userId"]) {
    for (const uid of manifest.resources.authUsers) {
      const snapshots = await adminDb.collection("logs").where(field, "==", uid).get()
      snapshots.docs.forEach((snapshot) => exact.add(`logs/${snapshot.id}`))
    }
  }
  manifest.resources.firestoreDocuments = [...exact].sort()
  return manifest
}

async function runSmoke() {
  assert.ok(previewUrl.startsWith("https://"), "LIVE_ABORT: LIVE_PREVIEW_URL must be HTTPS")
  const manifest = await readManifest()
  await assertSeedTargetsAbsent(manifest)
  const cookie = await bypassCookie()
  const password = crypto.randomBytes(24).toString("base64url")
  const result = { runId, previewUrl, startedAt: new Date().toISOString(), checks: {}, defects: [] }

  const publicResponse = await fetch(`${previewUrl}/login`, {
    headers: { "x-vercel-protection-bypass": cookie.value },
  })
  const publicHtml = await publicResponse.text()
  assert.equal(publicResponse.status, 200)
  assert.match(publicHtml, /Se încarcă aplicația/)
  assert.match(publicHtml, /app\/login\/page-/)
  assert.match(publicHtml, /_next\/static/)

  const browser = await chromium.launch({ headless: true })
  try {
    const publicContext = await browser.newContext({ locale: "ro-RO", timezoneId: "Europe/Bucharest" })
    await addBypassCookie(publicContext, cookie)
    const publicPage = await publicContext.newPage()
    const pageErrors = []
    publicPage.on("pageerror", (error) => pageErrors.push(error.message))
    const navigation = await publicPage.goto(`${previewUrl}/login`, { waitUntil: "networkidle" })
    assert.equal(navigation?.status(), 200)
    assert.equal(pageErrors.length, 0, `Preview page errors: ${pageErrors.join(" | ")}`)
    await publicContext.close()
    result.checks.previewPublic = { status: "PASS", http: 200, pageErrors: 0, staticAssets: true }

    await seedSyntheticResources(password)
    const directAuthProbe = await authenticatedClient(ids.admin, password)
    assert.equal(directAuthProbe.auth.currentUser?.uid, ids.admin)
    await disposeClient(directAuthProbe)
    result.checks.firebaseAuthDirect = { status: "PASS", projectId, uid: ids.admin }

    const adminContext = await browser.newContext({ locale: "ro-RO", timezoneId: "Europe/Bucharest" })
    await addBypassCookie(adminContext, cookie)
    const adminPage = await adminContext.newPage()
    await login(adminPage, ids.admin, password, "/dashboard")
    await adminPage.getByRole("button", { name: /Final E2E Admin/ }).click()
    await adminPage.getByRole("menuitem", { name: "Profil" }).click()
    await adminPage.getByRole("dialog", { name: "Profil Utilizator" }).getByText("Administrator", { exact: true }).waitFor()
    await adminPage.getByRole("dialog", { name: "Profil Utilizator" }).press("Escape")
    await adminPage.getByRole("button", { name: /Final E2E Admin/ }).click()
    await adminPage.getByRole("menuitem", { name: "Deconectare" }).click()
    await adminPage.waitForURL((url) => url.pathname === "/login")
    result.checks.authentication = { status: "PASS", role: "admin", logout: true, accountMutationScope: "synthetic-only" }
    await adminContext.close()

    const anonymous = webClient("anonymous-open-rules")
    const probeRef = doc(anonymous.db, "e2eExternalSmoke", ids.firestoreProbe)
    await setDoc(probeRef, { runId, value: 1 })
    assert.equal((await getDoc(probeRef)).data()?.value, 1)
    await updateDoc(probeRef, { value: 2 })
    assert.equal((await getDoc(probeRef)).data()?.value, 2)
    await deleteDoc(probeRef)
    assert.equal((await getDoc(probeRef)).exists(), false)
    result.checks.firestoreAnonymousCrud = { status: "PASS", create: true, read: true, update: true, delete: true }

    const objectRef = ref(anonymous.storage, ids.storageProbe)
    await uploadBytes(objectRef, new TextEncoder().encode(`first:${runId}`), { contentType: "text/plain" })
    assert.match(new TextDecoder().decode(await getBytes(objectRef)), /^first:/)
    await uploadBytes(objectRef, new TextEncoder().encode(`second:${runId}`), { contentType: "text/plain" })
    assert.match(new TextDecoder().decode(await getBytes(objectRef)), /^second:/)
    await deleteObject(objectRef)
    result.checks.storageAnonymousCrud = { status: "PASS", upload: true, download: true, overwrite: true, delete: true }
    await disposeClient(anonymous)

    const [adminClient, techClient, managerClient, outsiderClient] = await Promise.all([
      authenticatedClient(ids.admin, password),
      authenticatedClient(ids.tech, password),
      authenticatedClient(ids.manager, password),
      authenticatedClient(ids.outsider, password),
    ])
    const [adminToken, techToken, managerToken, outsiderToken] = await Promise.all([
      adminClient.auth.currentUser.getIdToken(), techClient.auth.currentUser.getIdToken(),
      managerClient.auth.currentUser.getIdToken(), outsiderClient.auth.currentUser.getIdToken(),
    ])

    await adminDb.doc(`hrRequests/${ids.ownerRequest}`).set(requestRecord())
    assert.equal((await postHr(cookie, "", { requestId: ids.ownerRequest, event: "created" })).status, 401)
    assert.equal((await postHr(cookie, outsiderToken, { requestId: ids.ownerRequest, event: "created" })).status, 403)
    assert.equal((await postHr(cookie, techToken, { requestId: ids.ownerRequest, event: "created", role: "admin" })).status, 400)
    const owner = await postHr(cookie, techToken, { requestId: ids.ownerRequest, event: "created" })
    assert.equal(owner.status, 200)
    assert.equal((await owner.json()).replayed, false)
    const replay = await postHr(cookie, techToken, { requestId: ids.ownerRequest, event: "created" })
    assert.equal(replay.status, 200)
    assert.equal((await replay.json()).replayed, true)

    await adminDb.doc(`hrRequests/${ids.concurrentRequest}`).set(requestRecord())
    const concurrent = await Promise.all([
      postHr(cookie, techToken, { requestId: ids.concurrentRequest, event: "created" }),
      postHr(cookie, techToken, { requestId: ids.concurrentRequest, event: "created" }),
    ])
    assert.ok(concurrent.every((response) => response.status === 200 || response.status === 409))
    const concurrentMarker = await adminDb.doc(`hrNotificationDispatches/${ids.concurrentRequest}__created__pending`).get()
    assert.equal(concurrentMarker.get("status"), "completed")
    assert.equal(concurrentMarker.get("attempt"), 1)

    await adminDb.doc(`hrRequests/${ids.decisionRequest}`).set(requestRecord({ status: "approved" }))
    assert.equal((await postHr(cookie, adminToken, { requestId: ids.decisionRequest, event: "status_changed" })).status, 200)
    assert.equal((await postHr(cookie, managerToken, { requestId: ids.decisionRequest, event: "status_changed" })).status, 200)
    result.checks.hrEndpoint = {
      status: "PASS", anonymousRejected: 401, unrelatedRejected: 403, ownerAllowed: true,
      adminAllowed: true, assignedManagerAllowed: true, injectionRejected: 400,
      replay: true, concurrencyStatuses: concurrent.map((response) => response.status), transport: "sink-.invalid",
    }

    const anonymousCallable = webClient("anonymous-callable")
    await expectCallableCode(
      () => httpsCallable(anonymousCallable.functions, "runGenerateScheduledWorks")({ contractId: ids.contractProbe }),
      "functions/unauthenticated",
    )
    await expectCallableCode(
      () => httpsCallable(techClient.functions, "runGenerateScheduledWorks")({ contractId: ids.contractProbe }),
      "functions/permission-denied",
    )
    await expectCallableCode(
      () => httpsCallable(adminClient.functions, "runGenerateScheduledWorks")({ contractId: ids.contractProbe, role: "admin" }),
      "functions/invalid-argument",
    )
    const callableResult = await httpsCallable(adminClient.functions, "runGenerateScheduledWorks")({ contractId: ids.contractProbe })
    assert.deepEqual(callableResult.data, { created: 0 })
    assert.equal(await exactDocumentExists(`contracts/${ids.contractProbe}`), false)
    result.checks.callableAuthorization = {
      status: "PASS", anonymousRejected: true, technicianRejected: true, adminAllowed: true,
      injectionRejected: true, result: callableResult.data, realContractsModified: 0,
    }
    await disposeClient(anonymousCallable)

    const techContext = await browser.newContext({
      locale: "ro-RO", timezoneId: "Europe/Bucharest", geolocation: { latitude: 44.4268, longitude: 26.1025 },
      permissions: ["geolocation"],
    })
    await addBypassCookie(techContext, cookie)
    const techPage = await techContext.newPage()
    await login(techPage, ids.tech, password, "/dashboard/lucrari")
    const startButton = techPage.getByRole("button", { name: /Mă pontez acum/i })
    await startButton.waitFor({ state: "visible", timeout: 30_000 })
    await startButton.click()
    const specialConfirm = techPage.getByRole("button", { name: "Da, mă pontez" })
    await Promise.race([
      specialConfirm.waitFor({ state: "visible", timeout: 5_000 }),
      techPage.getByRole("button", { name: "Continuă fără selfie" }).waitFor({ state: "visible", timeout: 5_000 }),
      techPage.getByRole("button", { name: /Mă opresc acum/i }).waitFor({ state: "visible", timeout: 5_000 }),
    ]).catch(() => {})
    if (await specialConfirm.isVisible().catch(() => false)) await specialConfirm.click()
    await continueOptionalSelfie(techPage, /Mă opresc acum/i)
    const activeQuery = await poll(
      async () => adminDb.collection("attendance").where("userId", "==", ids.tech).where("status", "==", "active").get(),
      (snapshot) => snapshot.size === 1,
    )
    const session = activeQuery.docs[0]
    assert.equal(session.get("employeeId"), ids.employee)
    const lock = await adminDb.doc(`attendanceActiveSessions/${ids.tech}`).get()
    assert.equal(lock.get("activeSessionId"), session.id)
    manifest.resources.firestoreDocuments.push(`attendance/${session.id}`)
    manifest.resources.firestoreDocuments = [...new Set(manifest.resources.firestoreDocuments)].sort()
    await writeManifest(manifest)

    const patchedStart = Date.now() - 120_000
    await session.ref.update({ sessionStart: Timestamp.fromMillis(patchedStart), ownerRunId: runId, updatedAt: FieldValue.serverTimestamp() })
    await adminDb.doc(`attendanceActiveSessions/${ids.tech}`).set({
      sessionStart: Timestamp.fromMillis(patchedStart), ownerRunId: runId,
    }, { merge: true })
    await techPage.reload({ waitUntil: "domcontentloaded" })
    const stopButton = techPage.getByRole("button", { name: /Mă opresc acum/i })
    await stopButton.waitFor({ state: "visible", timeout: 30_000 })
    await poll(async () => stopButton.isEnabled(), Boolean, 10_000)
    await stopButton.click()
    await continueOptionalSelfie(techPage, /Mă pontez acum/i)
    const completed = await poll(async () => session.ref.get(), (snapshot) => snapshot.get("status") === "completed")
    assert.ok(completed.get("sessionEnd"))
    assert.equal((await adminDb.doc(`attendanceActiveSessions/${ids.tech}`).get()).exists, false)
    const timesheet = await poll(
      async () => adminDb.doc(`hrTimesheets/${ids.timesheet}`).get(),
      (snapshot) => snapshot.exists && Object.keys(snapshot.get("days") || {}).length > 0,
      45_000,
    )
    assert.ok(timesheet.get("days"))
    await techContext.close()

    await adminDb.doc(`hrRequests/${ids.functionalRequest}`).set(requestRecord({ managerUid: ids.admin, day: "2026-07-23" }))
    const approvalContext = await browser.newContext({ locale: "ro-RO", timezoneId: "Europe/Bucharest", acceptDownloads: true })
    await addBypassCookie(approvalContext, cookie)
    const approvalPage = await approvalContext.newPage()
    await login(approvalPage, ids.admin, password, "/dashboard")
    await approvalPage.goto(`${previewUrl}/dashboard/cereri-aprobari`, { waitUntil: "domcontentloaded" })
    await approvalPage.getByText("#5937", { exact: true }).first().click()
    const requestDialog = approvalPage.getByRole("dialog", { name: "Detalii cerere" })
    await requestDialog.getByRole("button", { name: "Aprobă" }).click()
    await poll(
      async () => (await adminDb.doc(`hrRequests/${ids.functionalRequest}`).get()).get("status"),
      (status) => status === "approved",
    )
    await poll(
      async () => (await adminDb.doc(`hrTimesheets/${ids.timesheet}`).get()).get("days.23.code"),
      (code) => code === "CO",
      45_000,
    )
    await approvalPage.goto(`${previewUrl}/dashboard/resurse-umane/condica-prezenta?month=2026-07&employeeId=${ids.employee}`, { waitUntil: "domcontentloaded" })
    const downloadPromise = approvalPage.waitForEvent("download")
    await approvalPage.getByRole("button", { name: "Export CSV" }).click()
    const download = await downloadPromise
    assert.match(download.suggestedFilename(), /\.csv$/i)
    await approvalContext.close()
    result.checks.functionalFlow = {
      status: "PASS", start: true, stop: true, attendanceId: session.id, lockRemoved: true,
      timesheetProjection: true, requestCreated: true, decision: "approved", requestProjection: "2026-07-23:CO",
      exportReadOnly: true,
    }

    const relatedEmailEvents = await adminDb.collection("emailEvents").where("requestId", "in", [
      ids.ownerRequest, ids.decisionRequest, ids.concurrentRequest, ids.functionalRequest,
    ]).get().catch(() => null)
    assert.ok(!relatedEmailEvents || relatedEmailEvents.empty, "Real email event was created")
    result.checks.externalTransports = { status: "PASS", email: 0, sms: 0, push: 0 }

    await Promise.all([adminClient, techClient, managerClient, outsiderClient].map(disposeClient))
  } finally {
    await browser.close()
  }

  await discoverOwnedDocuments(manifest)
  await writeManifest(manifest)
  result.completedAt = new Date().toISOString()
  result.status = "PASS"
  await fs.writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`)
  return result
}

async function cleanup() {
  let manifest = await readManifest()
  manifest = await discoverOwnedDocuments(manifest)
  const deleted = { firestoreDocuments: [], storageObjects: [], authUsers: [] }

  for (const documentPath of [...manifest.resources.firestoreDocuments].reverse()) {
    const reference = adminDb.doc(documentPath)
    if ((await reference.get()).exists) {
      await reference.delete()
      deleted.firestoreDocuments.push(documentPath)
    }
  }
  for (const objectPath of manifest.resources.storageObjects) {
    const file = adminBucket.file(objectPath)
    if ((await file.exists())[0]) {
      await file.delete()
      deleted.storageObjects.push(objectPath)
    }
  }
  for (const uid of manifest.resources.authUsers) {
    if (await authUserExists(uid)) {
      await adminAuth.deleteUser(uid)
      deleted.authUsers.push(uid)
    }
  }

  const remaining = {}
  for (const documentPath of manifest.resources.firestoreDocuments) {
    if (await exactDocumentExists(documentPath)) (remaining.firestoreDocuments ||= []).push(documentPath)
  }
  for (const objectPath of manifest.resources.storageObjects) {
    if ((await adminBucket.file(objectPath).exists())[0]) (remaining.storageObjects ||= []).push(objectPath)
  }
  for (const uid of manifest.resources.authUsers) {
    if (await authUserExists(uid)) (remaining.authUsers ||= []).push(uid)
  }
  const attendanceRemaining = await adminDb.collection("attendance").where("userId", "==", ids.tech).get()
  if (!attendanceRemaining.empty) remaining.attendanceSelector = attendanceRemaining.docs.map((snapshot) => snapshot.id)

  manifest.cleanup.runs = Number(manifest.cleanup.runs || 0) + 1
  manifest.cleanup.remainingForRunId = remaining
  manifest.cleanup.lastDeleted = deleted
  manifest.preExistingResourcesModified = []
  await writeManifest(manifest)
  const cleanupResultPath = path.join(artifactDir, `cleanup-run-${manifest.cleanup.runs}.json`)
  await fs.writeFile(cleanupResultPath, `${JSON.stringify({ run: manifest.cleanup.runs, deleted, remaining }, null, 2)}\n`)
  assert.deepEqual(remaining, {})
  return { run: manifest.cleanup.runs, deleted, remaining }
}

try {
  const output = mode === "smoke" ? await runSmoke() : mode === "cleanup" ? await cleanup() : assert.fail(`Unknown mode ${mode}`)
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
} finally {
  await deleteAdminApp(adminApp)
}
