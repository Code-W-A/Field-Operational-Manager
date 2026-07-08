import type { Employee, HrDefaults, HrRequest, HrRequestStatus, TimesheetMonth } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { normalizeOvertimeHoursValue, formatOvertimeDuration } from "@/lib/hr/overtime-duration"
import { parseHM } from "@/lib/hr/time-calc"

// --- Types ---

export type OvertimeEntry = {
  employeeId: string
  employeeName: string
  date: string // yyyy-mm-dd
  hours: number // normalized decimal hours
  reason?: string
  requestId: string
}

export type OvertimeEmployeeStats = {
  employeeId: string
  name: string
  hours: number
  count: number
}

export type OvertimeMonthStats = {
  month: string // yyyy-mm
  hours: number
  count: number
}

export type OvertimeGeneralStats = {
  totalHours: number
  totalRequests: number
  byMonth: OvertimeMonthStats[]
  byEmployee: OvertimeEmployeeStats[]
}

export type OvertimeDateRange = {
  from?: string // yyyy-mm-dd
  to?: string   // yyyy-mm-dd
}

export type OvertimeReconciliationStatus =
  | "confirmed"
  | "partial"
  | "missing_attendance"
  | "missing_timesheet"
  | "difference"

export type OvertimeReconciliationRow = OvertimeEntry & {
  requestStatus: HrRequestStatus
  requestedMinutes: number
  foundMinutes: number
  diffMinutes: number
  programEnd: string
  status: OvertimeReconciliationStatus
  statusLabel: string
  timesheetHours?: number
  evidenceEntries: string[]
}

export type OvertimeReconciliationFilters = {
  dateRange?: OvertimeDateRange
  requestStatuses?: HrRequestStatus[]
  employeeId?: string
}

const REAL_TIMESHEET_PROJECTS = new Set(["Pontaj", "Traseu către client", "Traseu către casă"])
const OVERTIME_CONFIRM_TOLERANCE_MINUTES = 1

function sumMergedMinutes(ranges: Array<{ start: number; end: number }>): number {
  if (!ranges.length) return 0
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const range of sorted) {
    const last = merged[merged.length - 1]
    if (!last || range.start > last.end) {
      merged.push({ ...range })
      continue
    }
    last.end = Math.max(last.end, range.end)
  }
  return merged.reduce((sum, range) => sum + Math.max(0, range.end - range.start), 0)
}

// --- Extraction ---

export function extractApprovedOvertime(
  requests: HrRequest[],
  employees: Employee[],
  dateRange?: OvertimeDateRange,
): OvertimeEntry[] {
  const employeeMap = new Map<string, Employee>()
  for (const emp of employees) {
    employeeMap.set(emp.id, emp)
  }

  const entries: OvertimeEntry[] = []

  for (const req of requests) {
    if (req.kind !== "ADD_OVERTIME") continue
    if (req.status !== "approved") continue

    const payload = req.payload as { kind: "ADD_OVERTIME"; date: string; overtimeHours: number; reason?: string }
    const date = String(payload.date || "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    if (dateRange?.from && date < dateRange.from) continue
    if (dateRange?.to && date > dateRange.to) continue

    const hours = normalizeOvertimeHoursValue(payload.overtimeHours)
    if (hours <= 0) continue

    const employee = employeeMap.get(req.employeeId)
    const employeeName = req.employeeName
      || getEmployeeFullName(employee)
      || req.employeeId

    entries.push({
      employeeId: req.employeeId,
      employeeName,
      date,
      hours,
      reason: payload.reason || undefined,
      requestId: req.id,
    })
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName, "ro"))
  return entries
}

