import test from "node:test"
import assert from "node:assert/strict"

import {
  calcEffectiveMinutes,
  getExpectedWorkMinutes,
  getTimesheetCellMinutes,
  minutesToHM,
  parseHM,
} from "@/lib/hr/time-calc"

test("calcEffectiveMinutes merges overlapping work intervals before subtracting breaks", () => {
  const minutes = calcEffectiveMinutes({
    entries: [
      { start: "08:00", end: "12:00" },
      { start: "11:00", end: "16:30" },
      { start: "16:30", end: "17:00" },
    ],
    breaks: [{ start: "12:00", end: "12:30" }],
  })

  assert.equal(minutes, 510)
})

test("calcEffectiveMinutes subtracts overlapping breaks only once after break normalization", () => {
  const minutes = calcEffectiveMinutes({
    entries: [{ start: "08:00", end: "16:30" }],
    breaks: [
      { start: "12:00", end: "12:45" },
      { start: "12:30", end: "13:00" },
    ],
  })

  assert.equal(minutes, 450)
})

test("calcEffectiveMinutes ignores invalid manual breaks and falls back to default break", () => {
  const minutes = calcEffectiveMinutes({
    entries: [{ start: "08:00", end: "16:30" }],
    breaks: [{ start: "13:00", end: "12:00" }],
    defaultBreak: { start: "12:00", end: "12:30" },
  })

  assert.equal(minutes, 480)
})

test("calcEffectiveMinutes subtracts default break only where it overlaps worked time", () => {
  const minutes = calcEffectiveMinutes({
    entries: [{ start: "08:00", end: "10:00" }],
    defaultBreak: { start: "09:30", end: "11:00" },
  })

  assert.equal(minutes, 90)
})

test("parseHM and minutesToHM reject invalid values and clamp formatting", () => {
  assert.equal(parseHM("24:00"), null)
  assert.equal(parseHM("08:60"), null)
  assert.equal(parseHM("8:05"), 485)
  assert.equal(minutesToHM(-10), "00:00")
  assert.equal(minutesToHM(75), "01:15")
})

test("calcEffectiveMinutes uses absolute attendance instants across the DST spring gap", () => {
  const minutes = calcEffectiveMinutes({
    entries: [{
      start: "02:30",
      end: "04:30",
      startTimestampMs: Date.parse("2026-03-29T00:30:00.000Z"),
      endTimestampMs: Date.parse("2026-03-29T01:30:00.000Z"),
    }],
  })
  assert.equal(minutes, 60)
})

test("calcEffectiveMinutes uses absolute attendance instants across the DST autumn fold", () => {
  const minutes = calcEffectiveMinutes({
    entries: [{
      start: "03:30",
      end: "03:30",
      startTimestampMs: Date.parse("2026-10-25T00:30:00.000Z"),
      endTimestampMs: Date.parse("2026-10-25T01:30:00.000Z"),
    }],
  })
  assert.equal(minutes, 60)
})

test("calcEffectiveMinutes rounds float ms diffs to whole minutes for display", () => {
  // Simulate a wall clock span that yields a fractional ms/60000 result (condică overflow bug).
  const minutes = calcEffectiveMinutes({
    entries: [{
      start: "08:00",
      end: "14:39",
      startTimestampMs: 1_000_000_000_000,
      endTimestampMs: 1_000_000_000_000 + (6 * 60 + 38.994) * 60_000,
    }],
  })
  assert.equal(Number.isInteger(minutes), true)
  assert.equal(minutesToHM(minutes), "06:39")
})

test("getTimesheetCellMinutes treats a cell without entries or hours as zero", () => {
  assert.equal(getTimesheetCellMinutes({ cell: {} }), 0)
  assert.equal(getTimesheetCellMinutes({ cell: { hours: 6.5 } }), 390)
})

test("getExpectedWorkMinutes respects employee schedule and configured break", () => {
  assert.equal(getExpectedWorkMinutes(
    { programLucruStart: "09:00", programLucruEnd: "15:00", pauzaStart: "12:00", pauzaEnd: "12:30" },
    null,
  ), 330)
})
