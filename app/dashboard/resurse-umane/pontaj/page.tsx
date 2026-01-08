"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { TimesheetLegend } from "@/components/hr/timesheet-legend"
import { TimesheetGrid } from "@/components/hr/timesheet-grid"
import type { Employee, TimesheetCell, TimesheetCode, TimesheetMonth, TimesheetMonthKey } from "@/lib/hr/types"
import {
  getCurrentMonthKey,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeTimesheetsForMonth,
  upsertTimesheetCell,
} from "@/lib/hr/storage"

function toMonthInputValue(monthKey: TimesheetMonthKey) {
  return monthKey
}

function fromMonthInputValue(v: string): TimesheetMonthKey {
  // HTML month input returns yyyy-MM
  return v as TimesheetMonthKey
}

export default function HrTimesheetPage() {
  const searchParams = useSearchParams()
  const initialEmployeeId = searchParams.get("employeeId") ?? "all"
  const initialMonthKey = (searchParams.get("month") as TimesheetMonthKey) || getCurrentMonthKey()

  const [monthKey, setMonthKey] = useState<TimesheetMonthKey>(initialMonthKey)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeFilter, setEmployeeFilter] = useState<string>(initialEmployeeId)
  const [timesheets, setTimesheets] = useState<TimesheetMonth[]>([])

  const [editOpen, setEditOpen] = useState(false)
  const [editEmployeeId, setEditEmployeeId] = useState<string | null>(null)
  const [editDay, setEditDay] = useState<number | null>(null)
  const [editCode, setEditCode] = useState<TimesheetCode>("WORK")
  const [editHours, setEditHours] = useState<number>(8)

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

  const filteredEmployees = useMemo(() => {
    const base = [...employees].sort((a, b) => a.fullName.localeCompare(b.fullName))
    if (!employeeFilter || employeeFilter === "all") return base
    return base.filter((e) => e.id === employeeFilter)
  }, [employees, employeeFilter])

  const getCell = (employeeId: string, day: number): TimesheetCell | undefined => {
    const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === employeeId)
    return ts?.days?.[String(day)]
  }

  const openEdit = (employeeId: string, day: number) => {
    const c = getCell(employeeId, day)
    setEditEmployeeId(employeeId)
    setEditDay(day)
    setEditCode((c?.code ?? "WORK") as TimesheetCode)
    setEditHours(Number(c?.hours ?? 8))
    setEditOpen(true)
  }

  const saveEdit = async () => {
    if (!editEmployeeId || !editDay) return
    const cell: TimesheetCell =
      editCode === "WORK"
        ? { code: "WORK", hours: Math.max(0, Number.isFinite(editHours) ? Number(editHours) : 8) }
        : { code: editCode }
    try {
      await upsertTimesheetCell({ monthKey, employeeId: editEmployeeId, day: editDay, cell })
      setEditOpen(false)
    } catch {
      // ignore; optional toast could be added
      setEditOpen(false)
    }
  }

  const currentEmployeeName = useMemo(() => {
    if (!editEmployeeId) return ""
    return employees.find((e) => e.id === editEmployeeId)?.fullName ?? editEmployeeId
  }, [editEmployeeId, employees])

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Pontaj"
        text="Pontaj lunar (stil tabel) cu editare rapidă și persistență în Firebase."
        headerAction={
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="month"
              value={toMonthInputValue(monthKey)}
              onChange={(e) => setMonthKey(fromMonthInputValue(e.target.value))}
              className="w-[170px]"
            />
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filtru salariat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toți salariații</SelectItem>
                {employees
                  .slice()
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="mb-3">
        <TimesheetLegend />
      </div>

      <TimesheetGrid monthKey={monthKey} employees={filteredEmployees} getCell={getCell} onCellClick={openEdit} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editează pontaj</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              {currentEmployeeName} • Ziua {editDay ?? "—"} • {monthKey}
            </div>

            <div className="grid gap-2">
              <Label>Tip</Label>
              <Select value={editCode} onValueChange={(v) => setEditCode(v as TimesheetCode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORK">WORK (Lucru)</SelectItem>
                  <SelectItem value="WE">WE (Weekend)</SelectItem>
                  <SelectItem value="CO">CO (Concediu)</SelectItem>
                  <SelectItem value="SL">SL (Sărbătoare legală)</SelectItem>
                  <SelectItem value="EMPTY">Liber</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {editCode === "WORK" && (
              <div className="grid gap-2">
                <Label>Ore</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={String(editHours)}
                  onChange={(e) => setEditHours(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Anulează
            </Button>
            <Button onClick={saveEdit}>Salvează</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardShell>
  )
}


