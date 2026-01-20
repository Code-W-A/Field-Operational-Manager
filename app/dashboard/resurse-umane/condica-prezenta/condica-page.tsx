"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { collection, onSnapshot, query, where } from "firebase/firestore"

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
import type { Department, Employee, HrRequest, HrRequestKind, TimesheetCell, TimesheetCode, TimesheetMonth, TimesheetMonthKey } from "@/lib/hr/types"
import { getEmployeeFullName } from "@/lib/hr/types"
import { hrRequestKindLabel } from "@/lib/hr/hr-requests"
import {
  deleteTimesheetRange,
  daysInMonth,
  getCurrentMonthKey,
  seedHrIfEmpty,
  subscribeEmployees,
  subscribeDepartments,
  subscribeHrRequestsForMonth,
  subscribeTimesheetsForMonth,
  upsertTimesheetCell,
} from "@/lib/hr/storage"
import { Plus, Trash2, LayoutGrid, List, Download, Minimize2, Maximize2, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { exportTimesheetsToCSV } from "@/lib/hr/export"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/hooks/use-toast"
import { db } from "@/lib/firebase/config"
import type { AttendanceSession } from "@/types/attendance"
import type { HrHoliday } from "@/lib/hr/types"
import { saveHrHolidays, subscribeHrHolidays } from "@/lib/hr/storage"
import { LegalHolidaysDialog } from "@/components/hr/legal-holidays-dialog"
import { formatRomanianDate } from "@/lib/utils/date-utils"
import { syncAttendanceToTimesheet } from "@/lib/attendance/sync-timesheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function toMonthInputValue(monthKey: TimesheetMonthKey) {
  return monthKey
}

function fromMonthInputValue(v: string): TimesheetMonthKey {
  // HTML month input returns yyyy-MM
  return v as TimesheetMonthKey
}

function parseHM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function findOverlapPair(entries: Array<{ start: string; end: string }>) {
  const ranges = entries
    .map((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || s >= en) return null
      return { start: s, end: en, label: `${e.start}–${e.end}` }
    })
    .filter(Boolean) as Array<{ start: number; end: number; label: string }>
  if (ranges.length <= 1) return null
  ranges.sort((a, b) => (a.start - b.start) || (a.end - b.end))
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) {
      return { a: ranges[i - 1].label, b: ranges[i].label }
    }
  }
  return null
}

function findOverlapWithExisting(
  existing: Array<{ start: string; end: string }>,
  next: Array<{ start: string; end: string }>
) {
  const existingRanges = existing
    .map((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || s >= en) return null
      return { start: s, end: en, labelStart: e.start, labelEnd: e.end }
    })
    .filter(Boolean) as Array<{ start: number; end: number; labelStart: string; labelEnd: string }>
  if (!existingRanges.length) return null
  for (const e of next) {
    const s = parseHM(e.start)
    const en = parseHM(e.end)
    if (s == null || en == null || s >= en) continue
    for (const ex of existingRanges) {
      if (s < ex.end && ex.start < en) {
        return {
          incoming: `${e.start}–${e.end}`,
          existing: `${ex.labelStart}–${ex.labelEnd}`,
        }
      }
    }
  }
  return null
}

function findBreakOutsideEntries(
  entries: Array<{ start: string; end: string }>,
  breaks: Array<{ start: string; end: string }>
) {
  const entryRanges = entries
    .map((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || s >= en) return null
      return { start: s, end: en, labelStart: e.start, labelEnd: e.end }
    })
    .filter(Boolean) as Array<{ start: number; end: number; labelStart: string; labelEnd: string }>
  if (!entryRanges.length) return null
  for (const b of breaks) {
    const s = parseHM(b.start)
    const en = parseHM(b.end)
    if (s == null || en == null || s >= en) continue
    const inside = entryRanges.some((e) => s >= e.start && en <= e.end)
    if (!inside) {
      return {
        breakLabel: `${b.start}–${b.end}`,
      }
    }
  }
  return null
}

