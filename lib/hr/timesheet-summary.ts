import type { Employee, HrDefaults, HrHoliday, HrRequest, TimesheetCell, TimesheetMonth, TimesheetMonthKey } from "@/lib/hr/types"
import { calcEffectiveMinutes, isValidHMRange, overlapMinutes, parseHM, type HMRange } from "@/lib/hr/time-calc"

type TimesheetEntry = NonNullable<TimesheetCell["entries"]>[number]

export type EmployeeTimesheetSummary = {
  zileLucrate: number
  ticheteMasa: number
  orePrezenta: number
  oreLucrateEfectiv: number
  oreTraseuLaClient: number
  oreTraseuDeLaClient: number
  co: number
  del: number
  totalTimpIN: number
  oreSarbatoriLegale: number
  oreC1: number
  oreC2: number
  oreC3: number
  oreC4: number
  oreC5: number
  oreC6: number
  oreC7: number
}

export type OvertimeBankSummary = {
  overtime: number
  display: string
}

export function daysInMonthFromKey(monthKey: TimesheetMonthKey): number {
  const [yStr, mStr] = String(monthKey).split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 31
  return new Date(y, m, 0).getDate()
}

function normalizeKey(value: string) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function round2(value: number) {
  return Math.round(value * 100) / 100
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

function countDaysInRangeForMonth(monthKey: TimesheetMonthKey, startDate: string, endDate: string) {
  return enumerateDatesInclusive(startDate, endDate).filter((date) => date.startsWith(`${monthKey}-`)).length
}

function hoursFromInterval(startTime: string, endTime: string) {
  const start = parseHM(startTime)
  const end = parseHM(endTime)
  if (start == null || end == null || end <= start) return 0
  return (end - start) / 60
}

function getDefaultBreak(employee?: Employee | null, defaults?: HrDefaults | null): HMRange | null {
  const start = String(employee?.pauzaStart || defaults?.pauzaStart || "").trim()
  const end = String(employee?.pauzaEnd || defaults?.pauzaEnd || "").trim()
  const range = { start, end }
  return isValidHMRange(range) ? range : null
}

function getScheduleMinutes(employee?: Employee | null, defaults?: HrDefaults | null) {
  const startRaw = String(employee?.programLucruStart || defaults?.programLucruStart || "08:00")
  const endRaw = String(employee?.programLucruEnd || defaults?.programLucruEnd || "16:30")
  const start = parseHM(startRaw)
  const end = parseHM(endRaw)
  if (start == null || end == null || end <= start) return null
  return { start, end, duration: end - start }
}

function sumEntryMinutes(entries: TimesheetEntry[], predicate: (entry: TimesheetEntry) => boolean, window?: { start: number; end: number }) {
  return entries.reduce((sum, entry) => {
    if (!predicate(entry)) return sum
    const start = parseHM(entry.start)
    const end = parseHM(entry.end)
    if (start == null || end == null || end <= start) return sum
    if (!window) return sum + (end - start)
    return sum + overlapMinutes(start, end, window.start, window.end)
  }, 0)
}

function approvedKindByDay(params: {
  employeeId: string
  monthKey: TimesheetMonthKey
  requests?: HrRequest[]
}) {
  const map: Record<number, HrRequest["kind"]> = {}
  const prefix = `${params.monthKey}-`
  for (const request of params.requests ?? []) {
    if (request.employeeId !== params.employeeId || request.status !== "approved") continue
    const payload: any = request.payload as any
    const add = (date: string) => {
      if (!String(date).startsWith(prefix)) return
      const day = Number(String(date).slice(prefix.length))
      if (Number.isFinite(day) && day >= 1 && day <= 31 && !map[day]) map[day] = request.kind
    }
    if (request.kind === "CO" || request.kind === "CFP" || request.kind === "CM" || request.kind === "DEL") {
      if (!payload?.startDate || !payload?.endDate) continue
      enumerateDatesInclusive(String(payload.startDate), String(payload.endDate)).forEach(add)
    } else if (request.kind === "IN" && payload?.date) {
      add(String(payload.date))
    }
  }
  return map
}

export function calculateEmployeeTimesheetSummary(params: {
  employeeId: string
  monthKey: TimesheetMonthKey
  timesheet?: TimesheetMonth | null
  employee?: Employee | null
  hrDefaults?: HrDefaults | null
  requests?: HrRequest[]
  holidays?: HrHoliday[]
}): EmployeeTimesheetSummary {
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

  const holidayLabelsByDay: Record<number, string | undefined> = {}
  const prefix = `${params.monthKey}-`
  for (const holiday of params.holidays ?? []) {
    if (!holiday.date?.startsWith(prefix)) continue
    const day = Number(holiday.date.slice(prefix.length))
    if (Number.isFinite(day) && day >= 1 && day <= 31) holidayLabelsByDay[day] = holiday.label || "Sărbătoare legală"
  }

  const approvedByDay = approvedKindByDay({
    employeeId: params.employeeId,
    monthKey: params.monthKey,
    requests: params.requests,
  })
  const defaultBreak = getDefaultBreak(params.employee, params.hrDefaults)
  const schedule = getScheduleMinutes(params.employee, params.hrDefaults)
  const dim = daysInMonthFromKey(params.monthKey)

  for (let day = 1; day <= dim; day++) {
    const cell = params.timesheet?.days?.[String(day)]
    if (!cell || cell.code === "EMPTY") continue
    zileLucrate += 1

    const entries = (cell.entries ?? []) as TimesheetEntry[]
    const [yearStr, monthStr] = params.monthKey.split("-")
    const date = new Date(Number(yearStr), Number(monthStr) - 1, day)
    const dow = date.getDay()
    const isSaturday = dow === 6
    const isSunday = dow === 0
    const isHoliday = Boolean(holidayLabelsByDay[day])
    const isWeekendOrHoliday = isSaturday || isSunday || isHoliday
    const approvedKind = approvedByDay[day]
    const isExcludedByApprovedRequest =
      approvedKind === "CO" ||
      approvedKind === "CFP" ||
      approvedKind === "CM" ||
      approvedKind === "DEL" ||
      approvedKind === "IN"

    const isToClient = (entry: TimesheetEntry) => normalizeKey(String(entry.project || "")) === "traseu catre client"
    const isToHome = (entry: TimesheetEntry) => normalizeKey(String(entry.project || "")) === "traseu catre casa"
    const isPontaj = (entry: TimesheetEntry) => normalizeKey(String(entry.project || "")) === "pontaj"

    const toClientMinutesTotal = sumEntryMinutes(entries, isToClient)
    const toHomeMinutesTotal = sumEntryMinutes(entries, isToHome)
    oreTraseuLaClient += toClientMinutesTotal / 60
    oreTraseuDeLaClient += toHomeMinutesTotal / 60

    const pontajMinutesTotal = sumEntryMinutes(entries, isPontaj) || Math.round(Number(cell.hours ?? 0) * 60)
    if (isHoliday || isSunday) {
      oreC7 += pontajMinutesTotal / 60
    } else if (isSaturday) {
      oreC6 += pontajMinutesTotal / 60
    }

    if (schedule && !isWeekendOrHoliday) {
      const toClientBeforeStart = sumEntryMinutes(entries, isToClient, { start: 0, end: schedule.start })
      const toHomeAfterEnd = sumEntryMinutes(entries, isToHome, { start: schedule.end, end: 24 * 60 })

      let c1Min = toClientBeforeStart
      let c2Min = toHomeAfterEnd

      if (!c1Min || !c2Min) {
        let earliestPontaj: number | null = null
        let latestPontaj: number | null = null
        for (const entry of entries) {
          if (!isPontaj(entry)) continue
          const start = parseHM(entry.start)
          const end = parseHM(entry.end)
          if (start == null || end == null || end <= start) continue
          earliestPontaj = earliestPontaj == null ? start : Math.min(earliestPontaj, start)
          latestPontaj = latestPontaj == null ? end : Math.max(latestPontaj, end)
        }
        if (!c1Min && earliestPontaj != null && earliestPontaj < schedule.start) c1Min = schedule.start - earliestPontaj
        if (!c2Min && latestPontaj != null && latestPontaj > schedule.end) c2Min = latestPontaj - schedule.end
      }

      oreC1 += c1Min / 60
      oreC2 += c2Min / 60

      const pontajOutside =
        sumEntryMinutes(entries, isPontaj, { start: 0, end: schedule.start }) +
        sumEntryMinutes(entries, isPontaj, { start: schedule.end, end: 24 * 60 })

      oreC3 += Math.min(120, pontajOutside) / 60
      oreC4 += Math.min(120, Math.max(0, pontajOutside - 120)) / 60
      oreC5 += Math.max(0, pontajOutside - 240) / 60
    }

    if (cell.code === "WORK") {
      const computedMinutes =
        entries.length > 0
          ? calcEffectiveMinutes({
              entries,
              breaks: cell.breaks ?? null,
              defaultBreak,
            })
          : null
      const hours = computedMinutes != null ? computedMinutes / 60 : Number(cell.hours ?? 8)
      orePrezenta += hours
      oreLucrateEfectiv += hours
      if (!isWeekendOrHoliday && !isExcludedByApprovedRequest && hours > 0) {
        ticheteMasa += 1
      }
    } else if (cell.code === "SL") {
      oreSarbatoriLegale += Number(cell.hours ?? 8)
    }
  }

  for (const request of params.requests ?? []) {
    if (request.employeeId !== params.employeeId || request.status !== "approved") continue
    const payload: any = request.payload as any
    if (request.kind === "CO" && payload?.startDate && payload?.endDate) {
      co += countDaysInRangeForMonth(params.monthKey, payload.startDate, payload.endDate)
    } else if (request.kind === "DEL" && payload?.startDate && payload?.endDate) {
      del += countDaysInRangeForMonth(params.monthKey, payload.startDate, payload.endDate)
    } else if (request.kind === "IN" && payload?.date && payload?.startTime && payload?.endTime) {
      if (String(payload.date).startsWith(params.monthKey)) {
        totalTimpIN += hoursFromInterval(payload.startTime, payload.endTime)
      }
    }
  }

  return {
    zileLucrate,
    ticheteMasa,
    orePrezenta,
    oreLucrateEfectiv,
    oreTraseuLaClient: round2(oreTraseuLaClient),
    oreTraseuDeLaClient: round2(oreTraseuDeLaClient),
    co,
    del,
    totalTimpIN: round2(totalTimpIN),
    oreSarbatoriLegale,
    oreC1: round2(oreC1),
    oreC2: round2(oreC2),
    oreC3: round2(oreC3),
    oreC4: round2(oreC4),
    oreC5: round2(oreC5),
    oreC6: round2(oreC6),
    oreC7: round2(oreC7),
  }
}

export function calculateOvertimeBankFromSummary(summary: Pick<EmployeeTimesheetSummary, "orePrezenta">, workDays: number): OvertimeBankSummary {
  const overtime = round2(Number(summary.orePrezenta || 0) - workDays * 8)
  return {
    overtime,
    display: `${overtime >= 0 ? "+" : ""}${overtime.toFixed(1)}h`,
  }
}

export function calculateEmployeeOvertimeBank(params: {
  employeeId: string
  monthKey: TimesheetMonthKey
  timesheet?: TimesheetMonth | null
  employee?: Employee | null
  hrDefaults?: HrDefaults | null
  requests?: HrRequest[]
  holidays?: HrHoliday[]
}): OvertimeBankSummary {
  const summary = calculateEmployeeTimesheetSummary(params)
  let workDays = 0
  const dim = daysInMonthFromKey(params.monthKey)
  for (let day = 1; day <= dim; day++) {
    if (params.timesheet?.days?.[String(day)]?.code === "WORK") workDays++
  }
  return calculateOvertimeBankFromSummary(summary, workDays)
}
