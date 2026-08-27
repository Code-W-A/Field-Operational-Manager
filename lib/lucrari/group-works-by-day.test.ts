import test from "node:test"
import assert from "node:assert/strict"

import { groupWorksByScheduledDay } from "@/lib/lucrari/group-works-by-day"

const now = new Date(2026, 7, 26, 14, 30, 0)

test("grupează azi, mâine, ieri și fără dată", () => {
  const sections = groupWorksByScheduledDay(
    [
      { id: "today-2", dataInterventie: "26.08.2026 09:00", nr: 2 },
      { id: "undated", dataInterventie: undefined, nr: 9 },
      { id: "tomorrow", dataInterventie: new Date(2026, 7, 27, 10, 0), nr: 3 },
      { id: "today-1", dataInterventie: new Date(2026, 7, 26, 8, 0), nr: 1 },
      { id: "yesterday", dataInterventie: { seconds: Math.floor(new Date(2026, 7, 25, 18, 0).getTime() / 1000) }, nr: 4 },
    ],
    now,
  )

  assert.deepEqual(
    sections.map((section) => ({ key: section.key, kind: section.kind, ids: section.items.map((item) => item.id) })),
    [
      { key: "2026-08-25", kind: "past", ids: ["yesterday"] },
      { key: "2026-08-26", kind: "today", ids: ["today-2", "today-1"] },
      { key: "2026-08-27", kind: "tomorrow", ids: ["tomorrow"] },
      { key: "undated", kind: "undated", ids: ["undated"] },
    ],
  )
  assert.equal(sections[0].overdue, true)
  assert.match(sections[1].title, /^Astăzi · /)
  assert.match(sections[2].title, /^Mâine · /)
  assert.equal(sections[3].title, "Fără dată programată")
})

test("zilele trecute sunt cele mai recente întâi, viitorul crescător", () => {
  const sections = groupWorksByScheduledDay(
    [
      { id: "next-week", dataInterventie: new Date(2026, 8, 1) },
      { id: "older", dataInterventie: new Date(2026, 7, 20) },
      { id: "yesterday", dataInterventie: new Date(2026, 7, 25) },
      { id: "today", dataInterventie: new Date(2026, 7, 26) },
      { id: "day-after", dataInterventie: new Date(2026, 7, 28) },
      { id: "tomorrow", dataInterventie: new Date(2026, 7, 27) },
    ],
    now,
  )

  assert.deepEqual(
    sections.map((section) => section.key),
    ["2026-08-25", "2026-08-20", "2026-08-26", "2026-08-27", "2026-08-28", "2026-09-01"],
  )
})

test("păstrează ordinea din listă în interiorul zilei", () => {
  const sections = groupWorksByScheduledDay(
    [
      { id: "b", dataInterventie: "26.08.2026" },
      { id: "a", dataInterventie: "26.08.2026" },
    ],
    now,
  )
  assert.deepEqual(sections[0].items.map((item) => item.id), ["b", "a"])
})

test("ISO midnight și Timestamp-like cad în aceeași zi locală", () => {
  const sections = groupWorksByScheduledDay(
    [
      { id: "iso", dataInterventie: "2026-08-26T00:00:00" },
      { id: "ts", dataInterventie: { seconds: Math.floor(new Date(2026, 7, 26, 23, 59).getTime() / 1000) } },
    ],
    now,
  )
  assert.equal(sections.length, 1)
  assert.equal(sections[0].kind, "today")
  assert.deepEqual(sections[0].items.map((item) => item.id), ["iso", "ts"])
})

test("dată invalidă merge la fără dată", () => {
  const sections = groupWorksByScheduledDay([{ id: "bad", dataInterventie: "nu-e-dată" }], now)
  assert.equal(sections.length, 1)
  assert.equal(sections[0].kind, "undated")
})
