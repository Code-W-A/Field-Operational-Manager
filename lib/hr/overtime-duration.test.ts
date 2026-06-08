import test from "node:test"
import assert from "node:assert/strict"

import {
  formatOvertimeDuration,
  normalizeOvertimeHoursValue,
  overtimeHoursFromParts,
  overtimePartsFromHours,
  isValidOvertimeDuration,
} from "@/lib/hr/overtime-duration"

test("overtimeHoursFromParts — 0h 30min → 0.5h", () => {
  assert.equal(overtimeHoursFromParts(0, 30), 0.5)
})

test("overtimeHoursFromParts — 1h 30min → 1.5h", () => {
  assert.equal(overtimeHoursFromParts(1, 30), 1.5)
})

test("overtimeHoursFromParts — 2h 0min → 2h", () => {
  assert.equal(overtimeHoursFromParts(2, 0), 2)
})

test("overtimePartsFromHours — reconstruiește ore și minute", () => {
  assert.deepEqual(overtimePartsFromHours(1.5), { hours: 1, minutes: 30 })
  assert.deepEqual(overtimePartsFromHours(0.5), { hours: 0, minutes: 30 })
})

test("normalizeOvertimeHoursValue — corectează 30/45/15 introduse ca minute", () => {
  assert.equal(normalizeOvertimeHoursValue(30), 0.5)
  assert.equal(normalizeOvertimeHoursValue(45), 0.75)
  assert.equal(normalizeOvertimeHoursValue(15), 0.25)
  assert.equal(normalizeOvertimeHoursValue(2), 2)
  assert.equal(normalizeOvertimeHoursValue(1.5), 1.5)
})

test("formatOvertimeDuration — afișare lizibilă", () => {
  assert.equal(formatOvertimeDuration(0.5), "30 min")
  assert.equal(formatOvertimeDuration(1.5), "1,5 h")
  assert.equal(formatOvertimeDuration(2), "2 h")
  assert.equal(formatOvertimeDuration(30), "30 min")
})

test("isValidOvertimeDuration", () => {
  assert.equal(isValidOvertimeDuration(0), false)
  assert.equal(isValidOvertimeDuration(0.5), true)
  assert.equal(isValidOvertimeDuration(overtimeHoursFromParts(0, 30)), true)
})
