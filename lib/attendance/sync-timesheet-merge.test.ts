import test from "node:test"
import assert from "node:assert/strict"

import { buildAttendanceTimesheetCell } from "@/lib/attendance/sync-timesheet-merge"
import type { TimesheetCell, TimesheetCode } from "@/lib/hr/types"

const attendanceEntry = (start: string, end: string, id = "att-new") => ({
  start,
  end,
  methodStart: "Play (field)",
  methodEnd: "Stop (field)",
  project: "Pontaj",
  attendanceSessionId: id,
})

test("manual attendance sync preserves approved overtime request entries", () => {
  const existing: TimesheetCell = {
    code: "WORK",
    hours: 10.5,
    entries: [
      { start: "08:00", end: "16:30", project: "Pontaj", attendanceSessionId: "att-old" },
      {
        start: "16:30",
        end: "18:30",
        project: "Ore suplimentare",
        sourceRequestId: "req-overtime-1",
        sourceRequestKind: "ADD_OVERTIME",
      },
    ],
  }

  const result = buildAttendanceTimesheetCell({
    existingDay: existing,
    computedEntries: [attendanceEntry("08:00", "16:30")],
  })

  assert.ok(result.cell)
  assert.equal(result.cell.entries?.length, 2)
  assert.equal(result.cell.entries?.some((entry) => entry.attendanceSessionId === "att-old"), false)
  assert.equal(result.cell.entries?.some((entry) => entry.attendanceSessionId === "att-new"), true)
  assert.equal(result.cell.entries?.some((entry) => entry.sourceRequestId === "req-overtime-1"), true)
  assert.equal(result.cell.hours, 10.5)
})

test("manual attendance sync preserves manual non-pontaj entries", () => {
  const existing: TimesheetCell = {
    code: "WORK",
    entries: [
      { start: "07:30", end: "08:00", project: "Pregătire teren" },
      { start: "08:00", end: "16:00", project: "Pontaj", attendanceSessionId: "att-old" },
    ],
  }

  const result = buildAttendanceTimesheetCell({
    existingDay: existing,
    computedEntries: [attendanceEntry("08:00", "16:30")],
  })

  assert.ok(result.cell)
  assert.deepEqual(result.cell.entries?.map((entry) => entry.project), ["Pregătire teren", "Pontaj"])
  assert.equal(result.cell.hours, 9)
})

test("manual attendance sync keeps real pontaj evidence even when it overlaps preserved entries", () => {
  const existing: TimesheetCell = {
    code: "WORK",
    entries: [{ start: "09:00", end: "10:00", project: "Intervenție manuală" }],
  }

  const result = buildAttendanceTimesheetCell({
    existingDay: existing,
    computedEntries: [attendanceEntry("08:00", "16:30")],
  })

  assert.ok(result.cell)
  assert.equal(result.cell.entries?.length, 2)
  assert.equal(result.cell.entries?.some((entry) => entry.project === "Intervenție manuală"), true)
  assert.equal(result.cell.entries?.some((entry) => entry.project === "Pontaj"), true)
  assert.equal(result.cell.hours, 8.5)
})

test("manual attendance sync preserves breaks and subtracts them from final combined hours", () => {
  const result = buildAttendanceTimesheetCell({
    existingDay: {
      code: "WORK",
      entries: [
        {
          start: "16:30",
          end: "18:30",
          project: "Ore suplimentare",
          sourceRequestId: "req-overtime-2",
          sourceRequestKind: "ADD_OVERTIME",
        },
      ],
      breaks: [{ start: "12:00", end: "12:30" }],
    },
    computedEntries: [attendanceEntry("08:00", "16:30")],
  })

  assert.ok(result.cell)
  assert.deepEqual(result.cell.breaks, [{ start: "12:00", end: "12:30" }])
  assert.equal(result.cell.hours, 10)
})

