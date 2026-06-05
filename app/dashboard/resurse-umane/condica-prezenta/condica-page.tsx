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
  getEmployeeByUserUid,
  subscribeEmployees,
  subscribeDepartments,
  subscribeHrDefaults,
  subscribeHrRequestsForMonth,
  subscribeTimesheetsForMonth,
  upsertTimesheetCell,
  updateHrRequestByManager,
  syncHrRequestToTimesheets,
} from "@/lib/hr/storage"
import { Plus, Trash2, LayoutGrid, List, Download, Minimize2, Maximize2, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { exportTimesheetsToCSV } from "@/lib/hr/export"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "@/hooks/use-toast"
import { db } from "@/lib/firebase/config"
import type { AttendanceSession } from "@/types/attendance"
import type { HrDefaults, HrHoliday } from "@/lib/hr/types"
import { saveHrHolidays, subscribeHrHolidays } from "@/lib/hr/storage"
import { LegalHolidaysDialog } from "@/components/hr/legal-holidays-dialog"
import { formatRomanianDate } from "@/lib/utils/date-utils"
import { syncAttendanceToTimesheet } from "@/lib/attendance/sync-timesheet"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { calcEffectiveMinutes, minutesToHM, type HMRange, isValidHMRange } from "@/lib/hr/time-calc"

function InfoTooltipButton({
  tooltip,
  contentClassName,
  buttonClassName = "text-muted-foreground hover:text-foreground",
  ariaLabel = "Info",
}: {
  tooltip: React.ReactNode
  contentClassName?: string
  buttonClassName?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={buttonClassName}
          aria-label={ariaLabel}
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen((v) => !v)
          }}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className={cn("max-w-[420px] text-sm leading-snug", contentClassName)}>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function ColumnInfoLabel({
  label,
  tooltip,
}: {
  label: React.ReactNode
  tooltip: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{label}</span>
      <InfoTooltipButton tooltip={tooltip} />
    </span>
  )
}

function toMonthInputValue(monthKey: TimesheetMonthKey) {
  return monthKey
}

function fromMonthInputValue(v: string): TimesheetMonthKey {
  // HTML month input returns yyyy-MM
  return v as TimesheetMonthKey
}

function normalizeNameForMatch(value: string | undefined | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
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
  const [hrDefaults, setHrDefaults] = useState<HrDefaults>({})

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
  const [myEmployeeId, setMyEmployeeId] = useState<string | undefined>(undefined)
  const [legendOpen, setLegendOpen] = useState(false)
  const [holidaysOpen, setHolidaysOpen] = useState(false)
  const [holidays, setHolidays] = useState<HrHoliday[]>([])
  const [editApprovedRequestOpen, setEditApprovedRequestOpen] = useState(false)
  const [editApprovedRequestSaving, setEditApprovedRequestSaving] = useState(false)
  const [editApprovedPayload, setEditApprovedPayload] = useState<any>(null)
  const [editApprovedOriginalPayload, setEditApprovedOriginalPayload] = useState<any>(null)

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
    const unsub = subscribeHrDefaults({
      onChange: setHrDefaults,
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
        if (!employeeId && data.userName) {
          const sessionName = normalizeNameForMatch(String(data.userName || ""))
          const byName = employees.find((e) => normalizeNameForMatch(getEmployeeFullName(e)) === sessionName)
          if (byName?.id) employeeId = byName.id
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

  useEffect(() => {
    let mounted = true
    if (!user?.uid) {
      setMyEmployeeId(undefined)
      return
    }
    void getEmployeeByUserUid(user.uid).then((emp) => {
      if (mounted) setMyEmployeeId(emp?.id)
    })
    return () => {
      mounted = false
    }
  }, [user?.uid])

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

  const employeeById = useMemo(() => {
    return Object.fromEntries(employees.map((e) => [e.id, e] as const))
  }, [employees])

  const getEmployeeDefaultBreak = (employeeId: string): HMRange | null => {
    const emp = employeeById[employeeId]
    const start = String(emp?.pauzaStart || hrDefaults.pauzaStart || "").trim()
    const end = String(emp?.pauzaEnd || hrDefaults.pauzaEnd || "").trim()
    const r = { start, end }
    return isValidHMRange(r) ? r : null
  }

  const normalizeKey = (s: string) =>
    String(s || "")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()

  const overlapMinutes = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
    const s = Math.max(aStart, bStart)
    const e = Math.min(aEnd, bEnd)
    return Math.max(0, e - s)
  }

  const sumEntryMinutes = (
    entries: NonNullable<TimesheetCell["entries"]>,
    predicate: (e: NonNullable<TimesheetCell["entries"]>[number]) => boolean,
    window?: { start: number; end: number },
  ) => {
    return entries.reduce((sum, e) => {
      if (!predicate(e)) return sum
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || en <= s) return sum
      if (!window) return sum + (en - s)
      return sum + overlapMinutes(s, en, window.start, window.end)
    }, 0)
  }

  const getScheduleMinutes = (employeeId: string) => {
    const emp = employeeById[employeeId]
    const startRaw = String(emp?.programLucruStart || hrDefaults.programLucruStart || "08:00")
    const endRaw = String(emp?.programLucruEnd || hrDefaults.programLucruEnd || "16:30")
    const start = parseHM(startRaw)
    const end = parseHM(endRaw)
    if (start == null || end == null || end <= start) return null
    return { start, end, duration: end - start }
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
    let ticheteMasa = 0
    let orePrezenta = 0
    let oreLucrateEfectiv = 0
    let oreSarbatoriLegale = 0
    let co = 0
    let del = 0
    let totalTimpIN = 0
    let oreTraseuLaClient = 0
    let oreTraseuDeLaClient = 0
    let oreC1 = 0
    let oreC2 = 0
    let oreC3 = 0
    let oreC4 = 0
    let oreC5 = 0
    let oreC6 = 0
    let oreC7 = 0

    const dim = daysInMonth(monthKey)
    for (let d = 1; d <= dim; d++) {
      const c = ts?.days?.[String(d)]
      if (!c || c.code === "EMPTY") continue
      zileLucrate += 1

      const entries = (c.entries ?? []) as NonNullable<TimesheetCell["entries"]>
      const defaultBreak = getEmployeeDefaultBreak(employeeId)
      const schedule = getScheduleMinutes(employeeId)
      const [yStr, mStr] = monthKey.split("-")
      const dt = new Date(Number(yStr), Number(mStr) - 1, d)
      const dow = dt.getDay() // 0=Sun ... 6=Sat
      const isSaturday = dow === 6
      const isSunday = dow === 0
      const isHoliday = Boolean(holidayLabelsByDay[d])
      const isWeekendOrHoliday = isSaturday || isSunday || isHoliday
      const approvedKindForDay = requestMetaByEmployeeDay[employeeId]?.[d]?.kind
      const isExcludedByApprovedRequest =
        approvedKindForDay === "CO" ||
        approvedKindForDay === "CFP" ||
        approvedKindForDay === "CM" ||
        approvedKindForDay === "DEL" ||
        approvedKindForDay === "IN"

      const toClientKey = "traseu catre client"
      const toHomeKey = "traseu catre casa"
      const pontajKey = "pontaj"

      const isToClient = (e: NonNullable<TimesheetCell["entries"]>[number]) => normalizeKey(String(e.project || "")) === toClientKey
      const isToHome = (e: NonNullable<TimesheetCell["entries"]>[number]) => normalizeKey(String(e.project || "")) === toHomeKey
      const isPontaj = (e: NonNullable<TimesheetCell["entries"]>[number]) => normalizeKey(String(e.project || "")) === pontajKey

      const toClientMinutesTotal = sumEntryMinutes(entries, isToClient)
      const toHomeMinutesTotal = sumEntryMinutes(entries, isToHome)
      oreTraseuLaClient += toClientMinutesTotal / 60
      oreTraseuDeLaClient += toHomeMinutesTotal / 60

      // C6/C7: ore lucrate sâmbătă / duminică sau în sărbătoare legală (SL).
      // "Ore lucrate" = timp Pontaj (fallback la cell.hours dacă nu există entries).
      const pontajMinutesTotal = sumEntryMinutes(entries, isPontaj) || Math.round(Number(c.hours ?? 0) * 60)
      if (isHoliday || isSunday) {
        oreC7 += pontajMinutesTotal / 60
      } else if (isSaturday) {
        oreC6 += pontajMinutesTotal / 60
      }

      // C1/C2/C3/C4/C5: doar în zile normale (Lu–Vi, non-SL).
      if (schedule && !isWeekendOrHoliday) {
        // C1: de la check-in până la ora de început a programului standard (prefer "Traseu către client" înainte de start).
        // C2: de la ora de sfârșit a programului standard până la check-out (prefer "Traseu către casă" după end).
        const toClientBeforeStart = sumEntryMinutes(entries, isToClient, { start: 0, end: schedule.start })
        const toHomeAfterEnd = sumEntryMinutes(entries, isToHome, { start: schedule.end, end: 24 * 60 })

        let c1Min = toClientBeforeStart
        let c2Min = toHomeAfterEnd

        // Fallback: dacă nu există traseu cronometrat, folosim Pontaj (Play/Stop) ca proxy de check-in/out.
        if (!c1Min || !c2Min) {
          let earliestPontaj: number | null = null
          let latestPontaj: number | null = null
          entries.forEach((e) => {
            if (!isPontaj(e)) return
            const s = parseHM(e.start)
            const en = parseHM(e.end)
            if (s == null || en == null || en <= s) return
            earliestPontaj = earliestPontaj == null ? s : Math.min(earliestPontaj, s)
            latestPontaj = latestPontaj == null ? en : Math.max(latestPontaj, en)
          })
          if (!c1Min && earliestPontaj != null && earliestPontaj < schedule.start) c1Min = schedule.start - earliestPontaj
          if (!c2Min && latestPontaj != null && latestPontaj > schedule.end) c2Min = latestPontaj - schedule.end
        }

        oreC1 += c1Min / 60
        oreC2 += c2Min / 60

        // C3/C4/C5: ore Pontaj în afara programului standard (split 2h + 2h + rest).
        const pontajOutside =
          sumEntryMinutes(entries, isPontaj, { start: 0, end: schedule.start }) +
          sumEntryMinutes(entries, isPontaj, { start: schedule.end, end: 24 * 60 })

        const c3 = Math.min(120, pontajOutside)
        const c4 = Math.min(120, Math.max(0, pontajOutside - 120))
        const c5 = Math.max(0, pontajOutside - 240)
        oreC3 += c3 / 60
        oreC4 += c4 / 60
        oreC5 += c5 / 60
      }

      if (c.code === "WORK") {
        const computedMinutes =
          entries.length > 0
            ? calcEffectiveMinutes({
                entries: entries as any,
                breaks: (c.breaks ?? null) as any,
                defaultBreak,
              })
            : null
        const hours = computedMinutes != null ? computedMinutes / 60 : Number(c.hours ?? 8)
        orePrezenta += hours
        oreLucrateEfectiv += hours
        if (!isWeekendOrHoliday && !isExcludedByApprovedRequest && hours > 0) {
          ticheteMasa += 1
        }
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

    return {
      zileLucrate,
      ticheteMasa,
      orePrezenta,
      oreLucrateEfectiv,
      oreTraseuLaClient: Math.round(oreTraseuLaClient * 100) / 100,
      oreTraseuDeLaClient: Math.round(oreTraseuDeLaClient * 100) / 100,
      co,
      del,
      totalTimpIN,
      oreSarbatoriLegale,
      oreC1: Math.round(oreC1 * 100) / 100,
      oreC2: Math.round(oreC2 * 100) / 100,
      oreC3: Math.round(oreC3 * 100) / 100,
      oreC4: Math.round(oreC4 * 100) / 100,
      oreC5: Math.round(oreC5 * 100) / 100,
      oreC6: Math.round(oreC6 * 100) / 100,
      oreC7: Math.round(oreC7 * 100) / 100,
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

  const selectedApprovedRequest = useMemo(() => {
    if (!selectedEmployeeId || !selectedDateISO) return null
    const date = selectedDateISO
    const approved = leaveRequests.filter((r) => r.status === "approved" && r.employeeId === selectedEmployeeId)
    const inRange = (start: string, end: string) => start <= date && date <= end
    for (const r of approved) {
      const p: any = r.payload as any
      if (r.kind === "IN") {
        if (String(p?.date || "") === date) return r
        continue
      }
      if (r.kind === "CO" || r.kind === "CFP" || r.kind === "CM" || r.kind === "DEL") {
        const s = String(p?.startDate || "")
        const e = String(p?.endDate || "")
        if (s && e && inRange(s, e)) return r
      }
    }
    return null
  }, [leaveRequests, selectedEmployeeId, selectedDateISO])

  const selectedApprovedRequestLabel = useMemo(() => {
    const r = selectedApprovedRequest
    if (!r) return null
    const p: any = r.payload as any
    if (r.kind === "IN") {
      return `${hrRequestKindLabel(r.kind)} • ${String(p?.date || "—")} • ${String(p?.startTime || "—")}–${String(p?.endTime || "—")}`
    }
    if (r.kind === "CO" || r.kind === "CFP" || r.kind === "CM" || r.kind === "DEL") {
      return `${hrRequestKindLabel(r.kind)} • ${String(p?.startDate || "—")} → ${String(p?.endDate || "—")}`
    }
    return hrRequestKindLabel(r.kind)
  }, [selectedApprovedRequest])

  const daysFromRequestInMonth = (reqKind: HrRequestKind, payload: any, mk: TimesheetMonthKey): number[] => {
    if (!payload) return []
    const set = new Set<number>()
    const isInMonth = (iso: string) => String(iso).startsWith(`${mk}-`)
    if (reqKind === "IN") {
      const date = String(payload?.date || "")
      if (isInMonth(date)) {
        const d = Number(date.slice(`${mk}-`.length))
        if (Number.isFinite(d) && d >= 1 && d <= 31) set.add(d)
      }
      return Array.from(set).sort((a, b) => a - b)
    }
    if (reqKind === "CO" || reqKind === "CFP" || reqKind === "CM" || reqKind === "DEL") {
      const start = String(payload?.startDate || "")
      const end = String(payload?.endDate || "")
      if (!start || !end) return []
      enumerateDatesInclusive(start, end).forEach((iso) => {
        if (!isInMonth(iso)) return
        const d = Number(iso.slice(`${mk}-`.length))
        if (Number.isFinite(d) && d >= 1 && d <= 31) set.add(d)
      })
      return Array.from(set).sort((a, b) => a - b)
    }
    return []
  }

  const openEditApprovedRequest = () => {
    if (!selectedApprovedRequest) return
    // deep clone payload for safe editing
    const original = JSON.parse(JSON.stringify(selectedApprovedRequest.payload ?? {}))
    setEditApprovedOriginalPayload(original)
    setEditApprovedPayload(JSON.parse(JSON.stringify(original)))
    setEditApprovedRequestOpen(true)
  }

  const saveEditApprovedRequest = async () => {
    if (!user?.uid) return
    if (!selectedApprovedRequest?.id || !editApprovedPayload) return
    try {
      setEditApprovedRequestSaving(true)
      const requestId = selectedApprovedRequest.id

      await updateHrRequestByManager({
        requestId: selectedApprovedRequest.id,
        managerUid: user.uid,
        updates: { payload: editApprovedPayload },
      })

      const sync = await syncHrRequestToTimesheets({
        requestId,
        employeeId: selectedApprovedRequest.employeeId,
        kind: selectedApprovedRequest.kind,
        payload: editApprovedPayload,
        oldPayload: editApprovedOriginalPayload,
        overwriteConflicts: true,
      })

      toast({ title: "Actualizat", description: "Am actualizat cererea aprobată." })
      if (sync.updated || sync.removed || sync.skipped) {
        toast({
          title: "Condică sincronizată",
          description: `Actualizate: ${sync.updated} • Șterse: ${sync.removed} • Sărite (conflict): ${sync.skipped}`,
        })
      }
      setEditApprovedRequestOpen(false)
    } catch (e: any) {
      toast({ title: "Eroare", description: e?.message || "Nu am putut actualiza cererea.", variant: "destructive" })
    } finally {
      setEditApprovedRequestSaving(false)
    }
  }

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
      {
        id: "zile_lucrate",
        label: (
          <ColumnInfoLabel
            label="Zile lucrate"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Zile lucrate</b> = numărul de zile din luna selectată care sunt completate în condică (nu sunt „goale”).
                </div>
                <div className="text-muted-foreground">Include orice tip de zi (lucru, weekend, sărbătoare, concedii etc.), atâta timp cât există o înregistrare.</div>
              </div>
            }
          />
        ),
        widthPx: 90,
        render: (e) => getSummary(e.id).zileLucrate,
      },
      {
        id: "tichete_masa",
        label: (
          <ColumnInfoLabel
            label="Tichete de masă"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Tichete</b> = numărul de zile cu <b>WORK</b>, doar <b>L–V</b>, non-sărbătoare legală, fără
                  cereri aprobate <b>CO/CFP/CM/DEL/IN</b>, cu ore efective <b>{">"} 0</b>.
                </div>
                <div className="text-muted-foreground">
                  Orele efective sunt calculate din intervalele zilei (cu pauze), iar fallback-ul este câmpul de ore al celulei.
                </div>
              </div>
            }
          />
        ),
        widthPx: 110,
        render: (e) => getSummary(e.id).ticheteMasa,
      },
      {
        id: "ore_prezenta",
        label: (
          <ColumnInfoLabel
            label="Ore prezență"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Ore prezență</b> = suma orelor trecute în condică pentru zilele de <b>lucru</b> (WORK).
                </div>
                <div className="text-muted-foreground">
                  Dacă într-o zi de lucru nu este trecut un număr de ore, se consideră <b>8 ore</b>. Zilele care nu sunt „WORK” nu intră aici.
                </div>
              </div>
            }
          />
        ),
        widthPx: 110,
        render: (e) => {
          const orePrezenta = getSummary(e.id).orePrezenta
          return minutesToHM(Math.round(Number(orePrezenta || 0) * 60))
        },
      },
      {
        id: "ore_lucrate_efectiv",
        label: (
          <ColumnInfoLabel
            label="Ore lucrate efectiv"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  În acest moment este identic cu <b>Ore prezență</b>: suma orelor din condică pentru zilele de lucru (WORK).
                </div>
              </div>
            }
          />
        ),
        widthPx: 140,
        render: (e) => {
          const oreLucrateEfectiv = getSummary(e.id).oreLucrateEfectiv
          return minutesToHM(Math.round(Number(oreLucrateEfectiv || 0) * 60))
        },
      },
      { 
        id: "banca_ore", 
        label: (
          <ColumnInfoLabel
            label="Bancă de ore"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Bancă</b> = (total ore de lucru din condică) − (8 ore × numărul zilelor de lucru).
                </div>
                <div className="text-muted-foreground">
                  Pozitiv = peste normă; negativ = sub normă. Se calculează doar pe zilele de lucru (WORK).
                </div>
              </div>
            }
          />
        ), 
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
      {
        id: "traseu_la",
        label: (
          <ColumnInfoLabel
            label="Ore traseu la client"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  Se adună durata intervalelor marcate <b>„Traseu către client”</b>.
                </div>
                <div className="text-muted-foreground">Durata unui interval = ora de final − ora de start.</div>
              </div>
            }
          />
        ),
        widthPx: 130,
        render: (e) => getSummary(e.id).oreTraseuLaClient,
      },
      {
        id: "traseu_de",
        label: (
          <ColumnInfoLabel
            label="Ore traseu de la client"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  Se adună durata intervalelor marcate <b>„Traseu către casă”</b>.
                </div>
              </div>
            }
          />
        ),
        widthPx: 140,
        render: (e) => getSummary(e.id).oreTraseuDeLaClient,
      },
      {
        id: "co",
        label: (
          <ColumnInfoLabel
            label="Zile CO"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Zile CO</b> = numărul de zile din cererile de <b>concediu de odihnă</b> <b>aprobate</b> care se suprapun cu luna selectată.
                </div>
                <div className="text-muted-foreground">Se ia din cererile aprobate, nu din ce este completat manual în ziua respectivă.</div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).co,
      },
      {
        id: "del",
        label: (
          <ColumnInfoLabel
            label="Zile DEL"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Zile DEL</b> = numărul de zile din cererile de <b>delegație</b> <b>aprobate</b> care se suprapun cu luna selectată.
                </div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).del,
      },
      {
        id: "in",
        label: (
          <ColumnInfoLabel
            label="Ore IN"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Ore IN</b> = suma duratelor din cererile <b>IN aprobate</b> (ora final − ora start), pentru zile din luna selectată.
                </div>
              </div>
            }
          />
        ),
        widthPx: 90,
        render: (e) => getSummary(e.id).totalTimpIN,
      },
      {
        id: "ore_sl",
        label: (
          <ColumnInfoLabel
            label="Ore sărbători legale"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">Formula</div>
                <div>
                  <b>Ore SL</b> = suma orelor trecute în condică pentru zile marcate ca <b>SL</b> (sărbători legale).
                </div>
                <div className="text-muted-foreground">Dacă nu este trecut un număr de ore, se consideră <b>8 ore</b>.</div>
              </div>
            }
          />
        ),
        widthPx: 140,
        render: (e) => getSummary(e.id).oreSarbatoriLegale,
      },
      {
        id: "c1",
        label: (
          <ColumnInfoLabel
            label="Ore C1"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">C1 (înainte de program)</div>
                <div className="text-muted-foreground">Se calculează doar în zilele Lu–Vi care nu sunt sărbători legale.</div>
                <div>
                  <b>C1</b> = timpul de <b>„Traseu către client”</b> care este <b>înainte de ora de început a programului</b>.
                </div>
                <div className="text-muted-foreground">
                  Dacă nu există traseu cronometrat, se folosește ora de început din pontaj (primul interval) ca reper.
                </div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).oreC1,
      },
      {
        id: "c2",
        label: (
          <ColumnInfoLabel
            label="Ore C2"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">C2 (după program)</div>
                <div className="text-muted-foreground">Se calculează doar în zilele Lu–Vi care nu sunt sărbători legale.</div>
                <div>
                  <b>C2</b> = timpul de <b>„Traseu către casă”</b> care este <b>după ora de final a programului</b>.
                </div>
                <div className="text-muted-foreground">
                  Dacă nu există traseu cronometrat, se folosește ora de final din pontaj (ultimul interval) ca reper.
                </div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).oreC2,
      },
      {
        id: "c3",
        label: (
          <ColumnInfoLabel
            label="Ore C3"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">C3 (primele 2h peste program)</div>
                <div className="text-muted-foreground">Se calculează doar în zilele Lu–Vi care nu sunt sărbători legale.</div>
                <div>
                  Se ia timpul pontat <b>în afara programului</b> (înainte de început + după final).
                </div>
                <div>
                  <b>C3</b> = primele <b>2 ore</b> din acest timp (maxim 2h).
                </div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).oreC3,
      },
      {
        id: "c4",
        label: (
          <ColumnInfoLabel
            label="Ore C4"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">C4 (orele 2–4 peste program)</div>
                <div className="text-muted-foreground">Se calculează doar în zilele Lu–Vi care nu sunt sărbători legale.</div>
                <div>
                  Se ia timpul pontat <b>în afara programului</b> (înainte de început + după final).
                </div>
                <div>
                  <b>C4</b> = următoarele <b>2 ore</b> după C3 (maxim 2h).
                </div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).oreC4,
      },
      {
        id: "c5",
        label: (
          <ColumnInfoLabel
            label="Ore C5"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">C5 (peste 4h peste program)</div>
                <div className="text-muted-foreground">Se calculează doar în zilele Lu–Vi care nu sunt sărbători legale.</div>
                <div>
                  Se ia timpul pontat <b>în afara programului</b> (înainte de început + după final).
                </div>
                <div>
                  <b>C5</b> = tot ce depășește <b>4 ore</b> peste program (după C3+C4).
                </div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).oreC5,
      },
      {
        id: "c6",
        label: (
          <ColumnInfoLabel
            label="Ore C6"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">C6 (ore lucrate sâmbătă)</div>
                <div>
                  Pentru zilele de <b>sâmbătă</b>: se adună timpul pontat.
                </div>
                <div className="text-muted-foreground">Dacă nu există pontaj detaliat, se folosește numărul de ore trecut în zi.</div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).oreC6,
      },
      {
        id: "c7",
        label: (
          <ColumnInfoLabel
            label="Ore C7"
            tooltip={
              <div className="space-y-2">
                <div className="font-semibold">C7 (ore lucrate duminică / sărbătoare legală)</div>
                <div>
                  Pentru <b>duminică</b> sau zile marcate ca <b>sărbătoare legală</b>: se adună timpul pontat.
                </div>
                <div className="text-muted-foreground">
                  Dacă nu există pontaj detaliat, se folosește numărul de ore trecut în zi. Sărbătorile vin din butonul „Sărbători legale”.
                </div>
              </div>
            }
          />
        ),
        widthPx: 80,
        render: (e) => getSummary(e.id).oreC7,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthKey, timesheets, leaveRequests, holidays, hrDefaults, employees]
  )

  return (
    <TooltipProvider>
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
              <InfoTooltipButton
                tooltip={
                  <>
                    <b>Total ore</b> = suma orelor din condică pentru toate zilele de lucru (WORK), în luna selectată.
                    <br />
                    Dacă într-o zi de lucru nu este trecut un număr de ore, se consideră <b>8 ore</b>.
                  </>
                }
                contentClassName="max-w-[320px]"
              />
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
              <InfoTooltipButton
                tooltip={
                  <>
                    Numărul de salariați din lista afișată care au <b>pontaj activ</b> (Play fără Stop) <b>astăzi</b>.
                    <br />
                    Se calculează doar pentru <b>luna curentă</b>.
                  </>
                }
                contentClassName="max-w-[320px]"
              />
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
              <InfoTooltipButton
                tooltip={
                  <>
                    Numărul de salariați care au în condică, la data de <b>astăzi</b>, codul <b>CO</b>.
                    <br />
                    Se calculează doar pentru <b>luna curentă</b>.
                  </>
                }
                contentClassName="max-w-[320px]"
              />
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
              <InfoTooltipButton
                tooltip={
                  <>
                    <b>Diferență</b> = (total ore de lucru din condică) − (8 ore × numărul zilelor de lucru), cumulat pe salariații afișați.
                    <br />
                    Pozitiv = peste normă; negativ = sub normă.
                  </>
                }
                contentClassName="max-w-[320px]"
              />
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
              <InfoTooltipButton
                tooltip={
                  <>
                    <b>Medie</b> = (total ore de lucru din condică) / (număr salariați afișați).
                    <br />
                    Se calculează doar din zilele de lucru (WORK).
                  </>
                }
                contentClassName="max-w-[320px]"
              />
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
            getDefaultBreakForEmployee={getEmployeeDefaultBreak}
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
            getDefaultBreakForEmployee={getEmployeeDefaultBreak}
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
        approvedRequestLabel={selectedApprovedRequestLabel}
        onOpenEditApprovedRequest={selectedApprovedRequest ? openEditApprovedRequest : null}
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
        dateISO={selectedDateISO}
        defaultBreak={selectedEmployeeId ? getEmployeeDefaultBreak(selectedEmployeeId) : null}
      />

      <Dialog
        open={editApprovedRequestOpen}
        onOpenChange={(v) => {
          if (editApprovedRequestSaving) return
          setEditApprovedRequestOpen(v)
          if (!v) {
            setEditApprovedPayload(null)
            setEditApprovedOriginalPayload(null)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editează cererea aprobată</DialogTitle>
          </DialogHeader>

          {selectedApprovedRequest && editApprovedPayload ? (
            <div className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/20">
                <div className="text-sm">
                  <span className="text-muted-foreground">Tip:</span>{" "}
                  <span className="font-semibold">{hrRequestKindLabel(selectedApprovedRequest.kind)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Notă: editarea de aici modifică <b>cererea HR</b> (nu completează automat condica).
                </div>
              </div>

              {(selectedApprovedRequest.kind === "CO" ||
                selectedApprovedRequest.kind === "CFP" ||
                selectedApprovedRequest.kind === "CM" ||
                selectedApprovedRequest.kind === "DEL") && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>De la</Label>
                    <Input
                      type="date"
                      value={String(editApprovedPayload.startDate || "")}
                      onChange={(e) => setEditApprovedPayload({ ...editApprovedPayload, startDate: e.target.value })}
                      disabled={editApprovedRequestSaving}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Până la</Label>
                    <Input
                      type="date"
                      value={String(editApprovedPayload.endDate || "")}
                      onChange={(e) => setEditApprovedPayload({ ...editApprovedPayload, endDate: e.target.value })}
                      disabled={editApprovedRequestSaving}
                    />
                  </div>
                </div>
              )}

              {selectedApprovedRequest.kind === "IN" && (
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={String(editApprovedPayload.date || "")}
                      onChange={(e) => setEditApprovedPayload({ ...editApprovedPayload, date: e.target.value })}
                      disabled={editApprovedRequestSaving}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Ora start</Label>
                    <Input
                      type="time"
                      value={String(editApprovedPayload.startTime || "")}
                      onChange={(e) => setEditApprovedPayload({ ...editApprovedPayload, startTime: e.target.value })}
                      disabled={editApprovedRequestSaving}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Ora end</Label>
                    <Input
                      type="time"
                      value={String(editApprovedPayload.endTime || "")}
                      onChange={(e) => setEditApprovedPayload({ ...editApprovedPayload, endTime: e.target.value })}
                      disabled={editApprovedRequestSaving}
                    />
                  </div>
                </div>
              )}

              <div className="grid gap-2">
                <Label>Motiv (opțional)</Label>
                <Textarea
                  value={String(editApprovedPayload.reason ?? "")}
                  onChange={(e) => setEditApprovedPayload({ ...editApprovedPayload, reason: e.target.value })}
                  rows={3}
                  disabled={editApprovedRequestSaving}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditApprovedRequestOpen(false)} disabled={editApprovedRequestSaving}>
              Anulează
            </Button>
            <Button onClick={saveEditApprovedRequest} disabled={editApprovedRequestSaving || !selectedApprovedRequest || !editApprovedPayload}>
              {editApprovedRequestSaving ? (
                <>
                  <Spinner className="h-4 w-4 mr-2 border-muted-foreground border-t-transparent" />
                  Se salvează...
                </>
              ) : (
                "Salvează"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddDayEntryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        employees={employees}
        defaultEmployeeId={addDefaults?.employeeId ?? (employeeFilter !== "all" ? employeeFilter : undefined)}
        defaultStartDate={addDefaults?.startDate}
        defaultBreakStart={
          (() => {
            const id = addDefaults?.employeeId ?? (employeeFilter !== "all" ? employeeFilter : undefined)
            if (!id) return hrDefaults.pauzaStart
            return employeeById[id]?.pauzaStart || hrDefaults.pauzaStart
          })() || undefined
        }
        defaultBreakEnd={
          (() => {
            const id = addDefaults?.employeeId ?? (employeeFilter !== "all" ? employeeFilter : undefined)
            if (!id) return hrDefaults.pauzaEnd
            return employeeById[id]?.pauzaEnd || hrDefaults.pauzaEnd
          })() || undefined
        }
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
        defaultEmployeeId={
          employeeFilter !== "all" ? employeeFilter : myEmployeeId
        }
        requesterUid={user?.uid ?? ""}
        departments={departments}
      />
      </DashboardShell>
    </TooltipProvider>
  )
}
