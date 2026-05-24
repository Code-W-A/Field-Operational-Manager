import test from "node:test"
import assert from "node:assert/strict"

import { buildTimesheetCellForHrRequest, daysByMonthFromRequest } from "./request-timesheet-sync"
import type { TimesheetCell } from "./types"

test("smoke: approved overtime request becomes visible in the same condica cell as pontaj", () => {
  const monthDays = daysByMonthFromRequest("ADD_OVERTIME", { kind: "ADD_OVERTIME", date: "2026-05-18", overtimeHours: 2 })
  assert.deepEqual(monthDays, { "2026-05": [18] })

  const completedPontajCell: TimesheetCell = {
    code: "WORK",
    entries: [{ start: "08:00", end: "16:30", project: "Pontaj", attendanceSessionId: "att-ban-1" }],
    hours: 8.5,
  }

  const visibleCell = buildTimesheetCellForHrRequest({
    requestId: "req-ban-overtime",
    kind: "ADD_OVERTIME",
    payload: { kind: "ADD_OVERTIME", date: "2026-05-18", overtimeHours: 2 },
    existing: completedPontajCell,
    programEnd: "16:30",
  })

  assert.ok(visibleCell)
  assert.equal(visibleCell.code, "WORK")
  assert.equal(visibleCell.entries?.some((e) => e.project === "Pontaj" && e.attendanceSessionId === "att-ban-1"), true)
  assert.equal(visibleCell.entries?.some((e) => e.project === "Ore suplimentare" && e.sourceRequestId === "req-ban-overtime"), true)
  assert.equal(visibleCell.hours, 10.5)
})
