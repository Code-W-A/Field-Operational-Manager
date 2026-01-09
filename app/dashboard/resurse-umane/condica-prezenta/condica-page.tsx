"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { DashboardHeader } from "@/components/dashboard-header"
import { DashboardShell } from "@/components/dashboard-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { TimesheetLegend } from "@/components/hr/timesheet-legend"
import { TimesheetGrid } from "@/components/hr/timesheet-grid"
import { TimesheetListView } from "@/components/hr/timesheet-list-view"
import { DayEntryPopover } from "@/components/hr/day-entry-popover"
import { AddDayEntryDialog } from "@/components/hr/add-day-entry-dialog"
import { DeleteTimesheetDialog } from "@/components/hr/delete-timesheet-dialog"
import { LeaveRequestsSection } from "@/components/hr/leave-requests-section"
import { CreateLeaveRequestDialog } from "@/components/hr/create-leave-request-dialog"
import type { TimesheetExtraColumn } from "@/components/hr/timesheet-grid"
import type { Employee, LeaveRequest, TimesheetCell, TimesheetCode, TimesheetMonth, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import {
  deleteTimesheetRange,
  daysInMonth,
  getCurrentMonthKey,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeLeaveRequests,
  subscribeTimesheetsForMonth,
  upsertTimesheetCell,
} from "@/lib/hr/storage"
import { Plus, Trash2, LayoutGrid, List, Download } from "lucide-react"
import { cn } from "@/lib/utils"
import { exportTimesheetsToCSV } from "@/lib/hr/export"

function toMonthInputValue(monthKey: TimesheetMonthKey) {
  return monthKey
}

function fromMonthInputValue(v: string): TimesheetMonthKey {
  // HTML month input returns yyyy-MM
  return v as TimesheetMonthKey
}

function calculateMonthKPIs(monthKey: TimesheetMonthKey, employees: Employee[], timesheets: TimesheetMonth[]) {
  const dim = daysInMonth(monthKey)
  const today = new Date().getDate()
  const currentMonth = getCurrentMonthKey()
  const isCurrentMonth = monthKey === currentMonth
  
  let totalHoursMonth = 0
  let totalWorkDays = 0
  let employeesOnLeave = 0
  let activeEmployeesToday = new Set<string>()
  
  for (const emp of employees) {
    const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === emp.id)
    
    for (let d = 1; d <= dim; d++) {
      const cell = ts?.days?.[String(d)]
      if (!cell) continue
      
      if (cell.code === "WORK") {
        totalHoursMonth += Number(cell.hours ?? 8)
        totalWorkDays++
        
        if (isCurrentMonth && d === today) {
          activeEmployeesToday.add(emp.id)
        }
      } else if (cell.code === "CO") {
        if (isCurrentMonth && d === today) {
          employeesOnLeave++
        }
      }
    }
  }
  
  const expectedHours = totalWorkDays * 8
  const diffHours = totalHoursMonth - expectedHours
  
  return {
    totalHoursMonth: Math.round(totalHoursMonth),
    avgHoursPerEmployee: employees.length > 0 ? totalHoursMonth / employees.length : 0,
    activeEmployeesToday: activeEmployeesToday.size,
    employeesOnLeave,
    diffHours: Math.round(diffHours),
  }
}

