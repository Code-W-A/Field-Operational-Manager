import assert from "node:assert/strict"
import test from "node:test"
import {
  formatAuditValue,
  humanizeAuditField,
  presentAuditEvent,
  sanitizeAuditRawValue,
} from "./activity-presentation"
import type { AuditEvent } from "./types"

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: "audit-1",
    occurredAt: "2026-08-01T09:12:23.000Z",
    actorId: "user-1",
    actorName: "Administrator",
    actorRole: "admin",
    module: "lucrari",
    action: "Actualizare tichet",
    outcome: "success",
    entityType: "Tichet",
    entityId: "work-1",
    entityLabel: "#00125",
    summary: "Actualizare tichet: #00125",
    changes: [],
    source: "firestore:lucrari",
    coverage: "complete",
    ...overrides,
  }
}

test("traduce proprietățile tichetului și construiește o acțiune naturală", () => {
  const presented = presentAuditEvent(event({
    changes: [{ field: "statusLucrare", label: "statusLucrare", before: "În lucru", after: "Finalizat" }],
  }))

  assert.equal(humanizeAuditField("dataInterventie"), "Data intervenției")
  assert.equal(presented.presentation?.title, "A actualizat tichetul #00125")
  assert.equal(presented.presentation?.description, "1 câmp modificat")
  assert.equal(presented.presentation?.entityHref, "/dashboard/lucrari/work-1")
  assert.equal(presented.changes[0].presentation?.label, "Status tichet")
  assert.equal(presented.changes[0].presentation?.before.text, "În lucru")
  assert.equal(presented.changes[0].presentation?.after.text, "Finalizat")
})

test("formatează datele, valorile booleene și listele fără JSON", () => {
  assert.equal(formatAuditValue("2026-08-01T09:12:23.000Z", "dataInterventie").text, "01.08.2026, 12:12:23")
  assert.equal(formatAuditValue("true", "raportGenerat").text, "Generat")
  assert.equal(formatAuditValue('["Ana","Mihai"]', "tehnicieni").text, "Ana, Mihai")

  const products = formatAuditValue('[{"denumire":"Filtru","cantitate":2,"pret":150}]', "products")
  assert.equal(products.text, "1 produs")
  assert.equal(products.items[0].label, "Filtru")
  assert.match(products.items[0].value, /Cantitate: 2/)
  assert.doesNotMatch(products.items[0].value, /[{}\[\]"]/)
})

test("elimină câmpurile sensibile și conținutul binar inclusiv din istoricul vechi", () => {
  const presented = presentAuditEvent(event({
    changes: [
      { field: "password", label: "password", before: "old", after: "new" },
      { field: "context", label: "context", before: "{}", after: '{"safe":"ok","token":"secret","nested":{"semnatura":"base64","status":"gata"}}' },
      { field: "attachment", label: "attachment", before: "", after: `data:image/png;base64,${"a".repeat(600)}` },
    ],
  }))

  assert.deepEqual(presented.changes.map((change) => change.field), ["context", "attachment"])
  assert.equal(sanitizeAuditRawValue('{"safe":"ok","token":"secret"}'), '{"safe":"ok"}')
  assert.equal(presented.changes[1].after, "[conținut eliminat]")
  assert.doesNotMatch(presented.changes[0].after || "", /secret|token|semnatura|base64/i)
})

test("diferențiază valorile adăugate, eliminate și evenimentele fără schimbări", () => {
  const presented = presentAuditEvent(event({
    changes: [
      { field: "client", label: "client", after: "Client Nou" },
      { field: "telefon", label: "telefon", before: "0700000000" },
    ],
  }))

  assert.equal(presented.changes[0].presentation?.kind, "added")
  assert.equal(presented.changes[1].presentation?.kind, "removed")
  assert.equal(presented.changes[0].presentation?.before.text, "Necompletat")
  assert.equal(presentAuditEvent(event()).presentation?.description, "Activitate înregistrată fără diferențe de câmp.")
})

test("traduce acțiunile istorice și deschide părintele unui tichet pentru evenimentele nested", () => {
  const presented = presentAuditEvent(event({
    action: "schedule",
    entityType: "Tichet / documente",
    entityId: "lucrari/work-1/documente/doc-2",
  }))
  assert.equal(presented.presentation?.title, "A reprogramat tichet / documente #00125")
  assert.equal(presented.presentation?.entityHref, "/dashboard/lucrari/work-1")
})
