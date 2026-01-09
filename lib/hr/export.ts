import type { Employee, TimesheetMonth, TimesheetMonthKey } from "./types"
import { getEmployeeFullName } from "./types"
import { daysInMonth } from "./storage"

export function exportTimesheetsToCSV(
  monthKey: TimesheetMonthKey,
  employees: Employee[],
  timesheets: TimesheetMonth[]
) {
  const dim = daysInMonth(monthKey)
  
  // Header CSV
  const headers = [
    "Angajat",
    "Functie",
    ...Array.from({ length: dim }, (_, i) => `Ziua ${i + 1}`),
    "Total Ore",
    "Banca Ore",
  ]
  
  // Rows
  const rows = employees.map(emp => {
    const ts = timesheets.find(t => t.employeeId === emp.id && t.monthKey === monthKey)
    const row = [
      getEmployeeFullName(emp),
      emp.title || "-",
    ]
    
    let totalHours = 0
    let workDays = 0
    
    for (let d = 1; d <= dim; d++) {
      const cell = ts?.days?.[String(d)]
      let val = "-"
      
      if (cell?.code === "WORK") {
        val = String(cell.hours ?? 8)
        totalHours += Number(cell.hours ?? 8)
        workDays++
      } else if (cell?.code && cell.code !== "EMPTY") {
        val = cell.code
      }
      
      row.push(val)
    }
    
    row.push(String(totalHours))
    
    // Bancă de ore = total - (workDays * 8)
    const expectedHours = workDays * 8
    const overtimeBank = totalHours - expectedHours
    row.push(overtimeBank >= 0 ? `+${overtimeBank}` : String(overtimeBank))
    
    return row
  })
  
  // Generate CSV
  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n")
  
  // Download
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }) // BOM for Excel compatibility
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `condica-${monthKey}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