export function reconcileOvertimeWithTimesheets(params: {
  requests: HrRequest[]
  employees: Employee[]
  timesheets: TimesheetMonth[]
  hrDefaults?: HrDefaults
  filters?: OvertimeReconciliationFilters
}): OvertimeReconciliationRow[] {
  const employeeMap = new Map(params.employees.map((emp) => [emp.id, emp]))
  const timesheetMap = new Map(params.timesheets.map((ts) => [`${ts.employeeId}:${ts.monthKey}`, ts]))
  const statusSet = new Set(params.filters?.requestStatuses ?? ["approved"])

  const rows: OvertimeReconciliationRow[] = []

  for (const req of params.requests) {
    if (req.kind !== "ADD_OVERTIME") continue
    if (!statusSet.has(req.status)) continue
    if (params.filters?.employeeId && req.employeeId !== params.filters.employeeId) continue

    const payload = req.payload as { kind: "ADD_OVERTIME"; date: string; overtimeHours: number; reason?: string }
    const date = String(payload.date || "")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (params.filters?.dateRange?.from && date < params.filters.dateRange.from) continue
    if (params.filters?.dateRange?.to && date > params.filters.dateRange.to) continue

    const hours = normalizeOvertimeHoursValue(payload.overtimeHours)
    if (hours <= 0) continue

    const employee = employeeMap.get(req.employeeId)
    const employeeName = req.employeeName || getEmployeeFullName(employee) || req.employeeId
    const requestedMinutes = Math.round(hours * 60)
    const programEnd = employee?.programLucruEnd || params.hrDefaults?.programLucruEnd || "16:30"
    const programEndMinutes = parseHM(programEnd)
    const monthKey = date.slice(0, 7)
    const dayKey = String(Number(date.slice(8, 10)))
    const timesheet = timesheetMap.get(`${req.employeeId}:${monthKey}`)
    const cell = timesheet?.days?.[dayKey]

    let foundMinutes = 0
    const evidenceEntries: string[] = []
    let status: OvertimeReconciliationStatus = "missing_timesheet"

    if (!timesheet || !cell) {
      status = "missing_timesheet"
    } else if (programEndMinutes == null) {
      status = "difference"
    } else {
      const realEntries = (cell.entries ?? []).filter((entry: any) => {
        if (entry?.sourceRequestKind === "ADD_OVERTIME") return false
        if (entry?.sourceRequestId === req.id) return false
        if (entry?.attendanceSessionId) return true
        return REAL_TIMESHEET_PROJECTS.has(String(entry?.project ?? ""))
      })

      const evidenceRanges: Array<{ start: number; end: number }> = []
      for (const entry of realEntries as Array<{ start: string; end: string; project?: string }>) {
        const start = parseHM(entry.start)
        const end = parseHM(entry.end)
        if (start == null || end == null || end <= start) continue
        const overlapStart = Math.max(start, programEndMinutes)
        const overlapEnd = Math.min(end, 23 * 60 + 59)
        if (overlapEnd <= overlapStart) continue
        evidenceRanges.push({ start: overlapStart, end: overlapEnd })
        evidenceEntries.push(`${entry.start}-${entry.end}${entry.project ? ` (${entry.project})` : ""}`)
      }
      foundMinutes = sumMergedMinutes(evidenceRanges)

      if (foundMinutes >= requestedMinutes - OVERTIME_CONFIRM_TOLERANCE_MINUTES) {
        status = "confirmed"
      } else if (foundMinutes > 0) {
        status = "partial"
      } else {
        status = "missing_attendance"
      }
    }

    rows.push({
      employeeId: req.employeeId,
      employeeName,
      date,
      hours,
      reason: payload.reason || undefined,
      requestId: req.id,
      requestStatus: req.status,
      requestedMinutes,
      foundMinutes,
      diffMinutes: foundMinutes - requestedMinutes,
      programEnd,
      status,
      statusLabel: overtimeReconciliationStatusLabel(status),
      timesheetHours: typeof cell?.hours === "number" ? cell.hours : undefined,
      evidenceEntries,
    })
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName, "ro"))
  return rows
}

export function overtimeReconciliationStatusLabel(status: OvertimeReconciliationStatus): string {
  switch (status) {
    case "confirmed":
      return "Confirmat"
    case "partial":
      return "Parțial"
    case "missing_attendance":
      return "Lipsește pontaj"
    case "missing_timesheet":
      return "Fără condică"
    case "difference":
      return "Diferență"
  }
}

// --- Aggregation ---

