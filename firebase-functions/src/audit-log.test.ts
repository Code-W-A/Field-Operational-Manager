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

test("auditul păstrează stările și observațiile fișei de revizie în formă compactă", () => {
  const before = [{
    id: "section-1",
    title: "Verificări generale",
    items: [{ id: "item-1", label: "Presiune instalație", state: "functional", obs: "" }],
  }]
  const after = [{
    id: "section-1",
    title: "Verificări generale",
    items: [{ id: "item-1", label: "Presiune instalație", state: "nefunctional", obs: "Presiune scăzută" }],
  }]
  const changes = buildAuditChanges({ sections: before }, { sections: after })

  assert.equal(changes.length, 1)
  assert.match(changes[0].before || "", /Presiune instalație.*functional/)
  assert.match(changes[0].after || "", /nefunctional.*Presiune scăzută/)
  assert.notEqual(changes[0].before, changes[0].after)
})

test("auditul exclude fotografiile reviziei", () => {
  const changes = buildAuditChanges(
    { photos: [{ url: "https://example.test/old.jpg" }], status: "nou" },
    { photos: [{ url: "https://example.test/new.jpg" }], status: "gata" },
  )
  assert.deepEqual(changes, [{ field: "status", label: "status", before: "nou", after: "gata" }])
})
