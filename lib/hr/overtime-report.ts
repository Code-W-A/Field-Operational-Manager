import type { Employee, HrRequest } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { normalizeOvertimeHoursValue, formatOvertimeDuration } from "@/lib/hr/overtime-duration"

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
