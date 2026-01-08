import type { Employee, TimesheetCell, TimesheetCode, TimesheetMonth } from "./types"

export const HR_SEED_EMPLOYEES: Employee[] = [
  { id: "emp_stratulat_daniel", fullName: "Stratulat Daniel", title: "Tehnician", active: true },
  { id: "emp_ionescu_alin", fullName: "Ionescu Alin", title: "Tehnician", active: true },
  { id: "emp_sima_mihai", fullName: "Sima Mihai", title: "Tehnician", active: true },
  { id: "emp_voinea_ionut", fullName: "Voinea Ionut", title: "Tehnician", active: true },
  { id: "emp_rusu_stefan", fullName: "Rusu Stefan", title: "Tehnician", active: true },
  { id: "emp_staicu_alin", fullName: "Staicu Alin", title: "Tehnician", active: true },
]

function cell(code: TimesheetCode, hours?: number): TimesheetCell {
  if (code === "WORK") return { code, hours: hours ?? 8 }
  return { code }
}

export function buildSeedMonth(monthKey: string, employeeId: string): TimesheetMonth {
  // Seed inspired by screenshot (simple template; users can edit).
  // Days: 1..31; we will only render the days that exist for the selected month.
  const days: Record<string, TimesheetCell> = {}

  // Default: EMPTY
  for (let d = 1; d <= 31; d++) days[String(d)] = cell("EMPTY")

  // Example pattern: 1-2 SL, 3-4 WE, 5 CO, 6-7 SL, 8-9 WORK (8h), 10-11 WE, 16-18 WE, 24-25 WE
  ;[1, 2, 6, 7].forEach((d) => (days[String(d)] = cell("SL")))
  ;[3, 4, 10, 11, 16, 17, 18, 24, 25].forEach((d) => (days[String(d)] = cell("WE")))
  ;[5].forEach((d) => (days[String(d)] = cell("CO")))
  ;[8, 9].forEach((d) => (days[String(d)] = cell("WORK", 8)))

  return { monthKey: monthKey as any, employeeId, days, updatedAt: Date.now() }
}

export function buildSeedTimesheets(monthKey: string): TimesheetMonth[] {
  return HR_SEED_EMPLOYEES.map((e) => buildSeedMonth(monthKey, e.id))
}

export function buildSeedTimesheetForEmployee(monthKey: string, employeeId: string): TimesheetMonth {
  return buildSeedMonth(monthKey, employeeId)
}


