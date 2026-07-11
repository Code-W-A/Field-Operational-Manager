import type { Employee, HrDefaults, HrHoliday, HrRequest, TimesheetMonth, TimesheetMonthKey } from "./types"
import { getEmployeeFullName } from "./types"
import { calculateEmployeeOvertimeBank, calculateEmployeeTimesheetSummary, daysInMonthFromKey } from "@/lib/hr/timesheet-summary"
import { getConfiguredBreak, getTimesheetCellMinutes } from "@/lib/hr/time-calc"

export function exportTimesheetsToCSV(
  monthKey: TimesheetMonthKey,
  employees: Employee[],
  timesheets: TimesheetMonth[],
  options?: {
    requests?: HrRequest[]
    holidays?: HrHoliday[]
    hrDefaults?: HrDefaults
  },
) {
  const csv = formatTimesheetsCSV(monthKey, employees, timesheets, options)

  // Download
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }) // BOM for Excel compatibility
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `condica-${monthKey}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export function formatTimesheetsCSV(
  monthKey: TimesheetMonthKey,
  employees: Employee[],
  timesheets: TimesheetMonth[],
  options?: {
    requests?: HrRequest[]
    holidays?: HrHoliday[]
    hrDefaults?: HrDefaults
  },
) {
  const dim = daysInMonthFromKey(monthKey)
  
  // Header CSV
  const headers = [
    "Angajat",
    "Functie",
    ...Array.from({ length: dim }, (_, i) => `Ziua ${i + 1}`),
    "Zile lucrate",
    "Tichete de masă",
    "Ore prezență",
    "Bancă de ore",
    "Ore traseu la client",
    "Zile CO",
    "Zile DEL",
    "Ore IN",
    "Total Ore",
  ]
  
  // Rows
  const rows = employees.map(emp => {
    const ts = timesheets.find(t => t.employeeId === emp.id && t.monthKey === monthKey)
    const row = [
      getEmployeeFullName(emp),
      emp.title || "-",
    ]
    
    for (let d = 1; d <= dim; d++) {
      const cell = ts?.days?.[String(d)]
      let val = "-"
      
      if (cell?.code === "WORK") {
        val = String(getTimesheetCellMinutes({
          cell,
          defaultBreak: getConfiguredBreak(emp, options?.hrDefaults),
        }) / 60)
      } else if (cell?.code && cell.code !== "EMPTY") {
        val = cell.code
      }
      
      row.push(val)
    }

    const summary = calculateEmployeeTimesheetSummary({
      employeeId: emp.id,
      monthKey,
      timesheet: ts,
      employee: emp,
      hrDefaults: options?.hrDefaults ?? null,
      requests: options?.requests ?? [],
      holidays: options?.holidays ?? [],
    })
    const bank = calculateEmployeeOvertimeBank({
      employeeId: emp.id,
      monthKey,
      timesheet: ts,
      employee: emp,
      hrDefaults: options?.hrDefaults ?? null,
      requests: options?.requests ?? [],
      holidays: options?.holidays ?? [],
    })

    row.push(String(summary.zileLucrate))
    row.push(String(summary.ticheteMasa))
    row.push(String(Math.round(summary.orePrezenta * 100) / 100))
    row.push(bank.display)
    row.push(String(summary.oreTraseuLaClient))
    row.push(String(summary.co))
    row.push(String(summary.del))
    row.push(String(summary.totalTimpIN))
    row.push(String(Math.round(summary.orePrezenta * 100) / 100))
    
    return row
  })
  
  // Generate CSV
  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
}
