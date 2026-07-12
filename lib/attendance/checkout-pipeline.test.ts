import assert from "node:assert/strict"
import test from "node:test"

import { executeCheckoutPipeline, executeCheckoutWithConfirmation } from "./checkout-pipeline"

test("checkout pipeline keeps commit when sync fails", async () => {
  const order: string[] = []
  const result = await executeCheckoutPipeline({
    commit: async () => { order.push("commit"); return "committed" },
    audit: async () => { order.push("audit") },
    sync: async () => { order.push("sync"); throw new Error("sync failed") },
  })
  assert.deepEqual(order, ["commit", "audit", "sync"])
  assert.equal(result.committed, "committed")
  assert.equal(result.syncResult, null)
  assert.match(String(result.syncError), /sync failed/)
})

test("checkout pipeline continues sync when audit fails", async () => {
  const result = await executeCheckoutPipeline({
    commit: async () => "committed",
    audit: async () => { throw new Error("audit failed") },
    sync: async () => "synced",
  })
  assert.equal(result.committed, "committed")
  assert.equal(result.syncResult, "synced")
  assert.match(String(result.auditError), /audit failed/)
})

test("checkout confirmation runs strictly after checkout resolves", async () => {
  const order: string[] = []
  await executeCheckoutWithConfirmation(
    async () => { order.push("commit"); return "done" },
    async (result) => { order.push(`confirm:${result}`) },
  )
  assert.deepEqual(order, ["commit", "confirm:done"])
})
