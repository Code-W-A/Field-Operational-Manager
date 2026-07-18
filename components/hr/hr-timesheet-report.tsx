"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { TimesheetCharts } from "@/components/hr/timesheet-charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

import type { Employee, HrDefaults, TimesheetMonth, TimesheetMonthKey } from "@/lib/hr/types"
import { getConfiguredBreak, getTimesheetCellMinutes } from "@/lib/hr/time-calc"
import {
  daysInMonth,
  getCurrentMonthKey,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeHrDefaults,
  subscribeTimesheetsForMonth,
} from "@/lib/hr/storage"

function fromMonthInputValue(value: string): TimesheetMonthKey {
  return value as TimesheetMonthKey
}

function calcKpis(monthKey: TimesheetMonthKey, employees: Employee[], timesheets: TimesheetMonth[], defaults: HrDefaults) {
  const dim = daysInMonth(monthKey)
  const byEmployee = new Map<string, TimesheetMonth>()

  for (const timesheet of timesheets) {
    if (timesheet.monthKey === monthKey) {
      byEmployee.set(timesheet.employeeId, timesheet)
    }
  }

  let totalHours = 0
  let totalCO = 0
  let totalSL = 0
  let totalWE = 0

  for (const employee of employees) {
    const timesheet = byEmployee.get(employee.id)
    for (let day = 1; day <= dim; day++) {
      const cell = timesheet?.days?.[String(day)]
      if (!cell) continue
      if (cell.code === "WORK") {
        totalHours += getTimesheetCellMinutes({
          cell,
          defaultBreak: getConfiguredBreak(employee, defaults),
        }) / 60
      }
      if (cell.code === "CO") totalCO++
      if (cell.code === "SL") totalSL++
      if (cell.code === "WE") totalWE++
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

export function HrTimesheetReport() {
  const searchParams = useSearchParams()
  const initialMonthKey = (searchParams.get("month") as TimesheetMonthKey) || getCurrentMonthKey()

  const [monthKey, setMonthKey] = useState<TimesheetMonthKey>(initialMonthKey)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [timesheets, setTimesheets] = useState<TimesheetMonth[]>([])
  const [hrDefaults, setHrDefaults] = useState<HrDefaults>({})

  useEffect(() => {
    const nextMonthKey = (searchParams.get("month") as TimesheetMonthKey) || getCurrentMonthKey()
    setMonthKey(nextMonthKey)
  }, [searchParams])

  useEffect(() => {
    let unsub: null | (() => void) = null

    ;(async () => {
      try {
        await seedHrIfEmpty({ monthKey })
      } catch {
        // ignore seed errors in report view
      }

      unsub = subscribeEmployees({
        onChange: (items) => setEmployees(items.filter((item) => item.active)),
      })
    })()

    return () => unsub?.()
  }, [monthKey])

  useEffect(() => {
    const unsub = subscribeTimesheetsForMonth({
      monthKey,
      onChange: setTimesheets,
    })

    return () => unsub?.()
  }, [monthKey])

  useEffect(() => subscribeHrDefaults({ onChange: setHrDefaults }), [])

  const kpis = useMemo(
    () => calcKpis(monthKey, employees, timesheets, hrDefaults),
    [monthKey, employees, timesheets, hrDefaults],
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <label htmlFor="hr-report-month" className="sr-only">Luna raportului Pontaj HR</label>
        <Input
          id="hr-report-month"
          type="month"
          value={monthKey}
          onChange={(event) => setMonthKey(fromMonthInputValue(event.target.value))}
          className="w-[170px]"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ore totale</CardTitle>
          </CardHeader>
          <CardContent>
            <div data-testid="report-kpi-total-hours" className="text-3xl font-bold">{kpis.totalHours}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Medie ore / salariat</CardTitle>
          </CardHeader>
          <CardContent>
            <div data-testid="report-kpi-average-hours" className="text-3xl font-bold">{kpis.avgHours}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">CO / SL (sărbătoare legală)</CardTitle>
          </CardHeader>
          <CardContent>
            <div data-testid="report-kpi-co-sl" className="text-3xl font-bold">
              {kpis.totalCO} / {kpis.totalSL}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">WE</CardTitle>
          </CardHeader>
          <CardContent>
            <div data-testid="report-kpi-we" className="text-3xl font-bold">{kpis.totalWE}</div>
          </CardContent>
        </Card>
      </div>

      <TimesheetCharts monthKey={monthKey} employees={employees} timesheets={timesheets} defaults={hrDefaults} />
    </div>
  )
}
