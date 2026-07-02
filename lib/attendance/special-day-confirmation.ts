import type { HrHoliday } from "@/lib/hr/types"
import type { AttendanceSpecialDayKind } from "@/types/attendance"

export type AttendanceSpecialDayInfo = {
  kind: AttendanceSpecialDayKind
  label: string
  date: string
}

export function formatLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function resolveAttendanceSpecialDay(date: Date, holidays: HrHoliday[] = []): AttendanceSpecialDayInfo | null {
  const dateKey = formatLocalDateKey(date)
  const holiday = holidays.find((item) => item.date === dateKey)
  if (holiday) {
    return {
      kind: "legal_holiday",
      label: holiday.label?.trim() || "Sărbătoare legală",
      date: dateKey,
    }
  }

  const day = date.getDay()
  if (day === 6) {
    return { kind: "saturday", label: "Sâmbătă", date: dateKey }
  }
  if (day === 0) {
    return { kind: "sunday", label: "Duminică", date: dateKey }
  }

  return null
}
