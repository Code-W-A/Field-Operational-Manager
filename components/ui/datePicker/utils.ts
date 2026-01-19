import { addDays, endOfMonth, endOfWeek, format, isAfter, isBefore, isSameDay, startOfMonth, startOfWeek, parse } from "date-fns"
import { enUS, ro } from "date-fns/locale"
import type { DatePickerLocale, DateRange } from "./types"

export function getLocale(locale: DatePickerLocale) {
  return locale === "ro" ? ro : enUS
}

export function formatDate(date: Date, fmt: string, locale: DatePickerLocale) {
  return format(date, fmt, { locale: getLocale(locale) })
}

export function parseDate(value: string, fmt: string, locale: DatePickerLocale): Date | null {
  if (!value) return null
  const parsed = parse(value, fmt, new Date(), { locale: getLocale(locale) })
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

export function isOutsideRange(date: Date, min?: Date, max?: Date) {
  if (min && isBefore(date, min)) return true
  if (max && isAfter(date, max)) return true
  return false
}

export function normalizeRange(range: DateRange): DateRange {
  if (range.start && range.end && isAfter(range.start, range.end)) {
    return { start: range.end, end: range.start }
  }
  return range
}

export function updateRange(current: DateRange, nextDate: Date): DateRange {
  if (!current.start || (current.start && current.end)) {
    return { start: nextDate, end: null }
  }
  const next: DateRange = { start: current.start, end: nextDate }
  return normalizeRange(next)
}

export function isWithinRange(date: Date, range: DateRange) {
  if (!range.start || !range.end) return false
  return (isSameDay(date, range.start) || isAfter(date, range.start)) &&
    (isSameDay(date, range.end) || isBefore(date, range.end))
}

export function buildMonthMatrix(month: Date, locale: DatePickerLocale) {
  const start = startOfWeek(startOfMonth(month), { locale: getLocale(locale) })
  const end = endOfWeek(endOfMonth(month), { locale: getLocale(locale) })
  const days: Date[] = []
  let d = start
  while (d <= end) {
    days.push(d)
    d = addDays(d, 1)
  }
  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  return weeks
}

export function getWeekdayLabels(locale: DatePickerLocale) {
  const start = startOfWeek(new Date(), { locale: getLocale(locale) })
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), "EEEEE", { locale: getLocale(locale) }))
}

export function getMonthLabels(locale: DatePickerLocale) {
  return Array.from({ length: 12 }, (_, i) => format(new Date(2020, i, 1), "MMM", { locale: getLocale(locale) }))
}

export function getYearGrid(startYear: number) {
  return Array.from({ length: 12 }, (_, i) => startYear + i)
}