test("manual attendance sync preserves special work-compatible codes", () => {
  for (const code of ["DEL", "WE", "SL"] as TimesheetCode[]) {
    const result = buildAttendanceTimesheetCell({
      existingDay: { code, entries: [{ start: "16:30", end: "17:30", project: "Ore suplimentare" }] },
      computedEntries: [attendanceEntry("08:00", "16:30")],
    })

    assert.ok(result.cell)
    assert.equal(result.cell.code, code)
    assert.equal(result.cell.entries?.length, 2)
  }
})

test("manual attendance sync protects leave and absence codes", () => {
  for (const code of ["CO", "CFP", "CM", "IN"] as TimesheetCode[]) {
    const result = buildAttendanceTimesheetCell({
      existingDay: { code, entries: [{ start: "08:00", end: "16:30", project: "Concediu" }] },
      computedEntries: [attendanceEntry("08:00", "16:30")],
    })

    assert.equal(result.cell, null)
    assert.equal(result.protectedCode, code)
  }
})

test("manual attendance sync applies default break only when no manual break exists", () => {
  const result = buildAttendanceTimesheetCell({
    computedEntries: [attendanceEntry("08:00", "16:30")],
    defaultBreak: { start: "12:00", end: "12:30" },
  })

  assert.ok(result.cell)
  assert.equal(result.cell.hours, 8)
})

test("manual attendance sync prefers manual break over default break", () => {
  const result = buildAttendanceTimesheetCell({
    existingDay: { code: "WORK", breaks: [{ start: "13:00", end: "14:00" }] },
    computedEntries: [attendanceEntry("08:00", "16:30")],
    defaultBreak: { start: "12:00", end: "12:30" },
  })

  assert.ok(result.cell)
  assert.equal(result.cell.hours, 7.5)
})

test("manual attendance sync subtracts only break overlap with worked intervals", () => {
  const result = buildAttendanceTimesheetCell({
    computedEntries: [attendanceEntry("08:00", "10:00")],
    defaultBreak: { start: "09:30", end: "11:00" },
  })

  assert.ok(result.cell)
  assert.equal(result.cell.hours, 1.5)
})

test("manual attendance sync removes invalid computed entries and invalid preserved entries from hours", () => {
  const result = buildAttendanceTimesheetCell({
    existingDay: {
      code: "WORK",
      entries: [
        { start: "18:00", end: "17:00", project: "Manual invalid" },
        { start: "16:30", end: "17:30", project: "Ore suplimentare" },
      ],
    },
    computedEntries: [
      attendanceEntry("08:00", "16:30"),
      attendanceEntry("bad", "17:00", "att-invalid"),
      attendanceEntry("15:00", "14:00", "att-reversed"),
    ],
  })

  assert.ok(result.cell)
  assert.equal(result.cell.entries?.length, 2)
  assert.equal(result.cell.hours, 9.5)
})

test("manual attendance sync normalizes overlapping computed pontaj entries deterministically", () => {
  const result = buildAttendanceTimesheetCell({
    computedEntries: [
      attendanceEntry("08:00", "12:00", "att-1"),
      attendanceEntry("11:00", "16:30", "att-2"),
      attendanceEntry("16:30", "17:30", "att-3"),
    ],
  })

  assert.ok(result.cell)
  assert.deepEqual(result.cell.entries?.map((entry) => entry.attendanceSessionId), ["att-1", "att-3"])
  assert.equal(result.cell.hours, 5)
})

test("manual attendance sync keeps existing whole-day source metadata off regenerated WORK cell", () => {
  const result = buildAttendanceTimesheetCell({
    existingDay: {
      code: "DEL",
      sourceRequestId: "delegation-request",
      sourceRequestKind: "DEL",
      entries: [{ start: "16:30", end: "17:00", project: "Ore suplimentare" }],
    },
    computedEntries: [attendanceEntry("08:00", "16:30")],
  })

  assert.ok(result.cell)
  assert.equal(result.cell.code, "DEL")
  assert.equal(result.cell.sourceRequestId, undefined)
  assert.equal(result.cell.sourceRequestKind, undefined)
})
