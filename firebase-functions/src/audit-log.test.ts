import assert from "node:assert/strict"
import test from "node:test"
import { buildAuditChanges } from "./audit-log"

test("auditul exclude câmpurile sensibile și metadatele zgomotoase", () => {
  const changes = buildAuditChanges(
    { status: "Nou", password: "secret", semnaturaBeneficiar: "base64", updatedAt: "old" },
    { status: "Finalizat", password: "changed", semnaturaBeneficiar: "other", updatedAt: "new" },
  )
  assert.deepEqual(changes, [{ field: "status", label: "status", before: "Nou", after: "Finalizat" }])
})

test("auditul limitează obiectele și valorile lungi", () => {
  const changes = buildAuditChanges({}, { descriere: "x".repeat(3_000), context: { token: "secret", safe: "ok" } })
  assert.equal(changes[0].after?.length, 2_001)
  assert.equal(changes[1].after, JSON.stringify({ safe: "ok" }))
})
