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

test("ADD_OVERTIME — 30 min (0.5h) adaugă interval de 30 minute", () => {
  const next = buildTimesheetCellForHrRequest({
    requestId: "req-overtime-30m",
    kind: "ADD_OVERTIME",
    payload: { date: "2026-05-18", overtimeHours: 0.5 },
    existing: { code: "WORK", entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }] },
    programEnd: "16:30",
  })

  assert.ok(next)
  assert.deepEqual(next.entries?.find((e: any) => e.sourceRequestId === "req-overtime-30m"), {
    start: "16:30",
    end: "17:00",
    project: "Ore suplimentare",
    methodStart: "Aprobat cerere",
    methodEnd: "Aprobat cerere",
    sourceRequestId: "req-overtime-30m",
    sourceRequestKind: "ADD_OVERTIME",
  })
})

test("ADD_OVERTIME — corectează cereri vechi cu 30 introdus ca ore (minute)", () => {
  const next = buildTimesheetCellForHrRequest({
    requestId: "req-overtime-legacy-30",
    kind: "ADD_OVERTIME",
    payload: { date: "2026-05-18", overtimeHours: 30 },
    existing: { code: "WORK", entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }] },
    programEnd: "16:30",
  })

  assert.ok(next)
  assert.deepEqual(next.entries?.find((e: any) => e.sourceRequestId === "req-overtime-legacy-30")?.end, "17:00")
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

test("CORRECT_HOURS replaces day with traceable intervals, breaks and recalculated hours", () => {
  const next = buildTimesheetCellForHrRequest({
    requestId: "req-correct-hours-1",
    kind: "CORRECT_HOURS",
    payload: {
      date: "2026-05-18",
      entries: [
        { start: "08:00", end: "12:00", project: "Pontaj" },
        { start: "12:30", end: "17:00", project: "Pontaj", travelToClient: true },
      ],
      breaks: [{ start: "12:00", end: "12:30" }],
    },
    existing: {
      code: "WORK",
      hours: 2,
      entries: [{ start: "10:00", end: "12:00", project: "Pontaj vechi" }],
    },
  })

  assert.ok(next)
  assert.equal(next.code, "WORK")
  assert.equal(next.hours, 8.5)
  assert.equal(next.sourceRequestId, "req-correct-hours-1")
  assert.equal(next.entries?.length, 2)
  assert.equal(next.entries?.every((entry: any) => entry.sourceRequestId === "req-correct-hours-1"), true)
  assert.equal(next.entries?.[1]?.travelToClient, true)
  assert.deepEqual(next.breaks, [
    {
      start: "12:00",
      end: "12:30",
      sourceRequestId: "req-correct-hours-1",
      sourceRequestKind: "CORRECT_HOURS",
    },
  ])
})

test("IN request creates protected invoire cell with recalculated duration", () => {
  const next = buildTimesheetCellForHrRequest({
    requestId: "req-in-1",
    kind: "IN",
    payload: { date: "2026-05-18", startTime: "10:00", endTime: "12:15" },
  })

  assert.ok(next)
  assert.equal(next.code, "IN")
  assert.equal(next.hours, 2.25)
  assert.deepEqual(next.breaks, [])
  assert.equal(next.entries?.[0]?.project, "Învoire")
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

test("removeHrRequestFromTimesheetCell removes request breaks and recalculates preserved hours", () => {
  const cell: TimesheetCell = {
    code: "WORK",
    entries: [
      { start: "08:00", end: "16:30", project: "Pontaj" },
      {
        start: "17:00",
        end: "18:00",
        project: "Ore suplimentare",
        sourceRequestId: "req-remove-breaks",
        sourceRequestKind: "ADD_OVERTIME",
      },
    ],
    breaks: [
      { start: "12:00", end: "12:30" },
      { start: "17:15", end: "17:30", sourceRequestId: "req-remove-breaks", sourceRequestKind: "ADD_OVERTIME" },
    ],
    hours: 9.25,
  }

  const cleaned = removeHrRequestFromTimesheetCell(cell, "req-remove-breaks")

  assert.ok(cleaned)
  assert.equal(cleaned.entries?.length, 1)
  assert.deepEqual(cleaned.breaks, [{ start: "12:00", end: "12:30" }])
  assert.equal(cleaned.hours, 8)
})
