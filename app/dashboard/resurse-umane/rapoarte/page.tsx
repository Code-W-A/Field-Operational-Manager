"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

import type { Employee, TimesheetMonthKey, TimesheetMonth } from "@/lib/hr/types"
import {
  daysInMonth,
  getCurrentMonthKey,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeTimesheetsForMonth,
} from "@/lib/hr/storage"
import { TimesheetCharts } from "@/components/hr/timesheet-charts"

function fromMonthInputValue(v: string): TimesheetMonthKey {
  return v as TimesheetMonthKey
}

function calcKpis(monthKey: TimesheetMonthKey, employees: Employee[], timesheets: TimesheetMonth[]) {
  const dim = daysInMonth(monthKey)
  const byEmp = new Map<string, TimesheetMonth>()
  for (const t of timesheets) if (t.monthKey === monthKey) byEmp.set(t.employeeId, t)

  let totalHours = 0
  let totalCO = 0
  let totalSL = 0
  let totalWE = 0

  for (const e of employees) {
    const ts = byEmp.get(e.id)
    for (let d = 1; d <= dim; d++) {
      const c = ts?.days?.[String(d)]
      if (!c) continue
      if (c.code === "WORK") totalHours += Number(c.hours ?? 0)
      if (c.code === "CO") totalCO++
      if (c.code === "SL") totalSL++
      if (c.code === "WE") totalWE++
    }
  }

  const activeEmployees = employees.length || 1
  return {
    totalHours,
    totalCO,
    totalSL,
    totalWE,
    avgHours: Math.round((totalHours / activeEmployees) * 10) / 10,
  }
}

export default function HrReportsPage() {
  const searchParams = useSearchParams()
  const initialMonthKey = (searchParams.get("month") as TimesheetMonthKey) || getCurrentMonthKey()

  const [monthKey, setMonthKey] = useState<TimesheetMonthKey>(initialMonthKey)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [timesheets, setTimesheets] = useState<TimesheetMonth[]>([])

  useEffect(() => {
    let unsub: null | (() => void) = null
    ;(async () => {
      try {
        await seedHrIfEmpty({ monthKey })
      } catch {
        // ignore
      }
      unsub = subscribeEmployees({
        onChange: (e) => setEmployees(e.filter((x) => x.active)),
      })
    })()
    return () => unsub?.()
  }, [])

  useEffect(() => {
    let unsub: null | (() => void) = null
    unsub = subscribeTimesheetsForMonth({
      monthKey,
      onChange: setTimesheets,
    })
    return () => unsub?.()
  }, [monthKey])

  const kpis = useMemo(() => calcKpis(monthKey, employees, timesheets), [monthKey, employees, timesheets])

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Rapoarte HR"
        text="Vizualizează orele lucrate și distribuția CO/SL/WE."
        headerAction={
          <Input type="month" value={monthKey} onChange={(e) => setMonthKey(fromMonthInputValue(e.target.value))} className="w-[170px]" />
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ore totale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.totalHours}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Medie ore / salariat</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.avgHours}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">CO / SL (sărbătoare legală)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {kpis.totalCO} / {kpis.totalSL}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">WE</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.totalWE}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <TimesheetCharts monthKey={monthKey} employees={employees} timesheets={timesheets} />
      </div>
    </DashboardShell>
  )
}