export function aggregateOvertimeGeneral(entries: OvertimeEntry[]): OvertimeGeneralStats {
  let totalHours = 0
  const monthMap = new Map<string, { hours: number; count: number }>()
  const empMap = new Map<string, { name: string; hours: number; count: number }>()

  for (const e of entries) {
    totalHours += e.hours

    const month = e.date.slice(0, 7) // yyyy-mm
    const mStats = monthMap.get(month) || { hours: 0, count: 0 }
    mStats.hours += e.hours
    mStats.count += 1
    monthMap.set(month, mStats)

    const eStats = empMap.get(e.employeeId) || { name: e.employeeName, hours: 0, count: 0 }
    eStats.hours += e.hours
    eStats.count += 1
    empMap.set(e.employeeId, eStats)
  }

  totalHours = Math.round(totalHours * 100) / 100

  const byMonth = Array.from(monthMap.entries())
    .map(([month, stats]) => ({
      month,
      hours: Math.round(stats.hours * 100) / 100,
      count: stats.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const byEmployee = Array.from(empMap.entries())
    .map(([employeeId, stats]) => ({
      employeeId,
      name: stats.name,
      hours: Math.round(stats.hours * 100) / 100,
      count: stats.count,
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, "ro"))

  return { totalHours, totalRequests: entries.length, byMonth, byEmployee }
}

export function aggregateOvertimeByEmployee(entries: OvertimeEntry[]): Array<OvertimeEmployeeStats & { entries: OvertimeEntry[] }> {
  const map = new Map<string, { name: string; hours: number; count: number; entries: OvertimeEntry[] }>()

  for (const e of entries) {
    const stats = map.get(e.employeeId) || { name: e.employeeName, hours: 0, count: 0, entries: [] }
    stats.hours += e.hours
    stats.count += 1
    stats.entries.push(e)
    map.set(e.employeeId, stats)
  }

  return Array.from(map.entries())
    .map(([employeeId, stats]) => ({
      employeeId,
      name: stats.name,
      hours: Math.round(stats.hours * 100) / 100,
      count: stats.count,
      entries: stats.entries.sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, "ro"))
}

// --- CSV Export ---

export function formatOvertimeCSV(entries: OvertimeEntry[], mode: "general" | "detailed"): string {
  if (mode === "general") {
    const stats = aggregateOvertimeGeneral(entries)
    const headers = ["Angajat", "Total Ore", "Nr. Cereri"]
    const rows = stats.byEmployee.map((e) => [
      e.name,
      formatOvertimeDuration(e.hours),
      String(e.count),
    ])
    return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
  }

  const headers = ["Angajat", "Data", "Ore", "Motiv"]
  const rows = entries.map((e) => [
    e.employeeName,
    formatDateRo(e.date),
    formatOvertimeDuration(e.hours),
    e.reason || "",
  ])
  return [headers, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
}

export function formatOvertimeReconciliationCSV(rows: OvertimeReconciliationRow[]): string {
  const headers = [
    "Angajat",
    "Data",
    "Status cerere",
    "Ore cerute",
    "Program sfârșit",
    "Ore găsite în condică",
    "Diferență",
    "Status reconciliere",
    "Dovezi condică",
    "Motiv",
  ]
  const body = rows.map((row) => [
    row.employeeName,
    formatDateRo(row.date),
    row.requestStatus,
    formatOvertimeDuration(row.hours),
    row.programEnd,
    formatOvertimeDuration(row.foundMinutes / 60),
    formatSignedDuration(row.diffMinutes),
    row.statusLabel,
    row.evidenceEntries.join("; "),
    row.reason || "",
  ])
  return [headers, ...body].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")
}

export function downloadCSV(csv: string, filename: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// --- Helpers ---

export function formatDateRo(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate
  return `${isoDate.slice(8, 10)}.${isoDate.slice(5, 7)}.${isoDate.slice(0, 4)}`
}

export function formatSignedDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded === 0) return "0 min"
  const sign = rounded > 0 ? "+" : "-"
  return `${sign}${formatOvertimeDuration(Math.abs(rounded) / 60)}`
}

export function formatMonthRo(monthKey: string): string {
  const months = [
    "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
  ]
  const parts = monthKey.split("-")
  const m = Number(parts[1]) - 1
  return `${months[m] || monthKey} ${parts[0]}`
}

export function currentYearRange(): OvertimeDateRange {
  const year = new Date().getFullYear()
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}
