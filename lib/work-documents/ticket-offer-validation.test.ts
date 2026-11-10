import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { createRequire } from "node:module"
import { resolve } from "node:path"
import { NextRequest } from "next/server"
import { validateTicketOfferForSend } from "./ticket-offer-validation"

const complete = () => ({
  products: [{ name: "Motor", um: "buc", quantity: 1, price: 0 }],
  conditions: ["Plata: avans", "Livrare: 30 zile", "Instalare: 2 zile"],
  vat: 21, adjustmentPercent: 0,
})
const invalidCases: Array<[string, (s: any) => void]> = [
  ["conditions.payment", s => { s.conditions[0] = "Plata:  " }],
  ["conditions.delivery", s => { s.conditions[1] = "Livrare:" }],
  ["conditions.installation", s => { s.conditions[2] = "Instalare: \n" }],
  ["products", s => { s.products = [] }],
  ["products.0.name", s => { s.products[0].name = " " }],
  ["products.0.um", s => { s.products[0].um = "" }],
  ["products.0.quantity", s => { s.products[0].quantity = 0 }],
  ["products.0.quantity", s => { s.products[0].quantity = null }],
  ["products.0.price", s => { s.products[0].price = "" }],
  ["products.0.price", s => { s.products[0].price = -1 }],
  ["vat", s => { delete s.vat }],
  ["adjustmentPercent", s => { s.adjustmentPercent = " " }],
  ["adjustmentPercent", s => { s.adjustmentPercent = 101 }],
]

test("all terms and every product field are mandatory; explicit zero price/discount remain valid", () => {
  assert.deepEqual(validateTicketOfferForSend(complete()), {})
  for (const [field, mutate] of invalidCases) {
    const snapshot = complete(); mutate(snapshot)
    assert.ok(validateTicketOfferForSend(snapshot)[field], field)
  }
  const snapshot = complete()
  snapshot.products.push({ name: " ", um: "buc", quantity: 1, price: 1 })
  assert.ok(validateTicketOfferForSend(snapshot)["products.1.name"])
  assert.ok(Object.keys(validateTicketOfferForSend(undefined)).length)
})

const state = { snapshot: null as any, writes: 0, mails: 0, events: 0 }
;(globalThis as any).__ticketOfferValidation = state
const adapters: Record<string, string> = {
  "@/lib/firebase/admin": `export const adminDb = { collection() { return { doc() { return {
    async get() { return { exists: true, data: () => ({ offerActionSnapshot: globalThis.__ticketOfferValidation.snapshot }) } },
    async update(patch) { globalThis.__ticketOfferValidation.writes++; globalThis.__ticketOfferValidation.snapshot = patch.offerActionSnapshot },
    async set() { globalThis.__ticketOfferValidation.writes++ }
  } } } } };`,
  "@/lib/auth/require-role": `export class RequireRoleError extends Error {} export async function requireRole() { return { uid: 'test' } }`,
  "@/lib/offer/offer-events.server": `export async function logOfferEvent() { globalThis.__ticketOfferValidation.events++ }`,
  "@/lib/offer/portal-audit": `export async function logOfferPortalEvent() {}`,
  "@/lib/email/email-events.server": `export async function logEmailEventServer() { globalThis.__ticketOfferValidation.events++ }`,
  "@/lib/email/send-invite-style-email.server": `export class InviteStyleEmailSendError extends Error {} export async function sendInviteStyleEmail() { globalThis.__ticketOfferValidation.mails++; return { messageId: 'simulated', emailEventId: 'simulated' } }`,
}
async function loadRoute(path: string): Promise<any> {
  const output = await build({
    entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "simulated-services", setup(builder) {
      builder.onResolve({ filter: /^@\/lib\// }, ({ path }) => adapters[path] ? { path, namespace: "mock" } : undefined)
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: adapters[path], loader: "js" }))
    } }],
  })
  const module = { exports: {} }
  new Function("require", "module", "exports", output.outputFiles[0].text)(createRequire(resolve("package.json")), module, module.exports)
  return module.exports
}
const request = (body: unknown) => new NextRequest("https://example.test/api/offer", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
})

test("real token and email routes reject incomplete offers before writes, logging or email", async () => {
  const mint = await loadRoute("app/api/offer/route.ts")
  const invite = await loadRoute("app/api/users/invite/route.ts")
  for (const [field, mutate] of invalidCases) {
    state.writes = 0; state.mails = 0; state.events = 0
    const snapshot = complete(); mutate(snapshot)
    const tokenResponse = await mint.POST(request({ lucrareId: "ticket", snapshot }))
    assert.equal(tokenResponse.status, 400, field)
    assert.ok((await tokenResponse.json()).fieldErrors[field])
    state.snapshot = snapshot
    const emailResponse = await invite.POST(request({ lucrareId: "ticket", type: "OFFER", to: ["test@example.test"] }))
    assert.equal(emailResponse.status, 400, field)
    assert.ok((await emailResponse.json()).fieldErrors[field])
    assert.equal(state.writes, 0); assert.equal(state.mails, 0); assert.equal(state.events, 0)
  }
  state.snapshot = undefined
  assert.equal((await invite.POST(request({ lucrareId: "ticket", type: "OFFER", to: ["test@example.test"] }))).status, 400)
  assert.equal((await invite.POST(request({ type: "OFFER", to: ["test@example.test"] }))).status, 400)
  assert.equal((await mint.POST(request({ lucrareId: "ticket", snapshot: complete() }))).status, 200)
  assert.equal((await invite.POST(request({ lucrareId: "ticket", type: "OFFER", to: ["test@example.test"] }))).status, 200)
  assert.equal(state.mails, 1)
  assert.equal((await invite.POST(request({ type: "DEVIZ", to: ["test@example.test"] }))).status, 200)
})
