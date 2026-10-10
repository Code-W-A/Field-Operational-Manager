import { attendanceDay, attendanceSpecialDay } from "@/packages/fom-domain/attendance-policy"
export type AttendanceSpecialDayInfo = NonNullable<ReturnType<typeof attendanceSpecialDay>>
export function formatLocalDateKey(date: Date): string { return attendanceDay(date.getTime()) }
export function resolveAttendanceSpecialDay(date: Date, holidays: { date: string; label?: string }[] = []): AttendanceSpecialDayInfo | null { return attendanceSpecialDay(date.getTime(), holidays) }
