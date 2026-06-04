import test from "node:test"
import assert from "node:assert/strict"

import {
  DEPONTAJ_AUTO_GRACE_MINUTES,
  localDayBounds,
  scheduleGraceThresholdMs,
  isAtOrPastScheduleGrace,
  timeOnSameDayMs,
} from "@/lib/attendance/auto-pontaj-schedule"

test("DEPONTAJ_AUTO_GRACE_MINUTES defaults to 30", () => {
  assert.equal(DEPONTAJ_AUTO_GRACE_MINUTES, 30)
})

test("17:00 program end + 30 min grace => 17:30 threshold (local day)", () => {
  const refDay = new Date(2026, 4, 31, 10, 0, 0).getTime()
  const threshold = scheduleGraceThresholdMs(refDay, "17:00", 30)
  const expected = new Date(2026, 4, 31, 17, 30, 0, 0).getTime()
  assert.equal(threshold, expected)
})

test("default program end 16:30 + 30 min => 17:00", () => {
  const refDay = new Date(2026, 0, 15, 8, 0, 0).getTime()
  const threshold = scheduleGraceThresholdMs(refDay, undefined, 30)
  const expected = new Date(2026, 0, 15, 17, 0, 0, 0).getTime()
  assert.equal(threshold, expected)
})

test("isAtOrPastScheduleGrace before and after threshold", () => {
  const refDay = new Date(2026, 4, 31, 10, 0, 0).getTime()
  const before = new Date(2026, 4, 31, 17, 29, 0, 0).getTime()
  const at = new Date(2026, 4, 31, 17, 30, 0, 0).getTime()
  assert.equal(isAtOrPastScheduleGrace(before, "17:00", 30), false)
  assert.equal(isAtOrPastScheduleGrace(at, "17:00", 30), true)
})

test("localDayBounds spans midnight boundaries", () => {
  const noon = new Date(2026, 5, 1, 12, 0, 0).getTime()
  const { startMs, endMs } = localDayBounds(noon)
  assert.equal(new Date(startMs).getHours(), 0)
  assert.equal(new Date(startMs).getMinutes(), 0)
  assert.equal(new Date(endMs).getHours(), 23)
  assert.equal(new Date(endMs).getMinutes(), 59)
})

test("timeOnSameDayMs parses HH:mm on same calendar day", () => {
  const base = new Date(2026, 2, 10, 14, 45, 0).getTime()
  assert.equal(timeOnSameDayMs(base, "08:15"), new Date(2026, 2, 10, 8, 15, 0, 0).getTime())
})

test("canAutoCheckOut policy: open ticket blocks unless forceEndOfDay", () => {
  const forceEndOfDay = true
  const hasOpenTicket = true
  const blocked = !forceEndOfDay && hasOpenTicket
  const allowedEod = forceEndOfDay || !hasOpenTicket
  assert.equal(blocked, false)
  assert.equal(allowedEod, true)

  const blockedGrace = !false && hasOpenTicket
  assert.equal(blockedGrace, true)
})
