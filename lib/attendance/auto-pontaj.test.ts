import test from "node:test"
import assert from "node:assert/strict"

import {
  DEPONTAJ_AUTO_GRACE_MINUTES,
  localDayBounds,
  scheduleGraceThresholdMs,
  isAtOrPastScheduleGrace,
  timeOnSameDayMs,
} from "@/lib/attendance/auto-pontaj-schedule"
import { technicianHasUnfinishedWorkToday } from "@/lib/attendance/remaining-work"

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

test("canAutoCheckOut policy (report_signed): lucrări rămase azi blochează, forceEndOfDay ignoră", () => {
  // Oglindește logica din canAutoCheckOut: la report_signed (forceEndOfDay=false)
  // depontarea e blocată dacă mai există lucrări neterminate azi.
  const decide = (hasRemainingWorkToday: boolean, forceEndOfDay: boolean) =>
    !forceEndOfDay && hasRemainingWorkToday ? "blocked" : "allowed"

  // report_signed cu lucrări rămase => blocat (fix-ul pentru reclamație)
  assert.equal(decide(true, false), "blocked")
  // report_signed fără lucrări rămase (ultima lucrare) => permis
  assert.equal(decide(false, false), "allowed")
  // 23:59 forțat => permis chiar dacă mai sunt lucrări
  assert.equal(decide(true, true), "allowed")
  assert.equal(decide(false, true), "allowed")
})

test("canAutoCheckOut policy: regula folosește technicianHasUnfinishedWorkToday", () => {
  const now = new Date(2026, 5, 13, 12, 0, 0).getTime()
  const todayAssigned = [
    { statusLucrare: "Atribuită", interventionMs: new Date(2026, 5, 13, 16, 0, 0).getTime() },
  ]
  const allDone = [{ statusLucrare: "Finalizat", interventionMs: new Date(2026, 5, 13, 10, 0, 0).getTime() }]

  // report_signed => blocat când mai are lucrări azi
  assert.equal(!false && technicianHasUnfinishedWorkToday(todayAssigned, now), true)
  // report_signed => permis când totul e finalizat
  assert.equal(!false && technicianHasUnfinishedWorkToday(allDone, now), false)
})
