import test from "node:test"
import assert from "node:assert/strict"

import type { Employee, HrRequest } from "@/lib/hr/types"
import {
  extractApprovedOvertime,
  aggregateOvertimeGeneral,
  aggregateOvertimeByEmployee,
  formatOvertimeCSV,
  formatDateRo,
  formatMonthRo,
  currentYearRange,
  type OvertimeEntry,
} from "@/lib/hr/overtime-report"

// --- Fixtures ---

const employees: Employee[] = [
  { id: "emp-1", nume: "Popescu", prenume: "Ion", active: true },
  { id: "emp-2", nume: "Ionescu", prenume: "Maria", active: true },
  { id: "emp-3", nume: "Vasilescu", prenume: "Andrei", active: false },
]

function makeOvertimeRequest(
  overrides: Partial<HrRequest> & { date?: string; overtimeHours?: number; reason?: string },
): HrRequest {
  return {
    id: overrides.id || "req-1",
    employeeId: overrides.employeeId || "emp-1",
    employeeName: overrides.employeeName,
    requesterUid: "uid-1",
    sectorId: "sector-1",
    managerUid: "mgr-1",
    kind: "ADD_OVERTIME",
    status: overrides.status || "approved",
    payload: {
      kind: "ADD_OVERTIME",
      date: overrides.date || "2026-03-15",
      overtimeHours: overrides.overtimeHours ?? 1.5,
      reason: overrides.reason,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
    // ensure payload isn't overwritten by spread
    payload: {
      kind: "ADD_OVERTIME",
      date: overrides.date || "2026-03-15",
      overtimeHours: overrides.overtimeHours ?? 1.5,
      reason: overrides.reason,
    },
  } as HrRequest
}

// --- extractApprovedOvertime ---

test("extractApprovedOvertime: filters only ADD_OVERTIME + approved", () => {
  const requests: HrRequest[] = [
    makeOvertimeRequest({ id: "r1", status: "approved", date: "2026-03-15", overtimeHours: 1.5 }),
    makeOvertimeRequest({ id: "r2", status: "pending", date: "2026-03-16", overtimeHours: 2 }),
    makeOvertimeRequest({ id: "r3", status: "rejected", date: "2026-03-17", overtimeHours: 1 }),
    {
      id: "r4",
      employeeId: "emp-1",
      requesterUid: "uid-1",
      sectorId: "s",
      managerUid: "m",
      kind: "CO",
      status: "approved",
      payload: { kind: "CO", startDate: "2026-03-20", endDate: "2026-03-22" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as HrRequest,
  ]

  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result.length, 1)
  assert.equal(result[0].requestId, "r1")
  assert.equal(result[0].hours, 1.5)
})

test("extractApprovedOvertime: joins employee name from employees list", () => {
  const requests = [makeOvertimeRequest({ id: "r1", employeeId: "emp-2" })]
  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result[0].employeeName, "Maria Ionescu")
})

test("extractApprovedOvertime: falls back to employeeName from request", () => {
  const requests = [makeOvertimeRequest({ id: "r1", employeeId: "emp-unknown", employeeName: "Gheorghe Zamfir" })]
  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result[0].employeeName, "Gheorghe Zamfir")
})

test("extractApprovedOvertime: falls back to employeeId when no name available", () => {
  const requests = [makeOvertimeRequest({ id: "r1", employeeId: "emp-unknown", employeeName: undefined })]
  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result[0].employeeName, "emp-unknown")
})

test("extractApprovedOvertime: normalizes legacy 30-as-hours to 0.5h", () => {
  const requests = [makeOvertimeRequest({ id: "r1", overtimeHours: 30 })]
  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result[0].hours, 0.5)
})

test("extractApprovedOvertime: date range filtering", () => {
  const requests = [
    makeOvertimeRequest({ id: "r1", date: "2026-01-10" }),
    makeOvertimeRequest({ id: "r2", date: "2026-03-15" }),
    makeOvertimeRequest({ id: "r3", date: "2026-06-20" }),
  ]

  const result = extractApprovedOvertime(requests, employees, { from: "2026-02-01", to: "2026-05-31" })
  assert.equal(result.length, 1)
  assert.equal(result[0].requestId, "r2")
})

