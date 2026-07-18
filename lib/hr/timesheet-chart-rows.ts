import type { Employee, HrDefaults, TimesheetMonth, TimesheetMonthKey } from "./types"
import { getEmployeeFullName } from "./types"
import { getConfiguredBreak, getTimesheetCellMinutes } from "./time-calc"

export type TimesheetChartRow = {
  name: string
  hours: number
  CO: number
  SL: number
  WE: number
}

function daysInMonth(monthKey: TimesheetMonthKey) {
  const [year, month] = monthKey.split("-").map(Number)
  return new Date(year, month, 0).getDate()
}

export function buildTimesheetChartRows(monthKey: TimesheetMonthKey, employees: Employee[], timesheets: TimesheetMonth[], defaults: HrDefaults = {}): TimesheetChartRow[] {
  const dim = daysInMonth(monthKey)
  const byEmp = new Map<string, TimesheetMonth>()
  for (const timesheet of timesheets) {
    if (timesheet.monthKey === monthKey) byEmp.set(timesheet.employeeId, timesheet)
  }

  return employees.map((employee) => {
    const timesheet = byEmp.get(employee.id)
    let hours = 0
    let CO = 0
    let SL = 0
    let WE = 0
    for (let day = 1; day <= dim; day++) {
      const cell = timesheet?.days?.[String(day)]
      if (!cell) continue
      if (cell.code === "WORK") hours += getTimesheetCellMinutes({ cell, defaultBreak: getConfiguredBreak(employee, defaults) }) / 60
      if (cell.code === "CO") CO++
      if (cell.code === "SL") SL++
      if (cell.code === "WE") WE++
    }
    return { name: getEmployeeFullName(employee), hours, CO, SL, WE }
  }).sort((left, right) => right.hours - left.hours)
}
