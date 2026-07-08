import test from "node:test"
import assert from "node:assert/strict"

import {
  AUTO_CHECKOUT_ENABLED,
  AUTO_EOD_STOP_ENABLED,
  clampSessionEndMs,
  endOfLocalDayMs,
  forgottenSessionEndMs,
} from "@/lib/attendance/auto-pontaj-schedule"

test("AUTO_CHECKOUT_ENABLED stays false (depontarea agresivă din timpul zilei rămâne oprită)", () => {
  assert.equal(AUTO_CHECKOUT_ENABLED, false)
})

test("AUTO_EOD_STOP_ENABLED este true (plasa de siguranță 23:59 activă)", () => {
  assert.equal(AUTO_EOD_STOP_ENABLED, true)
})

test("endOfLocalDayMs întoarce 23:59:59.999 în aceeași zi", () => {
  const ref = new Date(2026, 5, 16, 9, 30, 0).getTime()
  const eod = new Date(endOfLocalDayMs(ref))
  assert.equal(eod.getFullYear(), 2026)
  assert.equal(eod.getMonth(), 5)
  assert.equal(eod.getDate(), 16)
  assert.equal(eod.getHours(), 23)
  assert.equal(eod.getMinutes(), 59)
})

test("clamp: Stop în aceeași zi rămâne neschimbat (inclusiv ture târzii 18:00)", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  const stop = new Date(2026, 5, 16, 18, 0, 0).getTime()
  assert.equal(clampSessionEndMs(start, stop, "16:30"), stop)
})

test("clamp: sesiune uitată peste noapte => ora de final a programului din ziua de start", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  // Uitat deschis, închis abia pe 19 la 10:00
  const lateStop = new Date(2026, 5, 19, 10, 0, 0).getTime()
  const expected = new Date(2026, 5, 16, 16, 30, 0, 0).getTime()
  assert.equal(clampSessionEndMs(start, lateStop, "16:30"), expected)
})

test("clamp: program end lipsă => default 16:30 pe ziua de start", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  const lateStop = new Date(2026, 5, 17, 9, 0, 0).getTime()
  const expected = new Date(2026, 5, 16, 16, 30, 0, 0).getTime()
  assert.equal(clampSessionEndMs(start, lateStop, undefined), expected)
})

test("clamp: tură de seară (start după program end) uitată => sfârșitul zilei de start", () => {
  const start = new Date(2026, 5, 16, 20, 0, 0).getTime()
  const lateStop = new Date(2026, 5, 18, 7, 0, 0).getTime()
  const expected = endOfLocalDayMs(start)
  assert.equal(clampSessionEndMs(start, lateStop, "16:30"), expected)
})

test("clamp: requestedEnd invalid (NaN) => folosește forgottenSessionEndMs", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  assert.equal(clampSessionEndMs(start, Number.NaN, "16:30"), forgottenSessionEndMs(start, "16:30"))
})

test("forgottenSessionEndMs: program end normal pe ziua de start", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  const expected = new Date(2026, 5, 16, 17, 0, 0, 0).getTime()
  assert.equal(forgottenSessionEndMs(start, "17:00"), expected)
})

test("forgottenSessionEndMs: program end invalid => fallback 16:30", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  const expected = new Date(2026, 5, 16, 16, 30, 0, 0).getTime()
  assert.equal(forgottenSessionEndMs(start, "99:99"), expected)
  assert.equal(forgottenSessionEndMs(start, "abc"), expected)
})

test("forgottenSessionEndMs: program end egal cu start => sfârșitul zilei", () => {
  const start = new Date(2026, 5, 16, 16, 30, 0).getTime()
  assert.equal(forgottenSessionEndMs(start, "16:30"), endOfLocalDayMs(start))
})

test("clamp: Stop exact la 23:59:59.999 în ziua de start rămâne permis", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  const stop = endOfLocalDayMs(start)
  assert.equal(clampSessionEndMs(start, stop, "16:30"), stop)
})

test("clamp: Stop la 00:00 ziua următoare este limitat la program end", () => {
  const start = new Date(2026, 5, 16, 8, 0, 0).getTime()
  const stop = new Date(2026, 5, 17, 0, 0, 0).getTime()
  const expected = new Date(2026, 5, 16, 16, 30, 0, 0).getTime()
  assert.equal(clampSessionEndMs(start, stop, "16:30"), expected)
})
