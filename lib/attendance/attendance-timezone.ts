export const ATTENDANCE_TIME_ZONE = "Europe/Bucharest"

const attendanceTimeFormatter = new Intl.DateTimeFormat("ro-RO", {
  timeZone: ATTENDANCE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
})

const attendanceDateTimePartsFormatter = new Intl.DateTimeFormat("ro-RO", {
  timeZone: ATTENDANCE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  hourCycle: "h23",
})

function assertValidTimestamp(timestampMs: number) {
  if (!Number.isFinite(timestampMs)) {
    throw new Error("Invalid attendance timestamp")
  }
}

export function formatAttendanceTimeHHmm(timestampMs: number): string {
  assertValidTimestamp(timestampMs)
  const parts = attendanceTimeFormatter.formatToParts(new Date(timestampMs))
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00"
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00"
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
}

function getAttendanceLocalDateTimeParts(timestampMs: number) {
  assertValidTimestamp(timestampMs)
  const parts = attendanceDateTimePartsFormatter.formatToParts(new Date(timestampMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  }
}

export function getAttendanceLocalDateParts(timestampMs: number) {
  const { year, month, day, hour, minute } = getAttendanceLocalDateTimeParts(timestampMs)
  return { year, month, day, hour, minute }
}

export function attendanceZonedDateTimeToUtcMs(params: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
  millisecond?: number
}): number {
  const second = params.second ?? 0
  const millisecond = params.millisecond ?? 0
  const wantedUtc = Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute, second, 0)
  let guess = wantedUtc
  for (let index = 0; index < 4; index += 1) {
    const represented = getAttendanceLocalDateTimeParts(guess)
    const representedUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
      0,
    )
    guess += wantedUtc - representedUtc
  }
  return guess + millisecond
}

export function getAttendanceLocalDayBounds(referenceMs: number): { startMs: number; endMs: number } {
  const parts = getAttendanceLocalDateTimeParts(referenceMs)
  return {
    startMs: attendanceZonedDateTimeToUtcMs({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 }),
    endMs: attendanceZonedDateTimeToUtcMs({ ...parts, hour: 23, minute: 59, second: 59, millisecond: 999 }),
  }
}

export function attendanceTimeOnLocalDay(referenceMs: number, hour: number, minute: number): number {
  const parts = getAttendanceLocalDateTimeParts(referenceMs)
  return attendanceZonedDateTimeToUtcMs({ ...parts, hour, minute, second: 0, millisecond: 0 })
}
