export const REPORT_TIMEZONE = "Europe/Bucharest"
export const MAX_ACTIVITY_RANGE_DAYS = 31

export interface ParsedReportRange {
  from: Date
  toExclusive: Date
  fromDate: string
  toDate: string
}

function parseDateOnly(value: string, field: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`${field} trebuie să aibă formatul YYYY-MM-DD.`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error(`${field} nu este o dată validă.`)
  }
  return { year, month, day }
}

function offsetAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const values: Record<string, number> = {}
  for (const part of parts) {
    if (part.type !== "literal") values[part.type] = Number(part.value)
  }
  const representedAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  )
  return representedAsUtc - date.getTime()
}

function bucharestMidnightUtc(year: number, month: number, day: number) {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0)
  let result = guess - offsetAt(new Date(guess), REPORT_TIMEZONE)
  result = guess - offsetAt(new Date(result), REPORT_TIMEZONE)
  return new Date(result)
}

function addCalendarDays(date: { year: number; month: number; day: number }, days: number) {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days))
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }
}

export function parseActivityDateRange(fromValue: string, toValue: string): ParsedReportRange {
  const fromParts = parseDateOnly(fromValue, "Data de început")
  const toParts = parseDateOnly(toValue, "Data de sfârșit")
  const fromDayNumber = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day)
  const toDayNumber = Date.UTC(toParts.year, toParts.month - 1, toParts.day)
  if (toDayNumber < fromDayNumber) throw new Error("Data de sfârșit trebuie să fie după data de început.")

  const inclusiveDays = Math.floor((toDayNumber - fromDayNumber) / 86_400_000) + 1
  if (inclusiveDays > MAX_ACTIVITY_RANGE_DAYS) {
    throw new Error(`Intervalul poate avea maximum ${MAX_ACTIVITY_RANGE_DAYS} de zile.`)
  }

  const dayAfterTo = addCalendarDays(toParts, 1)
  return {
    from: bucharestMidnightUtc(fromParts.year, fromParts.month, fromParts.day),
    toExclusive: bucharestMidnightUtc(dayAfterTo.year, dayAfterTo.month, dayAfterTo.day),
    fromDate: fromValue,
    toDate: toValue,
  }
}

export function formatBucharestDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("ro-RO", {
    timeZone: REPORT_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

/** Filename-safe stamp: YYYY-MM-DD_HH-mm-ss in Europe/Bucharest. */
export function formatBucharestFileStamp(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "invalid-date"
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "00"
  return `${get("year")}-${get("month")}-${get("day")}_${get("hour")}-${get("minute")}-${get("second")}`
}
