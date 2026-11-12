import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { build } from "esbuild"
import { NextRequest } from "next/server"

const clone = <T>(value: T): T => structuredClone(value)
const state = {
  rows: new Map<string, any>(), mails: [] as any[], events: [] as any[],
  smtpFailure: false, failFlow: "", pdfFailure: false, inTransaction: false,
  tail: Promise.resolve(), afterCommit: undefined as (() => void) | undefined,
}
;(globalThis as any).__offerAcceptanceTest = state
function patchRow(key: string, patch: Record<string, any>) {
  const row = state.rows.get(key) || {}
  for (const [field, value] of Object.entries(patch)) {
    const parts = field.split(".")
    let target = row
    for (const part of parts.slice(0, -1)) target = target[part] ||= {}
    target[parts.at(-1)!] = clone(value)
  }
  state.rows.set(key, row)
}
const db = {
  collection(name: string) {
    function query(filters: Array<[string, unknown]> = []): any {
      return {
        where(field: string, _operator: string, value: unknown) { return query([...filters, [field, value]]) },
        async get() {
          return { docs: [...state.rows.entries()].filter(([key, value]) => key.startsWith(name + "/") &&
            filters.every(([field, expected]) => value[field] === expected))
            .map(([key, value]) => ({ id: key.split("/").at(-1), data: () => clone(value) })) }
        },
        async add(value: any) { const id = String(state.rows.size); patchRow(`${name}/${id}`, value); return { id } },
        doc(id: string) {
          const key = `${name}/${id}`
          return { key, id,
            async get() { const value = clone(state.rows.get(key)); return { id, exists: !!value, data: () => value } },
            async set(value: any) { patchRow(key, value) },
          }
        },
      }
    }
    return query()
  },
  async runTransaction(callback: (transaction: any) => Promise<any>) {
    const task = state.tail.then(async () => {
      const writes: Array<[string, any]> = []
      const transaction = { get: (ref: any) => ref.get(),
        update: (ref: any, value: any) => writes.push([ref.key, value]),
        set: (ref: any, value: any) => writes.push([ref.key, value]) }
      state.inTransaction = true
      try {
        // Firestore may retry the callback before committing.
        await callback(transaction)
        writes.length = 0
        const result = await callback(transaction)
        for (const [key, value] of writes) patchRow(key, value)
        state.afterCommit?.()
        return result
      } finally { state.inTransaction = false }
    })
    state.tail = task.then(() => undefined, () => undefined)
    return task
  },
}
;(globalThis as any).__offerAcceptanceDb = db
const adapters: Record<string, string> = {
  "@/lib/firebase/admin": `export const adminDb=globalThis.__offerAcceptanceDb;`,
  "firebase-admin/firestore": `export const FieldValue={serverTimestamp:()=>new Date()};`,
  "@/lib/auth/require-role": `export class RequireRoleError extends Error {} export async function requireRole(){return {uid:'issuer'}};`,
  "@/lib/offer/offer-events.server": `export async function logOfferEvent(event){globalThis.__offerAcceptanceTest.events.push(event)};`,
  "@/lib/offer/portal-audit": `export async function logOfferPortalEvent(){};`,
  "@/lib/email/email-events.server": `export async function logEmailEventServer(){};`,
  "@/lib/email/send-invite-style-email.server": `export class InviteStyleEmailSendError extends Error {} export async function sendInviteStyleEmail(input){
    const s=globalThis.__offerAcceptanceTest;
    input.calledDuringTransaction=s.inTransaction;
    s.mails.push(input);
    if((s.smtpFailure && input.flow==='offer_issuer_acceptance') || (s.failFlow && s.failFlow===input.flow))throw Error('Simulated SMTP failure');
    return {messageId:'simulated-message',emailEventId:'simulated-event'};
  };`,
  "@/lib/offer/certified-pdf.server": `async function pdf(){if(globalThis.__offerAcceptanceTest.pdfFailure)throw Error('Simulated PDF failure');return null};export {pdf as generateCertifiedCrmOfferPdf,pdf as generateCertifiedLucrariOfferPdf};`,
}
async function loadRoute(path: string): Promise<any> {
  const output = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "isolated-services", setup(builder) {
      builder.onResolve({ filter: /^(?:@\/lib\/|firebase-admin\/firestore$)/ }, ({ path }) => adapters[path] ? { path, namespace: "mock" } : undefined)
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: adapters[path], loader: "js" }))
    } }],
  })
  const module = { exports: {} }
  new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports)
  return module.exports
}
const routes = {
  lucrari: loadRoute("app/api/offer/respond/route.ts"),
  crm: loadRoute("app/api/crm/offers/respond/route.ts"),
  invite: loadRoute("app/api/users/invite/route.ts"),
}
type Source = "lucrari" | "crm"
function seed(source: Source, legacy = false) {
  state.rows.clear(); state.mails = []; state.events = []
  state.smtpFailure = false; state.failFlow = ""; state.pdfFailure = false; state.afterCommit = undefined
  const verification = { email: "client@example.test", responseProofHash: createHash("sha256").update("proof").digest("hex"),
    responseProofExpiresAt: new Date(Date.now() + 60000) }
  const issuer = { userId: "issuer", email: "sender@example.test" }
  state.rows.set("users/issuer", { email: issuer.email })
  if (source === "lucrari") {
    state.rows.set("lucrari/work", { nrLucrare: "002400", client: "Client <script>& test", offerActionToken: "token",
      offerActionExpiresAt: new Date(Date.now() + 60000), offerActionVerification: verification,
      offerActionSnapshot: { savedAt: "version-1", comments: "PRIVATE INTERNAL COMMENT" },
      lastOfferEmail: { messageId: "original-message", ...(!legacy ? { issuer, offerVersionSavedAt: "version-1" } : {}) } })
    state.rows.set("emailEvents/original", { type: "OFFER", status: "sent", lucrareId: "work", messageId: "original-message", meta: { actorUserId: "issuer" } })
  } else {
    state.rows.set("crm_offers/offer", { status: "SENT", actionToken: "token", actionExpiresAt: new Date(Date.now() + 60000),
      verification, opportunityId: "opportunity", version: 3, createdById: "issuer", ...(!legacy ? { issuer } : {}), snapshot: { comments: "PRIVATE INTERNAL COMMENT" } })
    state.rows.set("crm_opportunities/opportunity", { code: "OP-20", title: "Opportunity", clientId: "client" })
    state.rows.set("crm_clients/client", { name: "Client <script>& test" })
  }
}
const rowKey = (source: Source) => source === "lucrari" ? "lucrari/work" : "crm_offers/offer"
function request(source: Source, overrides = {}) {
  return new NextRequest(`https://example.test/api/${source === "crm" ? "crm/offers" : "offer"}/respond`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lucrareId: "work", offerId: "offer", token: "token", verificationProof: "proof", action: "accept", ...overrides }),
  })
}
const notifications = () => state.mails.filter(mail => mail.flow === "offer_issuer_acceptance")
for (const source of ["lucrari", "crm"] as const) {
  test(`${source}: committed acceptance notifies issuer with escaped content and private dashboard link`, async () => {
    seed(source)
    const response = await (await routes[source]).POST(request(source))
    assert.equal(response.status, 200)
    assert.equal(notifications().length, 1)
    const mail = notifications()[0]
    assert.equal(mail.calledDuringTransaction, false)
    assert.deepEqual(mail.to, ["sender@example.test"])
    assert.equal(mail.actorUserId, undefined)
    assert.match(mail.html, /Client &lt;script&gt;&amp; test/)
    assert.match(mail.content, /client@example.test/)
    assert.match(mail.content, /Europe\/Bucharest/)
    assert.match(mail.html, source === "lucrari" ? /\/dashboard\/lucrari\/work/ : /\/crm\/opportunities\/opportunity\/offers/)
    assert.match(mail.content, source === "lucrari" ? /version-1/ : /Versiune ofertă: 3/)
    assert.doesNotMatch(mail.html + mail.content, /PRIVATE INTERNAL COMMENT|token|proof/)
    assert.doesNotMatch(mail.html, /<script>/)
    assert.ok(state.events.some(e => e.type === "OFFER_ISSUER_ACCEPTANCE_NOTIFICATION" && e.status === "sent"))
    if (source === "lucrari") assert.equal(state.mails.filter(m => m.flow === "offer_confirmation").length, 1)
  })
  test(`${source}: repeated/concurrent acceptances and transaction retries send once`, async () => {
    seed(source)
    const route = await routes[source]
    const responses = await Promise.all([route.POST(request(source)), route.POST(request(source))])
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 409])
    assert.equal((await route.POST(request(source))).status, 409)
    assert.equal(notifications().length, 1)
  })
  test(`${source}: rejection, expiry and invalid proof send no issuer notification`, async () => {
    const route = await routes[source]
    for (const kind of ["reject", "expired", "proof", "token", "missingProof"] as const) {
      seed(source)
      const row = state.rows.get(rowKey(source))
      if (kind === "expired") row[source === "crm" ? "actionExpiresAt" : "offerActionExpiresAt"] = new Date(0)
      const response = await route.POST(request(source, kind === "missingProof" ? { verificationProof: "" } : kind === "proof" ? { verificationProof: "wrong" } :
        kind === "token" ? { token: "wrong" } : kind === "reject" ? { action: "reject" } : {}))
      assert.equal(response.status, { reject: 200, expired: 410, proof: 403, token: 400, missingProof: 403 }[kind])
      assert.equal(notifications().length, 0)
    }
  })
  test(`${source}: SMTP/PDF failures preserve successful acceptance and repeated calls never retry SMTP`, async () => {
    seed(source); state.smtpFailure = true; state.pdfFailure = true
    const route = await routes[source]
    assert.equal((await route.POST(request(source))).status, 200)
    const row = state.rows.get(rowKey(source))
    assert.equal(source === "crm" ? row.response.status : row.offerResponse.status, "accept")
    assert.ok(state.events.some(e => e.type === "OFFER_ISSUER_ACCEPTANCE_NOTIFICATION" && e.status === "failed"))
    assert.equal((await route.POST(request(source))).status, 409)
    assert.equal(notifications().length, 1)
  })
  test(`${source}: existing offers resolve actual issuer and missing issuer is logged as skipped`, async () => {
    seed(source, true)
    assert.equal((await (await routes[source]).POST(request(source))).status, 200)
    assert.deepEqual(notifications()[0].to, ["sender@example.test"])
    seed(source, true)
    state.rows.delete("users/issuer")
    assert.equal((await (await routes[source]).POST(request(source))).status, 200)
    assert.equal(notifications().length, 0)
    assert.ok(state.events.some(e => e.type === "OFFER_ISSUER_ACCEPTANCE_NOTIFICATION" && e.status === "skipped"))
  })
  test(`${source}: notification uses the accepted transaction snapshot even if the offer changes after commit`, async () => {
    seed(source)
    state.afterCommit = () => {
      const row = state.rows.get(rowKey(source))
      row.issuer = { userId: "other", email: "wrong@example.test" }
      if (source === "lucrari") { row.lastOfferEmail.issuer = row.issuer; row.nrLucrare = "wrong" }
      else state.rows.get("crm_opportunities/opportunity").code = "wrong"
    }
    assert.equal((await (await routes[source]).POST(request(source))).status, 200)
    assert.deepEqual(notifications()[0].to, ["sender@example.test"])
    assert.doesNotMatch(notifications()[0].content, /wrong/)
  })
}

