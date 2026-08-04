import test from "node:test"
import assert from "node:assert/strict"

import {
  buildCalendarEventsFromContracts,
  buildCalendarEventsFromPreview,
  buildEditDialogCalendarEvents,
  canOpenRevisionCalendar,
  computeRevisionSchedulePreview,
  filterCalendarEventsByContractId,
  getDefaultCalendarRange,
  parsePreviewDate,
  resolveEditDialogCalendarPreview,
  resolveContractRevisionPreview,
} from "@/lib/contracts/revision-calendar"

const contractA = { id: "ct-a", name: "Contract A", number: "MNT-001" }
const contractB = { id: "ct-b", name: "Contract B", number: "MNT-002" }

test("computeRevisionSchedulePreview — returnează [] fără startDate sau recurență", () => {
  assert.deepEqual(computeRevisionSchedulePreview({}), [])
  assert.deepEqual(
    computeRevisionSchedulePreview({ startDate: "2026-01-15", recurrenceInterval: 3 }),
    [],
  )
})

test("computeRevisionSchedulePreview — generează revizii lunare pe locații multiple", () => {
  const preview = computeRevisionSchedulePreview({
    startDate: "2026-01-15",
    recurrenceInterval: 3,
    recurrenceUnit: "luni",
    daysBeforeWork: 5,
    locationIds: ["loc-sediu", "loc-depozit"],
    locationNames: ["Sediu", "Depozit"],
  })

  assert.ok(preview.length >= 4)
  assert.equal(preview[0].locationName, "Sediu")
  assert.equal(preview[1].locationName, "Depozit")
  assert.equal(preview[0].scheduledIso, preview[1].scheduledIso)

  const scheduled = new Date(preview[0].scheduledIso)
  const generated = new Date(preview[0].generateIso)
  assert.equal(
    Math.round((scheduled.getTime() - generated.getTime()) / (24 * 60 * 60 * 1000)),
    5,
  )
})

test("computeRevisionSchedulePreview — generează revizii la zile", () => {
  const preview = computeRevisionSchedulePreview({
    startDate: "2026-06-01",
    recurrenceInterval: 30,
    recurrenceUnit: "zile",
    locationName: "Punct lucru",
  })

  assert.ok(preview.length >= 3)
  const first = new Date(preview[0].scheduledIso)
  const second = new Date(preview[1].scheduledIso)
  const diffDays = Math.round((second.getTime() - first.getTime()) / (24 * 60 * 60 * 1000))
  assert.equal(diffDays, 30)
})

test("parsePreviewDate — acceptă ISO string și obiecte Firestore", () => {
  const iso = parsePreviewDate("2026-03-10T10:00:00.000Z")
  assert.ok(iso)
  assert.equal(iso!.toISOString(), "2026-03-10T10:00:00.000Z")

  const ts = parsePreviewDate({ seconds: Math.floor(new Date(2026, 4, 1).getTime() / 1000) })
  assert.ok(ts)
  assert.equal(ts!.getFullYear(), 2026)
  assert.equal(ts!.getMonth(), 4)
})

test("buildCalendarEventsFromPreview — filtrează în intervalul de 12 luni", () => {
  const preview = computeRevisionSchedulePreview({
    startDate: "2026-01-01",
    recurrenceInterval: 1,
    recurrenceUnit: "luni",
    locationName: "Sediu",
  })
  const { start, end } = getDefaultCalendarRange(new Date(2026, 5, 15))

  const events = buildCalendarEventsFromPreview(preview, contractA, start, end)
  assert.ok(events.length > 0)
  events.forEach((ev) => {
    assert.ok(ev.date >= start)
    assert.ok(ev.date < end)
    assert.equal(ev.contractId, "ct-a")
    assert.equal(ev.contractName, "Contract A")
  })
})

