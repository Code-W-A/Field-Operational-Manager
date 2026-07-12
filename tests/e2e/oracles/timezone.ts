export const ORACLE_TIME_ZONE = "Europe/Bucharest" as const

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: ORACLE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
})

export function bucharestParts(timestampMs: number) {
  if (!Number.isFinite(timestampMs)) throw new Error("Invalid oracle timestamp")
  const parts = formatter.formatToParts(new Date(timestampMs))
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute") }
}

export function bucharestHHmm(timestampMs: number) {
  const parts = bucharestParts(timestampMs)
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
}

export function bucharestMonthAndDay(timestampMs: number) {
  const parts = bucharestParts(timestampMs)
  return { monthKey: `${parts.year}-${String(parts.month).padStart(2, "0")}`, day: String(parts.day) }
}

export function absoluteDurationMinutes(startMs: number, endMs: number) {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0
  return (endMs - startMs) / 60_000
}

export function daysInOracleMonth(monthKey: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) return 31
  return new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate()
}