function calculateMonthKPIs(
  monthKey: TimesheetMonthKey,
  employees: Employee[],
  timesheets: TimesheetMonth[],
  activeMetaByEmployee?: Record<string, { day: number; monthKey: TimesheetMonthKey }>
) {
  const dim = daysInMonth(monthKey)
  const today = new Date().getDate()
  const currentMonth = getCurrentMonthKey()
  const isCurrentMonth = monthKey === currentMonth
  
  let totalHoursMonth = 0
  let totalWorkDays = 0
  let employeesOnLeave = 0
  
  for (const emp of employees) {
    const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === emp.id)
    
    for (let d = 1; d <= dim; d++) {
      const cell = ts?.days?.[String(d)]
      if (!cell) continue
      
      if (cell.code === "WORK") {
        totalHoursMonth += Number(cell.hours ?? 8)
        totalWorkDays++
      } else if (cell.code === "CO") {
        if (isCurrentMonth && d === today) {
          employeesOnLeave++
        }
      }
    }
  }
  
  const expectedHours = totalWorkDays * 8
  const diffHours = totalHoursMonth - expectedHours

  const activeEmployeesToday = (() => {
    if (!isCurrentMonth) return 0
    if (!activeMetaByEmployee) return 0
    const employeeIds = new Set(employees.map((e) => e.id))
    return Object.entries(activeMetaByEmployee).filter(([employeeId, meta]) => {
      return employeeIds.has(employeeId) && meta.monthKey === monthKey && meta.day === today
    }).length
  })()
  
  return {
    totalHoursMonth: Math.round(totalHoursMonth),
    avgHoursPerEmployee: employees.length > 0 ? totalHoursMonth / employees.length : 0,
    activeEmployeesToday,
    employeesOnLeave,
    diffHours: Math.round(diffHours),
  }
}

function enumerateDatesInclusive(startDate: string, endDate: string): string[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const dates: string[] = []
  const d = new Date(start)
  while (d <= end) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    dates.push(`${y}-${m}-${day}`)
    d.setDate(d.getDate() + 1)
  }
  return dates
}

