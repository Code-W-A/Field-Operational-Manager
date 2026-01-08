"use client"

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts"
import type { Employee, TimesheetMonthKey, TimesheetMonth } from "@/lib/hr/types"
import { daysInMonth } from "@/lib/hr/storage"

type Row = {
  name: string
  hours: number
  CO: number
  SL: number
  WE: number
}

function buildRows(monthKey: TimesheetMonthKey, employees: Employee[], timesheets: TimesheetMonth[]): Row[] {
  const dim = daysInMonth(monthKey)
  const byEmp = new Map<string, TimesheetMonth>()
  for (const t of timesheets) {
    if (t.monthKey === monthKey) byEmp.set(t.employeeId, t)
  }

  return employees
    .map((e) => {
      const ts = byEmp.get(e.id)
      let hours = 0
      let CO = 0
      let SL = 0
      let WE = 0
      for (let d = 1; d <= dim; d++) {
        const c = ts?.days?.[String(d)]
        if (!c) continue
        if (c.code === "WORK") hours += Number(c.hours ?? 0)
        if (c.code === "CO") CO++
        if (c.code === "SL") SL++
        if (c.code === "WE") WE++
      }
      return { name: e.fullName, hours, CO, SL, WE }
    })
    .sort((a, b) => b.hours - a.hours)
}

export function TimesheetCharts({
  monthKey,
  employees,
  timesheets,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  timesheets: TimesheetMonth[]
}) {
  const rows = buildRows(monthKey, employees, timesheets)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border p-4">
        <div className="font-semibold mb-1">Ore lucrate / salariat</div>
        <div className="text-xs text-muted-foreground mb-3">Luna {monthKey}</div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 12 }} />
              <RechartsTooltip />
              <Bar dataKey="hours" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="font-semibold mb-1">Zile CO/SL/WE / salariat</div>
        <div className="text-xs text-muted-foreground mb-3">Luna {monthKey}</div>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 12 }} />
              <RechartsTooltip />
              <Bar dataKey="CO" stackId="a" fill="hsl(var(--chart-5))" radius={[6, 6, 0, 0]} />
              <Bar dataKey="SL" stackId="a" fill="hsl(var(--chart-2))" />
              <Bar dataKey="WE" stackId="a" fill="hsl(var(--chart-4))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}


