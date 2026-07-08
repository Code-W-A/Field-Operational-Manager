import test from "node:test"
import assert from "node:assert/strict"

import { formatTimesheetsCSV } from "@/lib/hr/export"
import { calculateEmployeeOvertimeBank, calculateEmployeeTimesheetSummary } from "@/lib/hr/timesheet-summary"
import type { Employee, HrRequest, TimesheetCell, TimesheetMonth } from "@/lib/hr/types"

const employee: Employee = {
  id: "emp-1",
  nume: "Popescu",
  prenume: "Ana",
  active: true,
  programLucruStart: "08:00",
  programLucruEnd: "16:30",
  pauzaStart: "12:00",
  pauzaEnd: "12:30",
}

const work = (cell: Partial<TimesheetCell>): TimesheetCell => ({
  code: "WORK",
  ...cell,
})

const request = (partial: Partial<HrRequest> & Pick<HrRequest, "id" | "kind" | "payload">): HrRequest => ({
  employeeId: employee.id,
  requesterUid: "user-1",
  sectorId: "sector-1",
  managerUid: "manager-1",
  status: "approved",
  createdAt: 0,
  updatedAt: 0,
  ...partial,
})

function timesheet(days: TimesheetMonth["days"]): TimesheetMonth {
  return {
    employeeId: employee.id,
    monthKey: "2026-03",
    days,
    updatedAt: 0,
  }
}

test("timesheet summary calculates worked days, tickets, presence, bank and client travel", () => {
  const ts = timesheet({
    "2": work({
      hours: 99,
      entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }],
    }),
    "3": work({ hours: 6 }),
    "4": work({
      entries: [
        { start: "07:00", end: "18:00", project: "Pontaj" },
        { start: "07:00", end: "08:00", project: "Traseu către client" },
        { start: "17:00", end: "18:00", project: "Traseu către casă" },
      ],
    }),
    "5": { code: "CO" },
    "6": { code: "DEL" },
    "7": work({ entries: [{ start: "09:00", end: "11:00", project: "Pontaj" }] }),
    "9": work({ hours: 8 }),
    "10": { code: "IN", hours: 2 },
  })

  const requests: HrRequest[] = [
    request({
      id: "co-1",
      kind: "CO",
      payload: { kind: "CO", startDate: "2026-03-05", endDate: "2026-03-05" },
    }),
    request({
      id: "del-1",
      kind: "DEL",
      payload: { kind: "DEL", startDate: "2026-03-06", endDate: "2026-03-06", clientName: "Client" },
    }),
    request({
      id: "in-1",
      kind: "IN",
      payload: { kind: "IN", date: "2026-03-10", startTime: "10:00", endTime: "12:00" },
    }),
  ]

  const summary = calculateEmployeeTimesheetSummary({
    employeeId: employee.id,
    monthKey: "2026-03",
    timesheet: ts,
    employee,
    requests,
    holidays: [{ date: "2026-03-09", label: "Test holiday" }],
  })
  const bank = calculateEmployeeOvertimeBank({
    employeeId: employee.id,
    monthKey: "2026-03",
    timesheet: ts,
    employee,
    requests,
    holidays: [{ date: "2026-03-09", label: "Test holiday" }],
  })

  assert.equal(summary.zileLucrate, 8)
  assert.equal(summary.ticheteMasa, 3)
  assert.equal(summary.orePrezenta, 34.5)
  assert.equal(summary.oreLucrateEfectiv, 34.5)
  assert.equal(bank.overtime, -5.5)
  assert.equal(bank.display, "-5.5h")
  assert.equal(summary.oreTraseuLaClient, 1)
  assert.equal(summary.oreTraseuDeLaClient, 1)
  assert.equal(summary.co, 1)
  assert.equal(summary.del, 1)
  assert.equal(summary.totalTimpIN, 2)
  assert.equal(summary.oreC6, 2)
  assert.equal(summary.oreC7, 8)
})

