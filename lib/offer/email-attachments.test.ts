import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { NextRequest } from "next/server"
import { completeOffer } from "@/lib/crm/offer-test-fixture"
import { parseOfferAttachments, validateOfferFile, validateOfferEmailSize } from "./email-attachments"
const context = { kind: "crm", id: "opportunity-test" }
const state = { actor: "staff", records: {} as Record<string, any>, objects: {} as Record<string, Buffer>, mails: [] as any[] }
;(globalThis as any).__offerAttachments = state
const mocks: Record<string, string> = {
  "@/lib/auth/require-role": `export class RequireRoleError extends Error { status = 401 }; export async function requireRole() { if (!globalThis.__offerAttachments.actor) throw new RequireRoleError('Autentificare necesară'); return { uid: globalThis.__offerAttachments.actor, role: 'admin' } }; export const requireVerifiedRole = requireRole;`,
  "@/lib/firebase/admin": `export const adminApp = {}; export const adminDb = { collection(name) {
    const s = globalThis.__offerAttachments;
    const q = { where() { return q }, limit() { return q }, orderBy() { return q }, async get() { return { docs: [], empty: true } } };
    return { ...q, async add() {}, doc(id = 'generated-offer') { const key = name + '/' + id; return { id,
      async get() { const data = s.records[key]; return { exists: !!data, data: () => data } },
      async create(data) { s.records[key] = data }, async update(data) { s.records[key] = { ...s.records[key], ...data } },
      async set(data) { s.records[key] = { ...s.records[key], ...data } }
    } } }
  } };`,
  "firebase-admin/storage": `export function getStorage() { return { bucket() { return { file(path) { return {
    async getMetadata() { const s = globalThis.__offerAttachments; if (!s.objects[path]) throw new Error('missing'); const record = Object.values(s.records).find(r => r.path === path); return [{ size: s.objects[path].length, contentType: record.contentType, generation: '1' }] },
    async download() { const bytes = globalThis.__offerAttachments.objects[path]; if (!bytes) throw new Error('missing'); return [bytes] }
  } } } } } }`,
  "@/lib/email/send-invite-style-email.server": `export class InviteStyleEmailSendError extends Error {}; export async function sendInviteStyleEmail(mail) { globalThis.__offerAttachments.mails.push(mail); return { messageId: 'simulated', emailEventId: 'simulated' } }`,
  "@/lib/email/email-events.server": `export async function logEmailEventServer() {}`,
  "@/lib/offer/offer-events.server": `export async function logOfferEvent() {}`,
  "@/lib/offer/portal-audit": `export async function logOfferPortalEvent() {}`,
  "@/lib/email/from": `export function getEmailFrom() { return 'staff@example.test' }`,
  "@/lib/firebase/firestore-index-hint.server": `export function logFirestoreIndexHintIfPresent() {}`,
}
async function load(path: string): Promise<any> {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "isolated", setup(b) {
    b.onResolve({ filter: /^(?:@\/lib\/|firebase-admin\/storage$)/ }, ({ path }) => mocks[path] ? { path, namespace: "mock" } : undefined)
    b.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], loader: "js" }))
  } }] })
  const module = { exports: {} }
  new Function("require", "module", "exports", result.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports)
  return module.exports
}
const server = load("lib/offer/email-attachments.server.ts")
const uploadRoute = load("app/api/offer/attachments/route.ts")
const crmIssue = load("app/api/crm/offers/issue/route.ts")
const crmDraft = load("app/api/crm/offers/route.ts")
const ticketSend = load("app/api/users/invite/route.ts")
function reset() {
  state.actor = "staff"; state.objects = {}; state.mails = []
  state.records = { "crm_opportunities/opportunity-test": { ownerId: "staff", pipelineStage: "OFERTA_TRANSMISA", opportunityType: "OFERTE" }, "lucrari/ticket-test": {}, "users/staff": { email: "staff@example.test" } }
}
function request(body: unknown) { return new NextRequest("https://example.test/api/offer/attachments", { method: "POST", body: JSON.stringify(body) }) }
async function uploaded(ctx = context, name = "Fișă tehnică.pdf", bytes = Buffer.from("%PDF sample")) {
  const api = await server
  const permit = await api.initiateOfferAttachment(ctx, "staff", name, bytes.length)
  state.objects[permit.path] = bytes
  return api.finalizeOfferAttachment(ctx, "staff", permit.id)
}
test("formats, names, limits, duplicates and legacy empty lists", () => {
  assert.deepEqual(parseOfferAttachments(undefined), [])
  for (const name of ["Fișă tehnică.PDF", "desen.dwg", "plan.dxf", "document.docx", "date.xlsx", "arhivă.zip"]) assert.ok(validateOfferFile(name, 1))
  for (const name of ["x.exe", "../x.pdf", "x\r\n.pdf", "x.__proto__", "pdf", "x.constructor"]) assert.throws(() => validateOfferFile(name, 1))
  for (const size of [0, -1, 10_000_001, 1.5]) assert.throws(() => validateOfferFile("x.pdf", size))
  const file = { id: "sample-id", filename: "x.pdf", size: 1 }
  assert.throws(() => parseOfferAttachments([file, file]))
  assert.throws(() => parseOfferAttachments(Array.from({ length: 11 }, (_, i) => ({ ...file, id: `sample-${i}` }))))
  assert.throws(() => validateOfferEmailSize([{ size: 10_000_000 }], 5_000_001))
  validateOfferEmailSize([{ size: 10_000_000 }], 5_000_000)
})
test("authenticated upload lifecycle rejects strangers, unfinished objects and another context", async () => {
  reset(); const route = await uploadRoute; const api = await server
  state.actor = ""
  assert.equal((await route.POST(request({ action: "initiate", context, filename: "a.pdf", size: 8 }))).status, 401)
  state.actor = "other"
  assert.equal((await route.POST(request({ action: "initiate", context, filename: "a.pdf", size: 8 }))).status, 403)
  state.actor = "staff"
  const response = await route.POST(request({ action: "initiate", context, filename: "a.pdf", size: 8 }))
  assert.equal(response.status, 200)
  const permit = await response.json()
  await assert.rejects(api.resolveOfferAttachments(context, [permit]), /finalizată/)
  state.objects[permit.path] = Buffer.from("wrong")
  assert.equal((await route.POST(request({ action: "finalize", context, id: permit.id }))).status, 400)
  state.objects[permit.path] = Buffer.from("12345678")
  assert.equal((await route.POST(request({ action: "finalize", context, id: permit.id }))).status, 200)
  await assert.rejects(api.resolveOfferAttachments({ kind: "ticket", id: "ticket-test" }, [permit]), /nu aparține/)
  const resolved = await api.resolveOfferAttachments(context, [{ ...permit, size: 1, filename: "spoof.pdf" }])
  assert.equal(resolved[0].size, 8); assert.equal(resolved[0].filename, "a.pdf")
})
test("CRM draft round trip, removal and actual issue route attach original bytes alongside PDF", async () => {
  reset(); const attachment = await uploaded(); const input = { ...completeOffer(), opportunityId: context.id, emailAttachments: [attachment] }
  const draft = await crmDraft
  assert.equal((await draft.POST(request(input))).status, 200)
  assert.deepEqual(state.records["crm_offers/generated-offer"].emailAttachments, [attachment])
  assert.equal((await draft.POST(request({ ...input, offerId: "generated-offer", emailAttachments: [] }))).status, 200)
  assert.deepEqual(state.records["crm_offers/generated-offer"].emailAttachments, [])
  const result = await (await crmIssue).POST(request({ ...input, draftOfferId: "generated-offer" }))
  assert.equal(result.status, 200, JSON.stringify(await result.json()))
  assert.equal(state.mails.length, 1)
  assert.equal(state.mails[0].attachments.length, 2)
  assert.equal(state.mails[0].attachments[1].filename, "Fișă tehnică.pdf")
  assert.equal(state.mails[0].attachments[1].content.toString(), "%PDF sample")
  assert.deepEqual(state.records["crm_offers/generated-offer"].emailAttachments, [attachment])
})
test("ticket send resolves the saved snapshot attachments and blocks missing files/PDF", async () => {
  reset(); const ctx = { kind: "ticket", id: "ticket-test" }
  const attachment = await uploaded(ctx, "desen.dwg", Buffer.from("CAD bytes"))
  state.records["lucrari/ticket-test"].offerActionSnapshot = { products: [{ name: "Motor", um: "buc", quantity: 1, price: 100 }], conditions: ["Plata: avans", "Livrare: 2 zile", "Instalare: 1 zi"], vat: 21, adjustmentPercent: 0, emailAttachments: [attachment] }
  const body = { lucrareId: "ticket-test", type: "OFFER", to: ["client@example.test"], subject: "Oferta", attachments: [{ filename: "oferta.pdf", content: Buffer.from("%PDF test").toString("base64") }] }
  const route = await ticketSend
  assert.equal((await route.POST(request(body))).status, 200)
  assert.equal(state.mails[0].attachments[1].content.toString(), "CAD bytes")
  state.mails = []
  assert.equal((await route.POST(request({ ...body, attachments: [] }))).status, 400)
  state.objects = {}
  assert.equal((await route.POST(request(body))).status, 400)
  assert.equal(state.mails.length, 0)
})
test("CRM refuses foreign attachments, missing files and an absent PDF before sending", async () => {
  reset(); const file = await uploaded({ kind: "ticket", id: "ticket-test" })
  const input = { ...completeOffer(), opportunityId: context.id, emailAttachments: [file] }
  const route = await crmIssue
  assert.equal((await route.POST(request(input))).status, 403)
  assert.equal((await route.POST(request({ ...input, emailAttachments: [], attachmentBase64: "" }))).status, 400)
  const own = await uploaded(); state.objects = {}
  assert.equal((await route.POST(request({ ...input, emailAttachments: [own] }))).status, 400)
  assert.equal(state.mails.length, 0)
})
