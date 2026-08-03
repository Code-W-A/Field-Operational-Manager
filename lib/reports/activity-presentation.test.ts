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
  assert.equal(presented.presentation?.description, "1 informație modificată")
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

test("arată doar echipamentul al cărui timp de revizie s-a schimbat", () => {
  const unchanged = {
    startIso: "2026-08-03T10:00:00.000Z",
    endIso: "2026-08-03T10:30:00.000Z",
    durationMinutes: 30,
    durationText: "0h 30m",
  }
  const before = {
    "equipment-a": unchanged,
    "equipment-b": { startIso: "2026-08-03T11:00:00.000Z" },
  }
  const after = {
    "equipment-a": unchanged,
    "equipment-b": {
      startIso: "2026-08-03T11:00:00.000Z",
      endIso: "2026-08-03T12:15:00.000Z",
      durationMinutes: 75,
      durationText: "1h 15m",
    },
  }
  const presented = presentAuditEvent(event({
    changes: [{
      field: "revisionEquipmentTimes",
      label: "revisionEquipmentTimes",
      before: JSON.stringify(before),
      after: JSON.stringify(after),
    }],
  }), {
    ticketLabel: "#001763",
    equipmentLabels: { "equipment-a": "Centrală 1", "equipment-b": "Pompă circulație (PC-02)" },
  })

  assert.equal(presented.changes.length, 1)
  assert.equal(presented.presentation?.title, "A finalizat revizia pentru Pompă circulație (PC-02)")
  assert.equal(presented.presentation?.description, "Revizia a fost finalizată. Durata înregistrată este 1h 15m.")
  assert.equal(presented.changes[0].presentation?.label, "Revizie – Pompă circulație (PC-02)")
  assert.equal(presented.changes[0].presentation?.before.text, "Revizie în desfășurare")
  assert.equal(presented.changes[0].presentation?.after.text, "Revizie finalizată")
  assert.deepEqual(presented.changes[0].presentation?.after.items.map((item) => item.label), ["Începută la", "Finalizată la", "Durată"])
  assert.doesNotMatch(presented.presentation?.title || "", /equipment-b|detalii/i)
})

test("traduce statusul tehnic al reviziei într-o explicație pentru administrator", () => {
  const presented = presentAuditEvent(event({
    changes: [{
      field: "revision",
      label: "revision",
      before: JSON.stringify({ equipmentStatus: { eq1: "in_progress", eq2: "pending" } }),
      after: JSON.stringify({ equipmentStatus: { eq1: "done", eq2: "pending" } }),
    }],
  }), { equipmentLabels: { eq1: "Generator (G-01)", eq2: "Pompă" } })

  assert.equal(presented.changes.length, 1)
  assert.equal(presented.presentation?.title, "A finalizat revizia pentru Generator (G-01)")
  assert.equal(presented.changes[0].presentation?.before.text, "Revizie în lucru")
  assert.equal(presented.changes[0].presentation?.after.text, "Revizie finalizată")
})

test("prezintă documentele nested ca fișe de revizie, fără calea Firestore", () => {
  const presented = presentAuditEvent(event({
    entityType: "Tichet / revisions",
    entityId: "lucrari/work-1/revisions/equipment-a",
    entityLabel: "work-1",
    changes: [],
  }), { ticketLabel: "#001763", revisionEquipmentName: "Centrală termică (CT-01)" })

  assert.equal(presented.entityType, "Fișă de revizie")
  assert.equal(presented.presentation?.title, "A actualizat fișa de revizie pentru Centrală termică (CT-01)")
  assert.equal(presented.presentation?.description, "A salvat informațiile din fișa de verificare a echipamentului.")
  assert.equal(presented.presentation?.entityLabel, "Centrală termică (CT-01)")
})

test("explică modificările punctelor din fișa de revizie ca texte", () => {
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
  const presented = presentAuditEvent(event({
    entityType: "Tichet / revisions",
    entityId: "lucrari/work-1/revisions/eq-1",
    changes: [{ field: "sections", label: "sections", before: JSON.stringify(before), after: JSON.stringify(after) }],
  }), { ticketLabel: "#001763", revisionEquipmentName: "Centrală termică (CT-01)" })

  assert.equal(presented.presentation?.title, "A actualizat fișa de revizie pentru Centrală termică (CT-01)")
  assert.equal(presented.presentation?.description, "2 modificări sunt explicate mai jos.")
  assert.equal(presented.changes[0].presentation?.label, "Presiune instalație")
  assert.equal(presented.changes[0].presentation?.before.text, "Funcțional")
  assert.equal(presented.changes[0].presentation?.after.text, "Nefuncțional")
  assert.equal(presented.changes[1].presentation?.label, "Observație – Presiune instalație")
  assert.equal(presented.changes[1].presentation?.after.text, "Presiune scăzută")
})