test("timesheet summary excludes tickets for approved request days even when the cell is WORK", () => {
  const ts = timesheet({
    "2": work({ hours: 8 }),
    "3": work({ hours: 8 }),
  })
  const requests: HrRequest[] = [
    request({
      id: "in-ticket-block",
      kind: "IN",
      payload: { kind: "IN", date: "2026-03-03", startTime: "10:00", endTime: "11:00" },
    }),
  ]

  const summary = calculateEmployeeTimesheetSummary({
    employeeId: employee.id,
    monthKey: "2026-03",
    timesheet: ts,
    employee,
    requests,
  })

  assert.equal(summary.zileLucrate, 2)
  assert.equal(summary.orePrezenta, 16)
  assert.equal(summary.ticheteMasa, 1)
  assert.equal(summary.totalTimpIN, 1)
})

test("timesheet summary counts approved CO and DEL ranges only for the selected month", () => {
  const requests: HrRequest[] = [
    request({
      id: "co-range",
      kind: "CO",
      payload: { kind: "CO", startDate: "2026-02-27", endDate: "2026-03-02" },
    }),
    request({
      id: "del-range",
      kind: "DEL",
      payload: { kind: "DEL", startDate: "2026-03-30", endDate: "2026-04-02", clientName: "Client" },
    }),
    request({
      id: "co-pending",
      kind: "CO",
      status: "pending",
      payload: { kind: "CO", startDate: "2026-03-10", endDate: "2026-03-12" },
    }),
  ]

  const summary = calculateEmployeeTimesheetSummary({
    employeeId: employee.id,
    monthKey: "2026-03",
    timesheet: timesheet({}),
    employee,
    requests,
  })

  assert.equal(summary.co, 2)
  assert.equal(summary.del, 2)
})

test("timesheet summary ignores invalid intervals for IN, pontaj and travel", () => {
  const ts = timesheet({
    "2": work({
      entries: [
        { start: "bad", end: "10:00", project: "Pontaj" },
        { start: "12:00", end: "11:00", project: "Traseu către client" },
      ],
    }),
  })
  const requests: HrRequest[] = [
    request({
      id: "bad-in",
      kind: "IN",
      payload: { kind: "IN", date: "2026-03-02", startTime: "13:00", endTime: "12:00" },
    }),
  ]

  const summary = calculateEmployeeTimesheetSummary({
    employeeId: employee.id,
    monthKey: "2026-03",
    timesheet: ts,
    employee,
    requests,
  })

  assert.equal(summary.zileLucrate, 1)
  assert.equal(summary.orePrezenta, 0)
  assert.equal(summary.ticheteMasa, 0)
  assert.equal(summary.oreTraseuLaClient, 0)
  assert.equal(summary.totalTimpIN, 0)
})

test("formatTimesheetsCSV exports the same summary columns used by the UI", () => {
  const ts = timesheet({
    "1": work({
      entries: [{ start: "07:30", end: "08:00", project: "Traseu către client" }],
    }),
    "2": work({
      entries: [{ start: "08:00", end: "16:30", project: "Pontaj" }],
    }),
  })
  const csv = formatTimesheetsCSV("2026-03", [employee], [ts], {
    requests: [
      request({
        id: "co-export",
        kind: "CO",
        payload: { kind: "CO", startDate: "2026-03-04", endDate: "2026-03-04" },
      }),
      request({
        id: "in-export",
        kind: "IN",
        payload: { kind: "IN", date: "2026-03-05", startTime: "10:00", endTime: "11:30" },
      }),
    ],
  })

  const [header, row] = csv.split("\n")
  assert.match(header, /"Zile lucrate","Tichete de masă","Ore prezență","Bancă de ore","Ore traseu la client","Zile CO","Zile DEL","Ore IN"/)
  assert.match(row, /"Ana Popescu"/)
  assert.match(row, /"2","1","8\.5","-7\.5h","0\.5","1","0","1\.5","8\.5"/)
})
