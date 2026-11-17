import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { NextRequest } from "next/server"
import { completeOffer } from "@/lib/crm/offer-test-fixture"
import { parseOfferAttachments, validateOfferFile, validateOfferEmailSize } from "./email-attachments"
const context = { kind: "crm", id: "opportunity-test" }
const state = { actor: "staff", records: {} as Record<string, any>, objects: {} as Record<string, Buffer>, mails: [] as any[], mailFailure: false }
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
  "@/lib/email/send-invite-style-email.server": `export class InviteStyleEmailSendError extends Error {}; export async function sendInviteStyleEmail(mail) { if(globalThis.__offerAttachments.mailFailure) throw new Error('SMTP unavailable simulated'); globalThis.__offerAttachments.mails.push(mail); return { messageId: 'simulated', emailEventId: 'simulated' } }`,
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
  state.actor = "staff"; state.objects = {}; state.mails = []; state.mailFailure = false
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


test("exact count, file size and combined size boundaries accept limits and reject overflow", () => {
  const file = { id: "boundary-id", filename: "Limită.PDF", size: 10_000_000 };
  assert.equal(validateOfferFile(file.filename, file.size).size, 10_000_000);
  assert.equal(parseOfferAttachments(Array.from({ length: 10 }, (_, i) => ({ ...file, id: `boundary-${i}`, size: 1 }))).length, 10);
  validateOfferEmailSize([{ size: 10_000_000 }, { size: 4_999_999 }], 1);
  assert.throws(() => validateOfferEmailSize([{ size: 10_000_000 }, { size: 5_000_000 }], 1));
  for (const size of [NaN, Infinity, '5', null, Number.MAX_SAFE_INTEGER]) assert.throws(() => validateOfferFile('file.pdf', size));
  for (const name of ['', 'a'.repeat(197) + '.pdf', 'x\u0000.pdf', 'folder\\file.pdf']) assert.throws(() => validateOfferFile(name, 1));
  for (const name of ['image.jpg', 'image.jpeg', 'image.png', 'image.webp', 'image.gif', 'image.tif', 'image.tiff', 'image.bmp', 'word.doc', 'word.docx', 'table.xls', 'table.xlsx', 'plan.dwg', 'plan.dxf', 'all.zip']) assert.ok(validateOfferFile(name, 1).contentType);
});

test("context validation and authenticated download return original bytes and safe headers", async () => {
  reset(); const api = await server; const route = await uploadRoute;
  for (const value of [null, {}, {kind:'other', id:'valid'}, {kind:'crm', id:'../bad'}, {kind:'ticket', id:''}]) assert.throws(() => api.parseAttachmentContext(value));
  const file = await uploaded();
  const query = `https://example.test/api/offer/attachments?kind=crm&contextId=${context.id}&id=${file.id}`;
  let response = await route.GET(new NextRequest(query));
  assert.equal(response.status, 200);
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), '%PDF sample');
  assert.equal(response.headers.get('Content-Type'), 'application/pdf');
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.ok(response.headers.get('Content-Disposition').includes(encodeURIComponent(file.filename)));
  state.actor = '';
  assert.equal((await route.GET(new NextRequest(query))).status, 401);
  state.actor = 'other';
  assert.equal((await route.GET(new NextRequest(query))).status, 403);
  state.actor = 'staff'; state.objects = {};
  assert.equal((await route.GET(new NextRequest(query))).status, 400);
});

test("another user cannot finalize an upload and an unready upload cannot be read", async () => {
  reset(); const api = await server;
  const permit = await api.initiateOfferAttachment(context, 'staff', 'plan.dxf', 4);
  state.objects[permit.path] = Buffer.from('plan');
  await assert.rejects(api.finalizeOfferAttachment(context, 'other', permit.id), /acces/);
  await assert.rejects(api.readOfferAttachment(context, permit.id), /finalizată/);
  await api.finalizeOfferAttachment(context, 'staff', permit.id);
  assert.equal((await api.readOfferAttachment(context, permit.id)).content.toString(), 'plan');
});

test("server computes email total from registered sizes and leaves draft intact on overflow", async () => {
  reset(); const api = await server;
  const permit = await api.initiateOfferAttachment(context, 'staff', 'large.pdf', 10_000_000);
  Object.assign(state.records[`offerEmailAttachments/${permit.id}`], {ready:true,generation:'1'});
  const input = {...completeOffer(), opportunityId:context.id, emailAttachments:[permit]};
  assert.equal((await (await crmDraft).POST(request(input))).status, 200);
  const response = await (await crmIssue).POST(request({...input, draftOfferId:'generated-offer', emailAttachments:[{...permit,size:1}], attachmentBase64:Buffer.alloc(5_000_001).toString('base64')}));
  assert.equal(response.status, 400);
  assert.equal(state.mails.length, 0);
  assert.equal(state.records['crm_offers/generated-offer'].status, 'DRAFT');
  assert.equal(state.records['crm_offers/generated-offer'].emailAttachments[0].size, 10_000_000);
});

test("SMTP failure preserves saved CRM draft attachments and a retry sends them once", async () => {
  reset(); const attachment = await uploaded();
  const input = {...completeOffer(), opportunityId:context.id, emailAttachments:[attachment]};
  assert.equal((await (await crmDraft).POST(request(input))).status, 200);
  state.mailFailure = true;
  const issue = await crmIssue;
  const payload = {...input,draftOfferId:'generated-offer'};
  assert.equal((await issue.POST(request(payload))).status, 500);
  assert.equal(state.records['crm_offers/generated-offer'].status, 'DRAFT');
  assert.deepEqual(state.records['crm_offers/generated-offer'].emailAttachments, [attachment]);
  assert.equal(state.mails.length, 0);
  state.mailFailure = false;
  assert.equal((await issue.POST(request(payload))).status, 200);
  assert.equal(state.mails.length, 1);
  const nodemailer = createRequire(resolve('package.json'))('nodemailer');
  const transport = nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
  const result = await transport.sendMail({from:'sender@example.test',to:'client@example.test',subject:'Test local',text:'Ofertă',attachments:state.mails[0].attachments});
  const mime = result.message.toString();
  assert.match(mime, /multipart\/mixed/);
  assert.equal((mime.match(/Content-Disposition: attachment/g) || []).length, 2);
  assert.ok(mime.includes(Buffer.from('%PDF sample').toString('base64')));
  transport.close();
});
