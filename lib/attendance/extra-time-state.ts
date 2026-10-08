import type { ExtraTimeLog } from "@/types/attendance";
import { timeOnSameDayMs } from "./auto-pontaj-schedule";
import { calculateHomeRouteMinutes } from "./extra-time";
const DEFAULT_PROGRAM_START = "08:00", DEFAULT_PROGRAM_END = "16:30";
export function finalizeOpenExtraTimeLogs(params: {
  session: any
  now: number
  programLucruStart?: string
  programLucruEnd?: string
}): ExtraTimeLog[] | undefined {
  const currentLogs: ExtraTimeLog[] = params.session?.extraTimeLogs || []
  if (!currentLogs?.length) return undefined

  let changed = false
  const updated = currentLogs.map((log) => {
    if (log.endTime) return log
    changed = true
    if (log.type === "to_client") {
      const eightAm = timeOnSameDayMs(log.startTime, "08:00", { h: 8, m: 0 })
      const programStartTs = timeOnSameDayMs(log.startTime, params.programLucruStart ?? DEFAULT_PROGRAM_START, { h: 8, m: 0 })
      const clientCapEnd = Math.min(eightAm, programStartTs)
      const effectiveEnd = Math.min(params.now, clientCapEnd)
      const minutesEligible = Math.max(0, Math.floor((effectiveEnd - log.startTime) / 60000))
      return { ...log, endTime: effectiveEnd, minutesEligible }
    }
    if (log.type === "to_home") {
      const programEndTs = timeOnSameDayMs(log.startTime, params.programLucruEnd ?? DEFAULT_PROGRAM_END, { h: 16, m: 30 })
      const homeCapEnd = programEndTs + 60 * 60 * 1000
      const effectiveEnd = Math.min(params.now, log.startTime + 60 * 60 * 1000, homeCapEnd)
      const minutesEligible = Math.max(0, calculateHomeRouteMinutes(log.startTime, effectiveEnd))
      return { ...log, endTime: effectiveEnd, minutesEligible }
    }
    return log
  })

  return changed ? updated : currentLogs
}