test("FOM send persists authenticated issuer only after successful send and ignores supplied issuer", async () => {
  seed("lucrari")
  state.rows.get("lucrari/work").offerActionSnapshot = {
    savedAt: "new-version", products: [{ name: "Motor", um: "buc", quantity: 1, price: 0 }],
    conditions: ["Plata: avans", "Livrare: 30 zile", "Instalare: 2 zile"], vat: 21, adjustmentPercent: 0,
  }
  const response = await (await routes.invite).POST(new NextRequest("https://example.test/api/users/invite", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      type: "OFFER", lucrareId: "work", to: ["client@example.test"], subject: "Offer",
      issuer: { userId: "attacker", email: "wrong@example.test" },
    }),
  }))
  assert.equal(response.status, 200)
  const sent = state.rows.get("lucrari/work").lastOfferEmail
  assert.deepEqual(sent.issuer, { userId: "issuer", email: "sender@example.test" })
  assert.equal(sent.offerVersionSavedAt, "new-version")
  state.failFlow = "offer"
  const failed = await (await routes.invite).POST(new NextRequest("https://example.test/api/users/invite", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      type: "OFFER", lucrareId: "work", to: ["client@example.test"], subject: "Offer",
    }),
  }))
  assert.equal(failed.status, 500)
  assert.equal(state.rows.get("lucrari/work").lastOfferEmail.issuer, undefined)
})

test("FOM skips mismatched versions and ambiguous or unrelated legacy senders", async () => {
  for (const kind of ["version", "ambiguous", "unrelated"] as const) {
    seed("lucrari", kind !== "version")
    if (kind === "version") state.rows.get("lucrari/work").lastOfferEmail.offerVersionSavedAt = "other-version"
    if (kind === "unrelated") state.rows.get("emailEvents/original").lucrareId = "other-work"
    if (kind === "ambiguous") state.rows.set("emailEvents/other", {
      type: "OFFER", status: "sent", lucrareId: "work", messageId: "original-message", meta: { actorUserId: "other-user" },
    })
    assert.equal((await (await routes.lucrari).POST(request("lucrari"))).status, 200)
    assert.equal(notifications().length, 0)
    assert.ok(state.events.some(e => e.type === "OFFER_ISSUER_ACCEPTANCE_NOTIFICATION" && e.status === "skipped"))
  }
})