export default function CondicaPrezentaPage() {
  const searchParams = useSearchParams()
  const initialEmployeeId = searchParams.get("employeeId") ?? "all"
  const initialMonthKey = (searchParams.get("month") as TimesheetMonthKey) || getCurrentMonthKey()

  const [monthKey, setMonthKey] = useState<TimesheetMonthKey>(initialMonthKey)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeFilter, setEmployeeFilter] = useState<string>(initialEmployeeId)
  const [timesheets, setTimesheets] = useState<TimesheetMonth[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])

  const [cellOpen, setCellOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; right: number; bottom: number; width: number; height: number } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addDefaults, setAddDefaults] = useState<{ employeeId?: string; startDate?: string } | null>(null)
  const [deleteDefaults, setDeleteDefaults] = useState<{ employeeId?: string; startDate?: string; endDate?: string } | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)

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

  useEffect(() => {
    let unsub: null | (() => void) = null
    unsub = subscribeLeaveRequests({
      monthKey,
      onChange: setLeaveRequests,
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

  const getEmployeeTimesheet = (employeeId: string) => {
    return timesheets.find((t) => t.monthKey === monthKey && t.employeeId === employeeId) ?? null
  }

  const getSummary = (employeeId: string) => {
    const ts = getEmployeeTimesheet(employeeId)
    let zileLucrate = 0
    let totalOre = 0
    let oreSarbatoriLegale = 0
    let co = 0
    let del = 0
    let inDays = 0
    let totalTimpIN = 0

    const dim = (() => {
      const [yStr, mStr] = monthKey.split("-")
      return new Date(Number(yStr), Number(mStr), 0).getDate()
    })()

    for (let d = 1; d <= dim; d++) {
      const c = ts?.days?.[String(d)]
      if (!c) continue
      if (c.code === "WORK") {
        zileLucrate += 1
        totalOre += Number(c.hours ?? 8)
      } else if (c.code === "CO") {
        co += 1
      } else if (c.code === "DEL") {
        del += 1
      } else if (c.code === "IN") {
        inDays += 1
        totalTimpIN += Number(c.hours ?? 0)
        totalOre += Number(c.hours ?? 0)
      } else if (c.code === "SL") {
        oreSarbatoriLegale += Number(c.hours ?? 8)
        totalOre += Number(c.hours ?? 8)
      }
    }

    const ticheteMasa = zileLucrate

    return {
      zileLucrate,
      ticheteMasa,
      totalOre,
      oreTraseuLaClient: 0,
      oreTraseuDeLaClient: 0,
      co,
      del,
      inDays,
      totalTimpIN,
      oreSarbatoriLegale,
      oreC1: 0,
      oreC2: 0,
      oreC3: 0,
      oreC4: 0,
      oreC5: 0,
      oreC6: 0,
      oreC7: 0,
    }
  }

  const openEdit = (params: { employeeId: string; day: number; anchorRect: { top: number; left: number; right: number; bottom: number; width: number; height: number } }) => {
    const same = selectedEmployeeId === params.employeeId && selectedDay === params.day
    if (same && cellOpen) {
      setCellOpen(false)
      return
    }
    setSelectedEmployeeId(params.employeeId)
    setSelectedDay(params.day)
    setAnchorRect(params.anchorRect)
    setCellOpen(true)
  }

  const currentEmployeeName = useMemo(() => {
    if (!selectedEmployeeId) return ""
    return employees.find((e) => e.id === selectedEmployeeId)?.fullName ?? selectedEmployeeId
  }, [selectedEmployeeId, employees])

  const selectedCell = useMemo(() => {
    if (!selectedEmployeeId || !selectedDay) return undefined
    return getCell(selectedEmployeeId, selectedDay)
  }, [selectedEmployeeId, selectedDay, timesheets, monthKey])

  const subtitle = useMemo(() => {
    if (!selectedDay) return ""
    const [yStr, mStr] = monthKey.split("-")
    const date = new Date(Number(yStr), Number(mStr) - 1, selectedDay)
    const dd = String(date.getDate()).padStart(2, "0")
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const yyyy = date.getFullYear()
    return `Data ${dd}.${mm}.${yyyy}`
  }, [monthKey, selectedDay])

  const selectedDateISO = useMemo(() => {
    if (!selectedDay) return null
    const [yStr, mStr] = monthKey.split("-")
    const dd = String(selectedDay).padStart(2, "0")
    return `${yStr}-${mStr}-${dd}`
  }, [monthKey, selectedDay])

  const calculateOvertimeBank = (employeeId: string) => {
    const ts = timesheets.find(t => t.employeeId === employeeId && t.monthKey === monthKey)
    const dim = daysInMonth(monthKey)
    
    let totalWorked = 0
    let workDays = 0
    
    for (let d = 1; d <= dim; d++) {
      const cell = ts?.days?.[String(d)]
      if (cell?.code === "WORK") {
        totalWorked += Number(cell.hours ?? 8)
        workDays++
      }
    }
    
    const expected = workDays * 8
    const overtime = totalWorked - expected
    
    return {
      overtime,
      display: `${overtime >= 0 ? '+' : ''}${overtime.toFixed(1)}h`
    }
  }

  const kpis = useMemo(() => calculateMonthKPIs(monthKey, employees, timesheets), [monthKey, employees, timesheets])

  const extraColumns: TimesheetExtraColumn[] = useMemo(
    () => [
      { id: "zile_lucrate", label: "Zile lucrate", widthPx: 90, render: (e) => getSummary(e.id).zileLucrate },
      { id: "tichete_masa", label: "Tichete de masă", widthPx: 110, render: (e) => getSummary(e.id).ticheteMasa },
      { id: "total_ore", label: "Total ore", widthPx: 90, render: (e) => getSummary(e.id).totalOre },
      { 
        id: "banca_ore", 
        label: "Bancă de ore", 
        widthPx: 110, 
        render: (e) => {
          const bank = calculateOvertimeBank(e.id)
          return (
            <span className={cn(
              "font-semibold",
              bank.overtime > 0 ? "text-emerald-600" : bank.overtime < 0 ? "text-rose-600" : "text-muted-foreground"
            )}>
              {bank.display}
            </span>
          )
        }
      },
      { id: "traseu_la", label: "Ore traseu la client", widthPx: 130, render: (e) => getSummary(e.id).oreTraseuLaClient },
      { id: "traseu_de", label: "Ore traseu de la client", widthPx: 140, render: (e) => getSummary(e.id).oreTraseuDeLaClient },
      { id: "co", label: "CO", widthPx: 70, render: (e) => getSummary(e.id).co },
      { id: "del", label: "DEL", widthPx: 70, render: (e) => getSummary(e.id).del },
      { id: "in", label: "IN", widthPx: 70, render: (e) => getSummary(e.id).inDays },
      { id: "total_in", label: "Total timp IN", widthPx: 110, render: (e) => getSummary(e.id).totalTimpIN },
      { id: "ore_sl", label: "Ore sărbători legale", widthPx: 140, render: (e) => getSummary(e.id).oreSarbatoriLegale },
      { id: "c1", label: "Ore C1", widthPx: 80, render: (e) => getSummary(e.id).oreC1 },
      { id: "c2", label: "Ore C2", widthPx: 80, render: (e) => getSummary(e.id).oreC2 },
      { id: "c3", label: "Ore C3", widthPx: 80, render: (e) => getSummary(e.id).oreC3 },
      { id: "c4", label: "Ore C4", widthPx: 80, render: (e) => getSummary(e.id).oreC4 },
      { id: "c5", label: "Ore C5", widthPx: 80, render: (e) => getSummary(e.id).oreC5 },
      { id: "c6", label: "Ore C6", widthPx: 80, render: (e) => getSummary(e.id).oreC6 },
      { id: "c7", label: "Ore C7", widthPx: 80, render: (e) => getSummary(e.id).oreC7 },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, timesheets]
  )

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Condică prezență"
        text="Condică prezență lunară (stil tabel) cu pop-up pe zi și dialog de adăugare, persistent în Firebase."
        headerAction={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            >
              {viewMode === "grid" ? <LayoutGrid className="h-4 w-4 mr-2" /> : <List className="h-4 w-4 mr-2" />}
              {viewMode === "grid" ? "Grid" : "Listă"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportTimesheetsToCSV(monthKey, filteredEmployees, timesheets)}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDefaults({ employeeId: employeeFilter !== "all" ? employeeFilter : undefined, startDate: `${monthKey}-01`, endDate: `${monthKey}-01` })
                setDeleteOpen(true)
              }}
              className="sm:order-last border-primary text-primary hover:bg-primary/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Șterge
            </Button>
            <Button
              onClick={() => {
                setAddDefaults({ employeeId: employeeFilter !== "all" ? employeeFilter : undefined })
                setAddOpen(true)
              }}
              className="sm:order-last"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adaugă
            </Button>
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
                      {getEmployeeFullName(e)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {/* KPI Dashboard Cards */}
      <div className="grid gap-3 md:grid-cols-5 mb-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground">Ore lucrate luna</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-emerald-700">{kpis.totalHoursMonth}h</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground">Angajați activi azi</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-blue-700">{kpis.activeEmployeesToday}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground">În concediu (CO)</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-amber-700">{kpis.employeesOnLeave}</div>
          </CardContent>
        </Card>
        
        <Card className={`border-l-4 ${kpis.diffHours >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground">Peste/Sub normă</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className={`text-xl font-bold ${kpis.diffHours >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {kpis.diffHours >= 0 ? '+' : ''}{kpis.diffHours}h
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground">Medie ore/angajat</CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-primary">{kpis.avgHoursPerEmployee.toFixed(1)}h</div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3">
        <TimesheetLegend />
      </div>

      {viewMode === "grid" ? (
        <TimesheetGrid
          monthKey={monthKey}
          employees={filteredEmployees}
          getCell={getCell}
          onCellClick={openEdit}
          extraColumns={extraColumns}
          className="shadow-sm"
        />
      ) : (
        <TimesheetListView
          monthKey={monthKey}
          employees={filteredEmployees}
          getCell={getCell}
          onCellClick={openEdit}
        />
      )}

      <DayEntryPopover
        open={cellOpen}
        onOpenChange={(v) => {
          setCellOpen(v)
          if (!v) setAnchorRect(null)
        }}
        title={currentEmployeeName}
        subtitle={subtitle}
        cell={selectedCell}
        anchorRect={anchorRect}
        onOpenAddDialog={() => {
          if (!selectedEmployeeId || !selectedDateISO) return
          setCellOpen(false)
          setAnchorRect(null)
          setAddDefaults({ employeeId: selectedEmployeeId, startDate: selectedDateISO })
          setAddOpen(true)
        }}
        onOpenDeleteDialog={() => {
          if (!selectedEmployeeId || !selectedDateISO) return
          setCellOpen(false)
          setAnchorRect(null)
          setDeleteDefaults({ employeeId: selectedEmployeeId, startDate: selectedDateISO, endDate: selectedDateISO })
          setDeleteOpen(true)
        }}
        onSaveCell={async (next) => {
          if (!selectedEmployeeId || !selectedDay) return
          const normalized: TimesheetCell = {
            ...next,
            code: (next.code ?? "WORK") as TimesheetCode,
          }
          await upsertTimesheetCell({ monthKey, employeeId: selectedEmployeeId, day: selectedDay, cell: normalized })
        }}
      />

      <AddDayEntryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        employees={employees}
        defaultEmployeeId={addDefaults?.employeeId ?? (employeeFilter !== "all" ? employeeFilter : undefined)}
        defaultStartDate={addDefaults?.startDate}
        onSubmitRange={async ({ employeeId, startDate, endDate, project, entries, breaks, includeConcediu, includeSarbatori, includeWeekend, hours, monthKey }) => {
          // Basic date range: we only support same-month ranges for now.
          const start = new Date(startDate)
          const end = new Date(endDate)
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
          const d = new Date(start)
          while (d <= end) {
            const day = d.getDate()
            // Skip weekends/holidays/etc only if toggles are off and the existing code indicates such.
            const existing = getCell(employeeId, day)
            const existingCode = existing?.code
            if (existingCode === "CO" && !includeConcediu) {
              d.setDate(d.getDate() + 1)
              continue
            }
            if (existingCode === "SL" && !includeSarbatori) {
              d.setDate(d.getDate() + 1)
              continue
            }
            if (existingCode === "WE" && !includeWeekend) {
              d.setDate(d.getDate() + 1)
              continue
            }

            const cell: TimesheetCell = {
              code: existingCode && existingCode !== "EMPTY" ? existingCode : "WORK",
              hours,
              entries: entries.map((e) => ({ ...e, project: project ?? e.project })),
              breaks,
            }
            await upsertTimesheetCell({ monthKey, employeeId, day, cell })
            d.setDate(d.getDate() + 1)
          }
        }}
      />

      <DeleteTimesheetDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        employees={employees}
        defaultEmployeeId={deleteDefaults?.employeeId ?? (employeeFilter !== "all" ? employeeFilter : undefined)}
        defaultStartDate={deleteDefaults?.startDate ?? `${monthKey}-01`}
        defaultEndDate={deleteDefaults?.endDate ?? `${monthKey}-01`}
        onSubmitRange={async ({ employeeId, startDate, endDate, deleteEntries, deleteBreaks, monthKey: mk }) => {
          // Deleting is supported only within the currently displayed month.
          if (mk !== monthKey) return
          const start = new Date(startDate)
          const end = new Date(endDate)
          if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
          const startDay = start.getDate()
          const endDay = end.getDate()
          await deleteTimesheetRange({ monthKey, employeeId, startDay, endDay, deleteEntries, deleteBreaks })
        }}
      />

      <LeaveRequestsSection
        monthKey={monthKey}
        employees={employees}
        leaveRequests={leaveRequests}
        onCreateRequest={() => setLeaveDialogOpen(true)}
      />

      <CreateLeaveRequestDialog
        open={leaveDialogOpen}
        onOpenChange={setLeaveDialogOpen}
        employees={employees}
        defaultEmployeeId={employeeFilter !== "all" ? employeeFilter : undefined}
      />
    </DashboardShell>
  )
}


