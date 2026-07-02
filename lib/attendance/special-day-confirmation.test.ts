import test from "node:test"
import assert from "node:assert/strict"

import { formatLocalDateKey, resolveAttendanceSpecialDay } from "./special-day-confirmation"

test("formats local date keys as yyyy-mm-dd", () => {
  assert.equal(formatLocalDateKey(new Date(2026, 0, 5, 9, 30)), "2026-01-05")
})

test("detects Saturday check-in confirmation", () => {
  const result = resolveAttendanceSpecialDay(new Date(2026, 5, 27, 8, 45), [])

  assert.deepEqual(result, {
    kind: "saturday",
    label: "Sâmbătă",
    date: "2026-06-27",
  })
})

test("detects Sunday check-in confirmation", () => {
  const result = resolveAttendanceSpecialDay(new Date(2026, 5, 28, 8, 45), [])

  assert.deepEqual(result, {
    kind: "sunday",
    label: "Duminică",
    date: "2026-06-28",
  })
})

test("detects configured legal holidays", () => {
  const result = resolveAttendanceSpecialDay(new Date(2026, 11, 1, 8, 45), [
    { date: "2026-12-01", label: "Ziua Națională" },
  ])

  assert.deepEqual(result, {
    kind: "legal_holiday",
    label: "Ziua Națională",
    date: "2026-12-01",
  })
})

test("legal holiday has priority over weekend", () => {
  const result = resolveAttendanceSpecialDay(new Date(2026, 5, 27, 8, 45), [
    { date: "2026-06-27", label: "Sărbătoare internă" },
  ])

  assert.equal(result?.kind, "legal_holiday")
  assert.equal(result?.label, "Sărbătoare internă")
})

test("returns null for normal working days", () => {
  assert.equal(resolveAttendanceSpecialDay(new Date(2026, 5, 29, 8, 45), []), null)
})