export default function CondicaPrezentaPage() {
  const { user, userData } = useAuth()
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"
  const searchParams = useSearchParams()
  const initialEmployeeId = searchParams.get("employeeId") ?? "all"
  const initialMonthKey = (searchParams.get("month") as TimesheetMonthKey) || getCurrentMonthKey()

  const [monthKey, setMonthKey] = useState<TimesheetMonthKey>(initialMonthKey)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeFilter, setEmployeeFilter] = useState<string>(initialEmployeeId)
  const [timesheets, setTimesheets] = useState<TimesheetMonth[]>([])
  const [leaveRequests, setLeaveRequests] = useState<HrRequest[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeSessions, setActiveSessions] = useState<Record<string, AttendanceSession>>({})

  const [cellOpen, setCellOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [anchorRect, setAnchorRect] = useState<{ top: number; left: number; right: number; bottom: number; width: number; height: number } | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addDefaults, setAddDefaults] = useState<{ employeeId?: string; startDate?: string } | null>(null)
  const [deleteDefaults, setDeleteDefaults] = useState<{ employeeId?: string; startDate?: string; endDate?: string } | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [compactMode, setCompactMode] = useState(() => {
    // Load from localStorage on initial mount
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("condica-compact-mode")
      return saved === "true"
    }
    return false
  })
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [holidaysOpen, setHolidaysOpen] = useState(false)
  const [holidays, setHolidays] = useState<HrHoliday[]>([])

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
    const year = Number(monthKey.split("-")[0])
    if (!Number.isFinite(year)) return
    const unsub = subscribeHrHolidays({
      year,
      onChange: setHolidays,
      onError: () => undefined,
    })
    return () => unsub()
  }, [monthKey])

  useEffect(() => {
    const unsub = subscribeDepartments({
      onChange: setDepartments,
      onError: () => undefined,
    })
    return () => unsub()
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
    const q = query(collection(db, "attendance"), where("status", "==", "active"))
    const unsub = onSnapshot(q, (snapshot) => {
      const next: Record<string, AttendanceSession> = {}
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data() as any
        // Prefer explicit employeeId; fallback to mapping by userUid (older sessions / missing link).
        let employeeId = data.employeeId ? String(data.employeeId) : ""
        if (!employeeId && data.userId) {
          const byUser = employees.find((e) => String((e as any).userUid || "") === String(data.userId))
          if (byUser?.id) employeeId = byUser.id
        }
        if (!employeeId) return
        const sessionStart = typeof data.sessionStart === "number"
          ? data.sessionStart
          : data.sessionStart?.toMillis?.()
        if (!sessionStart || !Number.isFinite(sessionStart)) return
        next[employeeId] = {
          id: docSnap.id,
          ...data,
          sessionStart,
          sessionEnd: data.sessionEnd
            ? (typeof data.sessionEnd === "number" ? data.sessionEnd : data.sessionEnd?.toMillis?.())
            : undefined,
          createdAt: typeof data.createdAt === "number" ? data.createdAt : data.createdAt?.toMillis?.() || Date.now(),
          updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : data.updatedAt?.toMillis?.() || Date.now(),
        } as AttendanceSession
      })
      setActiveSessions(next)
    })
    return () => unsub()
  }, [employees])

  useEffect(() => {
    if (!debugEnabled) return
    try {
      console.log("[CONDICA] month snapshot", {
        monthKey,
        employees: employees.length,
        timesheets: timesheets.length,
      })
    } catch {
      // ignore
    }
  }, [debugEnabled, monthKey, employees.length, timesheets.length])

  useEffect(() => {
    let unsub: null | (() => void) = null
    unsub = subscribeHrRequestsForMonth({
      monthKey,
      kinds: ["CO", "CFP", "CM", "DEL", "IN"],
      onChange: setLeaveRequests,
    })
    return () => unsub?.()
  }, [monthKey])

  // Save compact mode preference to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("condica-compact-mode", String(compactMode))
    }
  }, [compactMode])

  const visibleEmployees = useMemo(() => {
    const base = [...employees].sort((a, b) =>
      getEmployeeFullName(a).localeCompare(getEmployeeFullName(b))
    )
    const isAdminOrDispatcher = userData?.role === "admin" || userData?.role === "dispecer"
    if (isAdminOrDispatcher || !user?.uid) return base
    const uid = user.uid
    return base.filter((e) => {
      if (e.superiorUid && e.superiorUid === uid) return true
      const managerUidBySector = e.managerUidBySector || {}
      return Object.values(managerUidBySector).some((v) => String(v) === uid)
    })
  }, [employees, user?.uid, userData?.role])

  const filteredEmployees = useMemo(() => {
    if (!employeeFilter || employeeFilter === "all") return visibleEmployees
    return visibleEmployees.filter((e) => e.id === employeeFilter)
  }, [visibleEmployees, employeeFilter])

  useEffect(() => {
    if (employeeFilter === "all") return
    if (!employeeFilter) return
    const exists = visibleEmployees.some((e) => e.id === employeeFilter)
    if (!exists) {
      setEmployeeFilter(visibleEmployees[0]?.id ?? "all")
    }
  }, [visibleEmployees, employeeFilter])

  const getCell = (employeeId: string, day: number): TimesheetCell | undefined => {
    const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === employeeId)
    return ts?.days?.[String(day)]
  }

  const formatHmFromMs = (ms: number) => {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  const activeMetaByEmployee = useMemo(() => {
    const next: Record<string, { day: number; monthKey: TimesheetMonthKey; startLabel: string }> = {}
    Object.entries(activeSessions).forEach(([employeeId, session]) => {
      const startMs = session.sessionStart
      if (!startMs || !Number.isFinite(startMs)) return
      const d = new Date(startMs)
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` as TimesheetMonthKey
      next[employeeId] = { day: d.getDate(), monthKey: mk, startLabel: formatHmFromMs(startMs) }
    })
    return next
  }, [activeSessions])

  const isActiveCell = (employeeId: string, day: number) => {
    const meta = activeMetaByEmployee[employeeId]
    return Boolean(meta && meta.monthKey === monthKey && meta.day === day)
  }

  const getEmployeeTimesheet = (employeeId: string) => {
    return timesheets.find((t) => t.monthKey === monthKey && t.employeeId === employeeId) ?? null
  }

  const countDaysInRangeForMonth = (startDate: string, endDate: string) => {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0
    let count = 0
    const d = new Date(start)
    while (d <= end) {
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` as TimesheetMonthKey
      if (mk === monthKey) count += 1
      d.setDate(d.getDate() + 1)
    }
    return count
  }

  const hoursFromInterval = (startTime: string, endTime: string) => {
    const s = parseHM(startTime)
    const e = parseHM(endTime)
    if (s == null || e == null || e <= s) return 0
    return (e - s) / 60
  }

  const getSummary = (employeeId: string) => {
    const ts = getEmployeeTimesheet(employeeId)
    let zileLucrate = 0
    let orePrezenta = 0
    let oreLucrateEfectiv = 0
    let oreSarbatoriLegale = 0
    let co = 0
    let del = 0
    let totalTimpIN = 0

    const dim = daysInMonth(monthKey)
    for (let d = 1; d <= dim; d++) {
      const c = ts?.days?.[String(d)]
      if (!c || c.code === "EMPTY") continue
      zileLucrate += 1
      if (c.code === "WORK") {
        const hours = Number(c.hours ?? 8)
        orePrezenta += hours
        oreLucrateEfectiv += hours
      } else if (c.code === "SL") {
        oreSarbatoriLegale += Number(c.hours ?? 8)
      }
    }

    const approvedRequests = leaveRequests.filter((r) => r.employeeId === employeeId && r.status === "approved")
    approvedRequests.forEach((req) => {
      const payload: any = req.payload as any
      if (req.kind === "CO") {
        if (payload?.startDate && payload?.endDate) {
          co += countDaysInRangeForMonth(payload.startDate, payload.endDate)
        }
      } else if (req.kind === "DEL") {
        if (payload?.startDate && payload?.endDate) {
          del += countDaysInRangeForMonth(payload.startDate, payload.endDate)
        }
      } else if (req.kind === "IN") {
        if (payload?.date && payload?.startTime && payload?.endTime) {
          if (String(payload.date).startsWith(monthKey)) {
            totalTimpIN += hoursFromInterval(payload.startTime, payload.endTime)
          }
        }
      }
    })

    const ticheteMasa = Math.max(0, zileLucrate - del)

    return {
      zileLucrate,
      ticheteMasa,
      orePrezenta,
      oreLucrateEfectiv,
      oreTraseuLaClient: 0,
      oreTraseuDeLaClient: 0,
      co,
      del,
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

  const activeSessionStart = useMemo(() => {
    if (!selectedEmployeeId || !selectedDay) return null
    const meta = activeMetaByEmployee[selectedEmployeeId]
    if (!meta) return null
    if (meta.monthKey !== monthKey || meta.day !== selectedDay) return null
    return meta.startLabel
  }, [activeMetaByEmployee, selectedEmployeeId, selectedDay, monthKey])

  useEffect(() => {
    if (!debugEnabled) return
    if (!selectedEmployeeId || !selectedDay) return
    const ts = timesheets.find((t) => t.monthKey === monthKey && t.employeeId === selectedEmployeeId)
    const dayKey = String(selectedDay)
    try {
      console.log("[CONDICA] cell snapshot", {
        monthKey,
        employeeId: selectedEmployeeId,
        day: selectedDay,
        dayKey,
        cell: ts?.days?.[dayKey] ?? null,
        timesheetDocExists: Boolean(ts),
      })
    } catch {
      // ignore
    }
  }, [debugEnabled, selectedEmployeeId, selectedDay, timesheets, monthKey])

  const subtitle = useMemo(() => {
    if (!selectedDay) return ""
    const [yStr, mStr] = monthKey.split("-")
    const date = new Date(Number(yStr), Number(mStr) - 1, selectedDay)
    return `Data ${formatRomanianDate(date)}`
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

  const kpis = useMemo(
    () => calculateMonthKPIs(monthKey, visibleEmployees, timesheets, activeMetaByEmployee),
    [monthKey, visibleEmployees, timesheets, activeMetaByEmployee]
  )

  const holidayLabelsByDay = useMemo(() => {
    const map: Record<number, string | undefined> = {}
    const prefix = `${monthKey}-`
    holidays.forEach((h) => {
      if (!h?.date?.startsWith(prefix)) return
      const dayStr = h.date.slice(prefix.length)
      const d = Number(dayStr)
      if (!Number.isFinite(d) || d < 1 || d > 31) return
      map[d] = h.label || "Sărbătoare legală"
    })
    return map
  }, [holidays, monthKey])

  const requestMetaByEmployeeDay = useMemo(() => {
    const map: Record<string, Record<number, { kind: HrRequestKind; label: string }>> = {}
    const approved = leaveRequests.filter((r) => r.status === "approved")
    const isInMonth = (dateStr: string) => String(dateStr).startsWith(`${monthKey}-`)

    const addDay = (employeeId: string, dateStr: string, kind: HrRequestKind) => {
      if (!isInMonth(dateStr)) return
      const dayStr = dateStr.slice(`${monthKey}-`.length)
      const day = Number(dayStr)
      if (!Number.isFinite(day) || day < 1 || day > 31) return
      if (!map[employeeId]) map[employeeId] = {}
      if (!map[employeeId][day]) {
        map[employeeId][day] = { kind, label: hrRequestKindLabel(kind) }
      }
    }

    approved.forEach((req) => {
      if (!req.employeeId) return
      const kind = req.kind
      const payload: any = req.payload as any
      if (kind === "CO" || kind === "CFP" || kind === "CM" || kind === "DEL") {
        if (!payload?.startDate || !payload?.endDate) return
        enumerateDatesInclusive(String(payload.startDate), String(payload.endDate)).forEach((d) => addDay(req.employeeId, d, kind))
        return
      }
      if (kind === "IN") {
        if (!payload?.date) return
        addDay(req.employeeId, String(payload.date), kind)
      }
    })

    return map
  }, [leaveRequests, monthKey])

  const extraColumns: TimesheetExtraColumn[] = useMemo(
    () => [
      { id: "zile_lucrate", label: "Zile lucrate", widthPx: 90, render: (e) => getSummary(e.id).zileLucrate },
      { id: "tichete_masa", label: "Tichete de masă", widthPx: 110, render: (e) => getSummary(e.id).ticheteMasa },
      { id: "ore_prezenta", label: "Ore prezență", widthPx: 110, render: (e) => getSummary(e.id).orePrezenta },
      { id: "ore_lucrate_efectiv", label: "Ore lucrate efectiv", widthPx: 140, render: (e) => getSummary(e.id).oreLucrateEfectiv },
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
      { id: "co", label: "Zile CO", widthPx: 80, render: (e) => getSummary(e.id).co },
      { id: "del", label: "Zile DEL", widthPx: 80, render: (e) => getSummary(e.id).del },
      { id: "in", label: "Ore IN", widthPx: 90, render: (e) => getSummary(e.id).totalTimpIN },
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
    [monthKey, timesheets, leaveRequests]
  )

  return (
    <DashboardShell>
      <DashboardHeader
        heading="Condică prezență"
        text=""
        headerAction={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLegendOpen((v) => !v)}
            >
              Vezi legendă
            </Button>
            <Button
              variant={viewMode === "grid" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
            >
              {viewMode === "grid" ? <LayoutGrid className="h-4 w-4 mr-2" /> : <List className="h-4 w-4 mr-2" />}
              {viewMode === "grid" ? "Grid" : "Listă"}
            </Button>
            {viewMode === "grid" && (
              <Button
                variant={compactMode ? "default" : "outline"}
                size="sm"
                onClick={() => setCompactMode(!compactMode)}
                title={compactMode ? "Modul detaliat" : "Modul compact"}
              >
                {compactMode ? <Maximize2 className="h-4 w-4 mr-2" /> : <Minimize2 className="h-4 w-4 mr-2" />}
                {compactMode ? "Detaliat" : "Compact"}
              </Button>
            )}
            {userData?.role === "admin" || userData?.role === "dispecer" ? (
              <Button variant="outline" size="sm" onClick={() => setHolidaysOpen(true)}>
                Sărbători legale
              </Button>
            ) : null}
            {userData?.role === "admin" || userData?.role === "dispecer" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const d = new Date()
                    d.setDate(d.getDate() - 1)
                    d.setHours(0, 0, 0, 0)
                    await syncAttendanceToTimesheet(d)
                    toast({ title: "Sincronizare completă", description: "Am re-sincronizat pontajul pentru ziua de ieri." })
                  } catch (err) {
                    toast({
                      title: "Eroare la sincronizare",
                      description: err instanceof Error ? err.message : "Nu am putut re-sincroniza pontajul.",
                      variant: "destructive",
                    })
                  }
                }}
              >
                Re-sincronizează (ieri)
              </Button>
            ) : null}
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
                  .sort((a, b) => getEmployeeFullName(a).localeCompare(getEmployeeFullName(b)))
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

      {userData?.role !== "admin" && userData?.role !== "dispecer" ? (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Afișez doar salariații pe care îi coordonezi.
        </div>
      ) : null}

      {/* KPI Dashboard Cards */}
      <TooltipProvider>
      <div className="grid gap-3 md:grid-cols-5 mb-4">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>Ore lucrate luna</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px]">
                  Suma orelor din condică pentru luna selectată, doar din zile cu cod <b>WORK</b>.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-emerald-700">{kpis.totalHoursMonth}h</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>Angajați activi azi</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px]">
                  Numărul de salariați care au <b>pontaj activ</b> (Play fără Stop) <b>astăzi</b>, pentru luna curentă.
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-blue-700">{kpis.activeEmployeesToday}</div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>În concediu (CO)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px]">
                  Numărul de salariați care au cod <b>CO</b> în condică <b>astăzi</b> (doar în luna curentă).
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-amber-700">{kpis.employeesOnLeave}</div>
          </CardContent>
        </Card>
        
        <Card className={`border-l-4 ${kpis.diffHours >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>Peste/Sub normă</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px]">
                  Diferența dintre orele lucrate și norma calculată: <br />
                  <b>Σ ore WORK</b> − (<b># zile WORK</b> × 8h).
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className={`text-xl font-bold ${kpis.diffHours >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {kpis.diffHours >= 0 ? '+' : ''}{kpis.diffHours}h
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs text-muted-foreground flex items-center justify-between gap-2">
              <span>Medie ore/angajat</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground hover:text-foreground">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[320px]">
                  <b>Σ ore WORK</b> / <b>număr salariați</b> (din lista afișată, filtrată după rol).
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3">
            <div className="text-xl font-bold text-primary">{kpis.avgHoursPerEmployee.toFixed(1)}h</div>
          </CardContent>
        </Card>
      </div>
      </TooltipProvider>

      {legendOpen ? (
        <div className="fixed bottom-4 right-4 z-40 w-[320px] max-w-[calc(100vw-32px)]">
          <Card className="shadow-xl">
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Legendă</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setLegendOpen(false)}>
                  Închide
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <TimesheetLegend />
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="mb-8">
        {viewMode === "grid" ? (
          <TimesheetGrid
            monthKey={monthKey}
            employees={filteredEmployees}
            getCell={getCell}
            onCellClick={openEdit}
            isActiveCell={isActiveCell}
            extraColumns={extraColumns}
            holidayLabelsByDay={holidayLabelsByDay}
            requestMetaByEmployeeDay={requestMetaByEmployeeDay}
            className="shadow-sm"
            compact={compactMode}
          />
        ) : (
          <TimesheetListView
            monthKey={monthKey}
            employees={filteredEmployees}
            getCell={getCell}
            onCellClick={openEdit}
            isActiveCell={isActiveCell}
            holidayLabelsByDay={holidayLabelsByDay}
            requestMetaByEmployeeDay={requestMetaByEmployeeDay}
          />
        )}
      </div>

      <LegalHolidaysDialog
        open={holidaysOpen}
        onOpenChange={setHolidaysOpen}
        year={Number(monthKey.split("-")[0])}
        items={holidays}
        onSave={async (items) => {
          const year = Number(monthKey.split("-")[0])
          if (!Number.isFinite(year)) return
          await saveHrHolidays({ year, items, updatedByUid: user?.uid })
        }}
      />

      <DayEntryPopover
        open={cellOpen}
        onOpenChange={(v) => {
          setCellOpen(v)
          if (!v) setAnchorRect(null)
        }}
        title={currentEmployeeName}
        subtitle={subtitle}
        cell={selectedCell}
        activeSessionStart={activeSessionStart}
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

          const entryOverlap = findOverlapPair(entries)
          if (entryOverlap) {
            toast({
              title: "Intervale suprapuse",
              description: `Conflict între ${entryOverlap.a} și ${entryOverlap.b}.`,
              variant: "destructive",
            })
            return
          }
          const breakOverlap = findOverlapPair(breaks)
          if (breakOverlap) {
            toast({
              title: "Pauze suprapuse",
              description: `Conflict între ${breakOverlap.a} și ${breakOverlap.b}.`,
              variant: "destructive",
            })
            return
          }
          const breakOutside = findBreakOutsideEntries(entries, breaks)
          if (breakOutside) {
            toast({
              title: "Pauză în afara intervalelor",
              description: `Pauza ${breakOutside.breakLabel} trebuie să fie în interiorul unui interval de lucru.`,
              variant: "destructive",
            })
            return
          }

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

            const existingOverlap = findOverlapWithExisting(existing?.entries ?? [], entries)
            if (existingOverlap) {
              toast({
                title: "Intervale suprapuse",
                description: `Conflict între ${existingOverlap.incoming} și ${existingOverlap.existing} în data ${String(day).padStart(2, "0")}.${monthKey.split("-")[1]}.${monthKey.split("-")[0]}.`,
                variant: "destructive",
              })
              return
            }
            const breakExistingOverlap = findOverlapWithExisting(existing?.breaks ?? [], breaks)
            if (breakExistingOverlap) {
              toast({
                title: "Pauze suprapuse",
                description: `Conflict între ${breakExistingOverlap.incoming} și ${breakExistingOverlap.existing} în data ${String(day).padStart(2, "0")}.${monthKey.split("-")[1]}.${monthKey.split("-")[0]}.`,
                variant: "destructive",
              })
              return
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
        requesterUid={user?.uid ?? ""}
        departments={departments}
      />
    </DashboardShell>
  )
}