test("extractApprovedOvertime: from-only range", () => {
  const requests = [
    makeOvertimeRequest({ id: "r1", date: "2026-01-10" }),
    makeOvertimeRequest({ id: "r2", date: "2026-06-20" }),
  ]
  const result = extractApprovedOvertime(requests, employees, { from: "2026-06-01" })
  assert.equal(result.length, 1)
  assert.equal(result[0].requestId, "r2")
})

test("extractApprovedOvertime: to-only range", () => {
  const requests = [
    makeOvertimeRequest({ id: "r1", date: "2026-01-10" }),
    makeOvertimeRequest({ id: "r2", date: "2026-06-20" }),
  ]
  const result = extractApprovedOvertime(requests, employees, { to: "2026-03-01" })
  assert.equal(result.length, 1)
  assert.equal(result[0].requestId, "r1")
})

test("extractApprovedOvertime: skips invalid dates", () => {
  const requests = [makeOvertimeRequest({ id: "r1", date: "invalid" })]
  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result.length, 0)
})

test("extractApprovedOvertime: skips zero/negative hours", () => {
  const requests = [makeOvertimeRequest({ id: "r1", overtimeHours: 0 })]
  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result.length, 0)
})

test("extractApprovedOvertime: empty requests returns empty", () => {
  assert.deepEqual(extractApprovedOvertime([], employees), [])
})

test("extractApprovedOvertime: results sorted by date then name", () => {
  const requests = [
    makeOvertimeRequest({ id: "r1", employeeId: "emp-2", date: "2026-03-15" }),
    makeOvertimeRequest({ id: "r2", employeeId: "emp-1", date: "2026-03-15" }),
    makeOvertimeRequest({ id: "r3", employeeId: "emp-1", date: "2026-03-10" }),
  ]
  const result = extractApprovedOvertime(requests, employees)
  assert.equal(result[0].date, "2026-03-10")
  assert.equal(result[1].employeeName, "Ion Popescu")
  assert.equal(result[2].employeeName, "Maria Ionescu")
})

// --- aggregateOvertimeGeneral ---

test("aggregateOvertimeGeneral: totals and groups correctly", () => {
  const entries: OvertimeEntry[] = [
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-15", hours: 1.5, requestId: "r1" },
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-20", hours: 2, requestId: "r2" },
    { employeeId: "emp-2", employeeName: "Maria Ionescu", date: "2026-04-10", hours: 0.5, requestId: "r3" },
  ]

  const stats = aggregateOvertimeGeneral(entries)
  assert.equal(stats.totalHours, 4)
  assert.equal(stats.totalRequests, 3)

  assert.equal(stats.byMonth.length, 2)
  assert.equal(stats.byMonth[0].month, "2026-03")
  assert.equal(stats.byMonth[0].hours, 3.5)
  assert.equal(stats.byMonth[0].count, 2)
  assert.equal(stats.byMonth[1].month, "2026-04")
  assert.equal(stats.byMonth[1].hours, 0.5)

  assert.equal(stats.byEmployee.length, 2)
  assert.equal(stats.byEmployee[0].employeeId, "emp-1")
  assert.equal(stats.byEmployee[0].hours, 3.5)
  assert.equal(stats.byEmployee[1].employeeId, "emp-2")
  assert.equal(stats.byEmployee[1].hours, 0.5)
})

test("aggregateOvertimeGeneral: empty entries", () => {
  const stats = aggregateOvertimeGeneral([])
  assert.equal(stats.totalHours, 0)
  assert.equal(stats.totalRequests, 0)
  assert.deepEqual(stats.byMonth, [])
  assert.deepEqual(stats.byEmployee, [])
})

test("aggregateOvertimeGeneral: byEmployee sorted descending by hours", () => {
  const entries: OvertimeEntry[] = [
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-15", hours: 1, requestId: "r1" },
    { employeeId: "emp-2", employeeName: "Maria Ionescu", date: "2026-03-15", hours: 5, requestId: "r2" },
  ]
  const stats = aggregateOvertimeGeneral(entries)
  assert.equal(stats.byEmployee[0].employeeId, "emp-2")
  assert.equal(stats.byEmployee[1].employeeId, "emp-1")
})