test("buildCalendarEventsFromContracts — combină mai multe contracte", () => {
  const previewA = computeRevisionSchedulePreview({
    startDate: "2026-02-01",
    recurrenceInterval: 2,
    recurrenceUnit: "luni",
    locationName: "A",
  })
  const previewB = computeRevisionSchedulePreview({
    startDate: "2026-03-01",
    recurrenceInterval: 2,
    recurrenceUnit: "luni",
    locationName: "B",
  })
  const { start, end } = getDefaultCalendarRange(new Date(2026, 0, 1))

  const events = buildCalendarEventsFromContracts(
    [
      { ...contractA, revisionSchedulePreview: previewA },
      { ...contractB, revisionSchedulePreview: previewB },
    ],
    start,
    end,
  )

  const ids = new Set(events.map((e) => e.contractId))
  assert.ok(ids.has("ct-a"))
  assert.ok(ids.has("ct-b"))
})

test("filterCalendarEventsByContractId — păstrează doar contractul selectat", () => {
  const events = [
    { id: "1", date: new Date(2026, 1, 1), contractId: "ct-a", contractName: "A", contractNumber: "1" },
    { id: "2", date: new Date(2026, 2, 1), contractId: "ct-b", contractName: "B", contractNumber: "2" },
  ]
  const filtered = filterCalendarEventsByContractId(events, "ct-a")
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].contractId, "ct-a")
  assert.equal(filterCalendarEventsByContractId(events, null).length, 2)
})

test("resolveEditDialogCalendarPreview — preferă previzualizarea live din formular", () => {
  const saved = [{ scheduledIso: "2020-01-01T00:00:00.000Z", generateIso: "2019-12-01T00:00:00.000Z" }]
  const live = resolveEditDialogCalendarPreview(
    {
      startDate: "2026-05-01",
      recurrenceInterval: 1,
      recurrenceUnit: "luni",
    },
    saved,
  )
  assert.ok(live.length > 0)
  assert.notEqual(live[0].scheduledIso, saved[0].scheduledIso)
})

test("resolveEditDialogCalendarPreview — folosește saved când formularul e incomplet", () => {
  const saved = [{ scheduledIso: "2026-06-01T00:00:00.000Z", generateIso: "2026-05-22T00:00:00.000Z" }]
  const result = resolveEditDialogCalendarPreview({ startDate: "" }, saved)
  assert.deepEqual(result, saved)
})

test("resolveContractRevisionPreview — reconstruiește calendarul contractelor vechi", () => {
  const preview = resolveContractRevisionPreview({
    id: "legacy-1",
    name: "Contract vechi",
    number: "MNT-LEGACY-1",
    startDate: "2026-06-01",
    recurrenceInterval: 30,
    recurrenceUnit: "zile",
    daysBeforeWork: 5,
    locationName: "Sediu",
  })

  assert.ok(preview.length > 0)
  assert.equal(preview[0].locationName, "Sediu")
})

test("canOpenRevisionCalendar — true doar cu revizii", () => {
  assert.equal(canOpenRevisionCalendar([]), false)
  assert.equal(
    canOpenRevisionCalendar([{ scheduledIso: "2026-01-01T00:00:00.000Z", generateIso: "2025-12-22T00:00:00.000Z" }]),
    true,
  )
})

test("buildEditDialogCalendarEvents — live form + interval calendar", () => {
  const { start, end } = getDefaultCalendarRange(new Date(2026, 0, 1))
  const events = buildEditDialogCalendarEvents(
    {
      startDate: "2026-01-15",
      recurrenceInterval: 3,
      recurrenceUnit: "luni",
      locationNames: ["Sediu"],
    },
    contractA,
    null,
    start,
    end,
  )
  assert.ok(events.length > 0)
  events.forEach((ev) => assert.equal(ev.contractId, "ct-a"))
})

test("getDefaultCalendarRange — 12 luni de la începutul lunii curente", () => {
  const ref = new Date(2026, 5, 20)
  const { start, end } = getDefaultCalendarRange(ref)
  assert.equal(start.getFullYear(), 2026)
  assert.equal(start.getMonth(), 5)
  assert.equal(start.getDate(), 1)
  assert.equal(end.getFullYear(), 2027)
  assert.equal(end.getMonth(), 5)
})
