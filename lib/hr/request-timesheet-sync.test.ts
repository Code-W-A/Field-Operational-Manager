import test from "node:test"
import assert from "node:assert/strict"

import {
  buildTimesheetCellForHrRequest,
  daysByMonthFromRequest,
  removeHrRequestFromTimesheetCell,
} from "./request-timesheet-sync"
import type { TimesheetCell } from "./types"

test("daysByMonthFromRequest includes single-day overtime and corrections", () => {
  assert.deepEqual(daysByMonthFromRequest("ADD_OVERTIME", { date: "2026-05-18", overtimeHours: 2 }), {
    "2026-05": [18],
  })
  assert.deepEqual(daysByMonthFromRequest("CORRECT_HOURS", { date: "2026-05-19", entries: [] }), {
    "2026-05": [19],
  })
})

test("ADD_OVERTIME appends one traceable interval and preserves existing pontaj", () => {
  const existing: TimesheetCell = {
    code: "WORK",
    entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }],
    breaks: [{ start: "12:00", end: "12:30" }],
    hours: 8,
  }

  const next = buildTimesheetCellForHrRequest({
    requestId: "req-overtime-1",
    kind: "ADD_OVERTIME",
    payload: { date: "2026-05-18", overtimeHours: 1.5 },
    existing,
    programEnd: "16:30",
  })

  assert.ok(next)
  assert.equal(next.code, "WORK")
  assert.equal(next.entries?.length, 2)
  assert.deepEqual(next.entries?.[0], existing.entries?.[0])
  assert.deepEqual(next.entries?.[1], {
    start: "16:30",
    end: "18:00",
    project: "Ore suplimentare",
    methodStart: "Aprobat cerere",
    methodEnd: "Aprobat cerere",
    sourceRequestId: "req-overtime-1",
    sourceRequestKind: "ADD_OVERTIME",
  })
  assert.equal(next.hours, 9.5)
})

test("ADD_OVERTIME is idempotent when the same request is synced again", () => {
  const once = buildTimesheetCellForHrRequest({
    requestId: "req-overtime-2",
    kind: "ADD_OVERTIME",
    payload: { date: "2026-05-18", overtimeHours: 1 },
    existing: { code: "WORK", entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }] },
    programEnd: "16:30",
  })
  const twice = buildTimesheetCellForHrRequest({
    requestId: "req-overtime-2",
    kind: "ADD_OVERTIME",
    payload: { date: "2026-05-18", overtimeHours: 2 },
    existing: once,
    programEnd: "16:30",
  })

  assert.ok(twice)
  assert.equal(twice.entries?.filter((e: any) => e.sourceRequestId === "req-overtime-2").length, 1)
  assert.deepEqual(twice.entries?.find((e: any) => e.sourceRequestId === "req-overtime-2"), {
    start: "16:30",
    end: "18:30",
    project: "Ore suplimentare",
    methodStart: "Aprobat cerere",
    methodEnd: "Aprobat cerere",
    sourceRequestId: "req-overtime-2",
    sourceRequestKind: "ADD_OVERTIME",
  })
})

test("removeHrRequestFromTimesheetCell removes only the request interval", () => {
  const cell: TimesheetCell = {
    code: "WORK",
    entries: [
      { start: "08:00", end: "16:30", project: "Pontaj" },
      { start: "16:30", end: "18:30", project: "Ore suplimentare", sourceRequestId: "req-overtime-3", sourceRequestKind: "ADD_OVERTIME" },
    ],
    hours: 10.5,
  }

  const cleaned = removeHrRequestFromTimesheetCell(cell, "req-overtime-3")

  assert.ok(cleaned)
  assert.equal(cleaned.entries?.length, 1)
  assert.deepEqual(cleaned.entries?.[0], { start: "08:00", end: "16:30", project: "Pontaj" })
  assert.equal(cleaned.hours, 8.5)
})
