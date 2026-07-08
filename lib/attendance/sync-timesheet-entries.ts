import { formatAttendanceTimeHHmm } from "@/lib/attendance/attendance-timezone"
import type { TimesheetCell } from "@/lib/hr/types"
import type { AttendanceSession } from "@/types/attendance"

export function buildAttendanceEntriesFromSessions(sessions: AttendanceSession[]): NonNullable<TimesheetCell["entries"]> {
  const entries: NonNullable<TimesheetCell["entries"]> = []
  for (const session of sessions) {
    if (!session.sessionEnd) continue
    entries.push({
      start: formatAttendanceTimeHHmm(session.sessionStart),
      end: formatAttendanceTimeHHmm(session.sessionEnd),
      methodStart: `Play (${session.mode})`,
      methodEnd: `Stop (${session.checkOutMode || session.mode})`,
      project: "Pontaj",
      attendanceSessionId: session.id,
      selfieStartUrl: (session as any).checkInSelfieUrl,
      selfieEndUrl: (session as any).checkOutSelfieUrl,
      lateStartMinutes: Number((session as any).lateStartMinutes ?? 0) || undefined,
    })

    for (const log of session.extraTimeLogs || []) {
      if (!log.endTime) continue
      entries.push({
        start: formatAttendanceTimeHHmm(log.startTime),
        end: formatAttendanceTimeHHmm(log.endTime),
        methodStart: "Extra",
        methodEnd: "Extra",
        project: log.type === "to_client" ? "Traseu către client" : "Traseu către casă",
      })
    }
  }
  return entries
}
