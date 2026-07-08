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

export function getAttendanceLocalDateParts(timestampMs: number) {
  assertValidTimestamp(timestampMs)
  const parts = attendanceDateTimePartsFormatter.formatToParts(new Date(timestampMs))
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ""

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  }
}
