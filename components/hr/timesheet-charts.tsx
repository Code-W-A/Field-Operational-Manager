"use client"

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from "recharts"
import type { Employee, HrDefaults, TimesheetMonthKey, TimesheetMonth } from "@/lib/hr/types"
import { buildTimesheetChartRows } from "@/lib/hr/timesheet-chart-rows"

export function TimesheetCharts({
  monthKey,
  employees,
  timesheets,
  defaults,
}: {
  monthKey: TimesheetMonthKey
  employees: Employee[]
  timesheets: TimesheetMonth[]
  defaults?: HrDefaults
}) {
  const rows = buildTimesheetChartRows(monthKey, employees, timesheets, defaults)

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div data-testid="report-chart-work-hours" className="rounded-lg border p-4">
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

      <div data-testid="report-chart-special-days" className="rounded-lg border p-4">
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
