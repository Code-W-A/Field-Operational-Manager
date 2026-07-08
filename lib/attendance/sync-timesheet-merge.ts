import type { TimesheetCell, TimesheetCode } from "@/lib/hr/types"
import { calcEffectiveMinutes, type HMRange } from "@/lib/hr/time-calc"

type TimesheetEntry = NonNullable<TimesheetCell["entries"]>[number]

function parseHM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function isNonWorkHrCode(code: TimesheetCode | undefined) {
  if (!code) return false
  return code === "CO" || code === "CFP" || code === "CM" || code === "IN"
}

function normalizeNonOverlappingEntries(entries: NonNullable<TimesheetCell["entries"]>) {
  const withRanges = entries
    .map((entry) => {
      const start = parseHM(entry.start)
      const end = parseHM(entry.end)
      if (start == null || end == null || start >= end) return null
      return { entry, start, end }
    })
    .filter(Boolean) as Array<{ entry: TimesheetEntry; start: number; end: number }>

  if (withRanges.length <= 1) return withRanges.map((range) => range.entry)

  withRanges.sort((a, b) => a.start - b.start || a.end - b.end)
  const result: typeof withRanges = []
  for (const item of withRanges) {
    const last = result[result.length - 1]
    if (!last || item.start >= last.end) {
      result.push(item)
    }
  }
  return result.map((range) => range.entry)
}

function isValidEntry(entry: TimesheetEntry) {
  const start = parseHM(entry.start)
  const end = parseHM(entry.end)
  return start != null && end != null && start < end
}

const PONTAJ_PROJECTS = new Set<string>(["Pontaj", "Traseu către client", "Traseu către casă"])

function isPontajGeneratedEntry(entry: TimesheetEntry) {
  return PONTAJ_PROJECTS.has(String(entry.project ?? ""))
}

export function buildAttendanceTimesheetCell(params: {
  existingDay?: TimesheetCell
  computedEntries: NonNullable<TimesheetCell["entries"]>
  defaultBreak?: HMRange | null
}): { cell: TimesheetCell; protectedCode?: undefined } | { cell: null; protectedCode: TimesheetCode } {
  const existingCode = params.existingDay?.code as TimesheetCode | undefined
  if (existingCode && isNonWorkHrCode(existingCode)) {
    return { cell: null, protectedCode: existingCode }
  }

  const preservedEntries = (params.existingDay?.entries ?? []).filter((entry) => {
    return !isPontajGeneratedEntry(entry) && isValidEntry(entry)
  })
  const normalizedComputed = normalizeNonOverlappingEntries(params.computedEntries)
  const finalEntries = [...preservedEntries, ...normalizedComputed]
  const existingBreaks = params.existingDay?.breaks
  const totalMinutesEffective = calcEffectiveMinutes({
    entries: finalEntries as any,
    breaks: (existingBreaks ?? null) as any,
    defaultBreak: params.defaultBreak ?? null,
  })
  const code: TimesheetCode = existingCode === "DEL" || existingCode === "WE" || existingCode === "SL" ? existingCode : "WORK"

  return {
    cell: {
      code,
      hours: Math.round((totalMinutesEffective / 60) * 100) / 100,
      entries: finalEntries,
      ...(existingBreaks ? { breaks: existingBreaks } : {}),
    },
  }
}
