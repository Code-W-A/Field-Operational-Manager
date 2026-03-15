import test from "node:test"
import assert from "node:assert/strict"
import { buildInboxDocumentId, getInboxDedupKey, normalizeInboxMessageInput, parseCrmInboxUpdateInput } from "./inbox.ts"

test("dedup uses messageId with stable document id", () => {
  const firstKey = getInboxDedupKey({ messageId: "<abc@example.com>", providerMessageId: "1" })
  const secondKey = getInboxDedupKey({ messageId: "<ABC@example.com>", providerMessageId: "2" })

  assert.equal(firstKey, secondKey)
  assert.ok(firstKey)
  assert.equal(buildInboxDocumentId(firstKey!), buildInboxDocumentId(secondKey!))
})

test("dedup falls back to providerMessageId", () => {
  const dedupKey = getInboxDedupKey({ providerMessageId: "provider-123" })
  assert.equal(dedupKey, "provider:provider-123")
})

test("normalizeInboxMessageInput rejects missing dedup identifiers", () => {
  const result = normalizeInboxMessageInput({
    from: "client@example.com",
    to: ["fom@nrg-acces.ro"],
    subject: "Salut",
    bodySnippet: "Mesaj",
    receivedAt: new Date().toISOString(),
  })

  assert.equal(result.ok, false)
})

test("parseCrmInboxUpdateInput rejects invalid enum values", () => {
  const result = parseCrmInboxUpdateInput({ id: "row-1", status: "BAD" })
  assert.equal(result.ok, false)
})

test("parseCrmInboxUpdateInput rejects extra fields", () => {
  const result = parseCrmInboxUpdateInput({ id: "row-1", status: "NEW", invalid: true })
  assert.equal(result.ok, false)
})

test("parseCrmInboxUpdateInput accepts valid payload", () => {
  const result = parseCrmInboxUpdateInput({ id: "row-1", status: "DONE", category: "ADMIN", priority: "LOW" })
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.data.status, "DONE")
    assert.equal(result.data.category, "ADMIN")
    assert.equal(result.data.priority, "LOW")
  }
})