// --- aggregateOvertimeByEmployee ---

test("aggregateOvertimeByEmployee: groups with nested entries", () => {
  const entries: OvertimeEntry[] = [
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-15", hours: 1, reason: "Urgenta", requestId: "r1" },
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-20", hours: 2, requestId: "r2" },
    { employeeId: "emp-2", employeeName: "Maria Ionescu", date: "2026-03-10", hours: 5, requestId: "r3" },
  ]

  const result = aggregateOvertimeByEmployee(entries)
  assert.equal(result.length, 2)

  assert.equal(result[0].employeeId, "emp-2")
  assert.equal(result[0].hours, 5)
  assert.equal(result[0].entries.length, 1)

  assert.equal(result[1].employeeId, "emp-1")
  assert.equal(result[1].hours, 3)
  assert.equal(result[1].count, 2)
  assert.equal(result[1].entries.length, 2)
  assert.equal(result[1].entries[0].date, "2026-03-15")
  assert.equal(result[1].entries[1].date, "2026-03-20")
})

// --- formatOvertimeCSV ---

test("formatOvertimeCSV general: header + employee rows", () => {
  const entries: OvertimeEntry[] = [
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-15", hours: 1.5, requestId: "r1" },
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-20", hours: 2, requestId: "r2" },
  ]

  const csv = formatOvertimeCSV(entries, "general")
  const lines = csv.split("\n")
  assert.equal(lines.length, 2) // header + 1 employee
  assert.match(lines[0], /Angajat/)
  assert.match(lines[0], /Total Ore/)
  assert.match(lines[1], /Ion Popescu/)
})

test("formatOvertimeCSV detailed: header + entry rows", () => {
  const entries: OvertimeEntry[] = [
    { employeeId: "emp-1", employeeName: "Ion Popescu", date: "2026-03-15", hours: 1.5, reason: "Proiect urgent", requestId: "r1" },
    { employeeId: "emp-2", employeeName: "Maria Ionescu", date: "2026-04-10", hours: 0.5, requestId: "r2" },
  ]

  const csv = formatOvertimeCSV(entries, "detailed")
  const lines = csv.split("\n")
  assert.equal(lines.length, 3) // header + 2 entries
  assert.match(lines[0], /Angajat/)
  assert.match(lines[0], /Data/)
  assert.match(lines[0], /Motiv/)
  assert.match(lines[1], /Proiect urgent/)
  assert.match(lines[2], /Maria Ionescu/)
})

test("formatOvertimeCSV: escapes double quotes in fields", () => {
  const entries: OvertimeEntry[] = [
    { employeeId: "emp-1", employeeName: 'Ion "Nelu" Popescu', date: "2026-03-15", hours: 1, requestId: "r1" },
  ]
  const csv = formatOvertimeCSV(entries, "detailed")
  assert.match(csv, /Ion ""Nelu"" Popescu/)
})

// --- helpers ---

test("formatDateRo: converts ISO to Romanian format", () => {
  assert.equal(formatDateRo("2026-03-15"), "15.03.2026")
  assert.equal(formatDateRo("2026-12-01"), "01.12.2026")
})

test("formatDateRo: returns input for invalid dates", () => {
  assert.equal(formatDateRo("invalid"), "invalid")
  assert.equal(formatDateRo(""), "")
})

test("formatMonthRo: converts month key to Romanian label", () => {
  assert.equal(formatMonthRo("2026-01"), "Ianuarie 2026")
  assert.equal(formatMonthRo("2026-12"), "Decembrie 2026")
  assert.equal(formatMonthRo("2026-06"), "Iunie 2026")
})

test("currentYearRange: returns jan-dec of current year", () => {
  const range = currentYearRange()
  const year = new Date().getFullYear()
  assert.equal(range.from, `${year}-01-01`)
  assert.equal(range.to, `${year}-12-31`)
})
