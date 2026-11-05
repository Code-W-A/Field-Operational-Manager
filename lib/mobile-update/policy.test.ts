import { test } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_POLICY, parsePolicy } from "./policy"
import { policyHandlers } from "./handlers"

const policy = { enabled: true, minimumAndroidVersionCode: 3, message: "Actualizează." }
const request = (body: unknown) => new Request("http://localhost/api/admin/mobile-update-policy", { method: "PUT", body: JSON.stringify(body) })

test("accepts only valid build numbers, booleans and bounded messages", () => {
  assert.deepEqual(parsePolicy({ ...policy, updatedBy: "secret", message: " Actualizează. " }), policy)
  for (const minimumAndroidVersionCode of [0, -1, 1.5, "3", NaN, 2100000001]) assert.equal(parsePolicy({ ...policy, minimumAndroidVersionCode }), null)
  for (const value of [null, {}, { ...policy, enabled: "true" }, { ...policy, message: " " }, { ...policy, message: "a".repeat(501) }]) assert.equal(parsePolicy(value), null)
})

test("public read requires no identity, excludes audit fields, and disables caching", async () => {
  const api = policyHandlers({
    requireAdmin: async () => { throw new Error("must not authenticate public read") },
    read: async () => ({ ...policy, updatedBy: "secret", updatedAt: 100 }),
    save: async () => { throw new Error("must not write") },
  })
  const response = await api.publicGet()
  assert.equal(response.status, 200)
  assert.match(response.headers.get("Cache-Control")!, /no-store/)
  assert.deepEqual(await response.json(), policy)
})

test("missing or malformed policy defaults to disabled; database error is no-store 503", async () => {
  for (const stored of [undefined, null, { enabled: true }]) {
    const api = policyHandlers({ requireAdmin: async () => ({ uid: "admin" }), read: async () => stored, save: async () => {} })
    assert.deepEqual(await (await api.publicGet()).json(), DEFAULT_POLICY)
  }
  const api = policyHandlers({ requireAdmin: async () => ({ uid: "admin" }), read: async () => { throw new Error("database") }, save: async () => {} })
  const response = await api.publicGet()
  assert.equal(response.status, 503)
  assert.match(response.headers.get("Cache-Control")!, /no-store/)
})

test("admin handlers reject unauthenticated and forbidden identities before database access", async () => {
  for (const status of [401, 403]) {
    const api = policyHandlers({
      requireAdmin: async () => { throw Object.assign(new Error("denied"), { status }) },
      read: async () => { assert.fail("unauthorized read") },
      save: async () => { assert.fail("unauthorized write") },
    })
    assert.equal((await api.adminGet(request(policy))).status, status)
    assert.equal((await api.adminPut(request(policy))).status, status)
  }
})

test("admin can read and save sanitized settings with their verified uid", async () => {
  const writes: unknown[] = []
  const api = policyHandlers({ requireAdmin: async () => ({ uid: "admin-1" }), read: async () => policy, save: async (p, uid) => { writes.push({ p, uid }) } })
  assert.deepEqual(await (await api.adminGet(request(policy))).json(), policy)
  assert.equal((await api.adminPut(request({ ...policy, updatedBy: "forged" }))).status, 200)
  assert.deepEqual(writes, [{ p: policy, uid: "admin-1" }])
  assert.equal((await api.adminPut(request({ ...policy, minimumAndroidVersionCode: 0 }))).status, 400)
  const malformed = new Request("http://localhost", { method: "PUT", body: "{" })
  assert.equal((await api.adminPut(malformed)).status, 400)
  assert.equal(writes.length, 1)
})
