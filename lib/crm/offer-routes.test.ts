import assert from "node:assert/strict"
import test from "node:test"
import { build } from "esbuild"
import { NextRequest } from "next/server"
import { createRequire } from "node:module"
import { join, resolve } from "node:path"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { completeOffer } from "./offer-test-fixture"

// Bundle the real route with in-memory adapters. No Firebase credentials or SMTP are loaded.
const state = { pdf: null as Buffer | null, reads: 0, writes: [] as any[], mails: [] as any[], stored: {} as Record<string, any> }
;(globalThis as any).__crmOfferRouteTest = state
const adapters: Record<string, string> = {
  "firebase-admin/storage": 'export function getStorage() { return { bucket() { return { file() { return { async save(buffer) { globalThis.__crmOfferRouteTest.pdf = buffer } } } } } } }',
  "@/lib/auth/require-role": 'export class RequireRoleError extends Error {} export async function requireRole() { return { uid: "staff-test" } }',
  "@/lib/firebase/admin": `export const adminApp = {}; export const adminDb = { collection(name) {
    const s = globalThis.__crmOfferRouteTest;
    const query = { where() { return query }, limit() { return query }, orderBy() { return query }, async get() { s.reads++; return { empty: true, docs: [] } } };
    return { ...query, doc(id = "offer-test") { return { id, async get() {
      s.reads++;
      const data = name === "users" ? { email: "staff@example.test" } : name === "crm_opportunities" ? { ownerId: "staff-test", pipelineStage: "OFERTA_TRANSMISA", opportunityType: "OFERTE" } : s.stored[id];
      return { exists: !!data, data: () => data };
    }, async set(value) { s.writes.push({ name, id, value }); s.stored[id] = { ...s.stored[id], ...value } } } },
    async add(value) { s.writes.push({ name, value }); return { id: "entry" } } };
  } };`,
  "@/lib/email/send-invite-style-email.server": 'export async function sendInviteStyleEmail(input) { globalThis.__crmOfferRouteTest.mails.push(input); return { messageId: "simulated" } }',
  "@/lib/email/from": 'export function getEmailFrom() { return "staff@example.test" }',
  "@/lib/offer/offer-events.server": 'export async function logOfferEvent() {}',
  "@/lib/firebase/firestore-index-hint.server": 'export function logFirestoreIndexHintIfPresent() {}',
}
const testRequire = createRequire(resolve("package.json"))
async function loadRoute(path: string): Promise<any> {
  const output = await build({
    entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "isolated-adapters", setup(builder) {
      builder.onResolve({ filter: /^(?:@\/lib\/|firebase-admin\/storage$)/ }, ({ path }) => adapters[path] ? { path, namespace: "test-adapter" } : undefined)
      builder.onLoad({ filter: /.*/, namespace: "test-adapter" }, ({ path }) => ({ contents: adapters[path], loader: "js" }))
    } }],
  })
  const module = { exports: {} }
  new Function("require", "module", "exports", output.outputFiles[0].text)(testRequire, module, module.exports)
  return module.exports
}
const issue = loadRoute("app/api/crm/offers/issue/route.ts")
const drafts = loadRoute("app/api/crm/offers/route.ts")
function request(input: unknown) {
  return new NextRequest("https://example.test/api/crm/offers/issue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) })
}
function reset() { state.reads = 0; state.writes = []; state.mails = []; state.stored = {} }

test("real issue route returns field errors before any data read, write or email", async () => {
  const route = await issue
  const cases: Array<[string, (input: any) => void]> = [
    ["subject", (i) => { i.subject = "  " }], ["message", (i) => { i.message = "" }],
    ["snapshot.validityText", (i) => { delete i.snapshot.validityText }],
    ["snapshot.comments", (i) => { i.snapshot.comments = "\n" }],
    ["snapshot.conditions", (i) => { i.snapshot.conditions = [" ", ""] }],
    ["snapshot.products", (i) => { i.snapshot.products = [] }],
    ["snapshot.products.0.um", (i) => { i.snapshot.products[0].um = "" }],
    ["snapshot.products.0.price", (i) => { i.snapshot.products[0].price = null }],
    ["snapshot.products.0.quantity", (i) => { i.snapshot.products[0].quantity = 0 }],
    ["snapshot.optionalProducts.0.name", (i) => { i.snapshot.optionalProducts = [{ name: "", price: 99 }] }],
  ]
  for (const [field, mutate] of cases) {
    reset()
    const input = completeOffer(); mutate(input)
    const response = await route.POST(request(input))
    assert.equal(response.status, 400, field)
    assert.ok((await response.json()).fieldErrors[field], field)
    assert.equal(state.reads, 0); assert.equal(state.writes.length, 0); assert.equal(state.mails.length, 0)
  }
})

test("real issue route stores validity and sends escaped HTML + plain text, with unchanged expiry", async () => {
  reset()
  const input = completeOffer()
  input.snapshot.validityText = '30 de zile <script>alert("test")</script> & condiții'
  input.snapshot.conditions.push("", "  ")
  const before = Date.now()
  const response = await (await issue).POST(request(input))
  assert.equal(response.status, 200, JSON.stringify(await response.json()))
  const offer = state.stored["offer-test"]
  assert.equal(offer.snapshot.validityText, input.snapshot.validityText)
  assert.deepEqual(offer.snapshot.conditions, ["Plata: conform contract"])
  assert.ok(offer.actionExpiresAt.getTime() >= before + 30 * 86400000)
  assert.ok(offer.actionExpiresAt.getTime() <= Date.now() + 30 * 86400000)
  assert.equal(state.mails.length, 1)
  assert.ok(state.mails[0].content.includes(`Valabilitatea ofertei: ${input.snapshot.validityText}`))
  assert.match(state.mails[0].html, /&lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt; &amp; condiții/)
  assert.ok(!state.mails[0].html.includes(input.snapshot.comments))
  assert.ok(!state.mails[0].content.includes(input.snapshot.comments))
})

test("real draft route accepts incomplete inputs and retains validity and missing price", async () => {
  reset()
  const input: any = completeOffer()
  input.subject = ""; input.message = ""; input.snapshot.comments = ""; input.snapshot.conditions = []
  input.snapshot.products[0].price = null
  const route = await drafts
  const response = await route.POST(request(input))
  assert.equal(response.status, 200, JSON.stringify(await response.json()))
  assert.equal(state.stored["offer-test"].snapshot.validityText, input.snapshot.validityText)
  assert.ok(Number.isNaN(state.stored["offer-test"].snapshot.products[0].price))
  assert.equal(state.mails.length, 0)
})


test("certified CRM PDF passes persisted validity through the real generator", async () => {
  const certified = await loadRoute("lib/offer/certified-pdf.server.ts")
  const input = completeOffer()
  await certified.generateCertifiedCrmOfferPdf({
    offerId: "offer-test", action: "accept",
    opportunity: { code: "OP.TEST", title: "Client Fictiv" },
    offer: { ...input, version: 1, response: { at: "2026-10-29T11:00:00Z", verifiedEmail: "client@example.test" } },
  })
  assert.ok(state.pdf)
  const dir = mkdtempSync(join(tmpdir(), "crm-certified-test-"))
  try {
    const file = join(dir, "certified.pdf")
    writeFileSync(file, state.pdf)
    const text = execFileSync("pdftotext", [file, "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
    assert.match(text, /Valabilitatea ofertei: 30 de zile de la emitere/)
    assert.match(text, /Dovada raspuns client/)
    assert.ok(!text.includes(input.snapshot.comments))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
