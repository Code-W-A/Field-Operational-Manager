import assert from "node:assert/strict"
import test from "node:test"

import { buildTimesheetChartRows } from "@/lib/hr/timesheet-chart-rows"

test("TimesheetCharts uses the same effective interval minutes as the HR KPI", () => {
  const rows = buildTimesheetChartRows(
    "2026-07",
    [{ id: "emp", nume: "Test", prenume: "Ana", active: true }],
    [{
      employeeId: "emp",
      monthKey: "2026-07",
      updatedAt: 0,
      days: {
        "8": {
          code: "WORK",
          hours: 8.5,
          entries: [{ start: "08:00", end: "16:30" }],
          breaks: [{ start: "12:30", end: "13:00" }],
        },
      },
    }],
  )

  assert.equal(rows[0].hours, 8)
})
