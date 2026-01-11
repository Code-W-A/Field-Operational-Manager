import type { AttendanceSession, ExtraTimeType } from "@/types/attendance"

/**
 * Check if "Traseu către client" is eligible
 * - Only after check-in from field mode
 * - Available until 08:00
 */
export function isClientRouteEligible(session: AttendanceSession | null): boolean {
  if (!session || session.status !== "active") return false
  if (session.mode !== "field") return false

  // Check if already tracking
  const hasActiveClientLog = session.extraTimeLogs?.some(
    (log) => log.type === "to_client" && !log.endTime
  )
  if (hasActiveClientLog) return false

  // Check current time - must be before 08:00
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const currentTimeInMinutes = currentHour * 60 + currentMinute

  // 08:00 = 480 minutes
  return currentTimeInMinutes < 480
}

/**
 * Check if "Traseu către casă" is eligible
 * - Only after check-out from field mode
 * - Available after program end time (default 16:30)
 * - Must be within 1 hour of check-out
 */
export function isHomeRouteEligible(
  session: AttendanceSession | null,
  programEndHour: number = 16,
  programEndMinute: number = 30
): boolean {
  if (!session || session.status === "active") return false
  if (session.mode !== "field") return false
  if (!session.sessionEnd) return false

  // Check if already tracking
  const hasActiveHomeLog = session.extraTimeLogs?.some(
    (log) => log.type === "to_home" && !log.endTime
  )
  if (hasActiveHomeLog) return false

  const sessionEndDate = new Date(session.sessionEnd)
  const sessionEndHour = sessionEndDate.getHours()
  const sessionEndMinute = sessionEndDate.getMinutes()
  const sessionEndTimeInMinutes = sessionEndHour * 60 + sessionEndMinute

  const programEndTimeInMinutes = programEndHour * 60 + programEndMinute

  // Must check out after program end time
  if (sessionEndTimeInMinutes < programEndTimeInMinutes) return false

  // Must be within 1 hour (60 minutes) of check-out
  const now = Date.now()
  const minutesSinceCheckout = (now - session.sessionEnd) / 60000

  return minutesSinceCheckout <= 60
}

/**
 * Calculate eligible extra minutes for client route
 * From button press until 08:00
 */
export function calculateClientRouteMinutes(startTime: number): number {
  const startDate = new Date(startTime)
  
  // Create target time of 08:00 on the same day
  const target = new Date(startDate)
  target.setHours(8, 0, 0, 0)

  // If start time is already past 08:00, return 0
  if (startDate >= target) return 0

  const minutesUntil8AM = Math.floor((target.getTime() - startTime) / 60000)
  return Math.max(0, minutesUntil8AM)
}

/**
 * Calculate eligible extra minutes for home route
 * Maximum 60 minutes (1 hour)
 */
export function calculateHomeRouteMinutes(startTime: number, endTime: number): number {
  const elapsed = Math.floor((endTime - startTime) / 60000)
  return Math.min(60, elapsed) // Cap at 60 minutes
}

/**
 * Calculate total extra minutes from a session
 */
export function calculateTotalExtraMinutes(session: AttendanceSession): number {
  if (!session.extraTimeLogs || session.extraTimeLogs.length === 0) return 0

  return session.extraTimeLogs.reduce((total, log) => {
    return total + (log.minutesEligible || 0)
  }, 0)
}

/**
 * Get active extra time log of a specific type
 */
export function getActiveExtraTimeLog(
  session: AttendanceSession | null,
  type: ExtraTimeType
) {
  if (!session || !session.extraTimeLogs) return null

  return session.extraTimeLogs.find(
    (log) => log.type === type && !log.endTime
  ) || null
}

/**
 * Format minutes to HH:mm
 */
export function formatMinutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
}

/**
 * Get time remaining until 08:00
 */
export function getTimeUntil8AM(): number {
  const now = new Date()
  const target = new Date(now)
  target.setHours(8, 0, 0, 0)

  // If already past 08:00, return 0
  if (now >= target) return 0

  return Math.floor((target.getTime() - now.getTime()) / 60000)
}

/**
 * Get time remaining in 1-hour window after checkout
 */
export function getTimeRemainingInHomeWindow(checkoutTime: number): number {
  const now = Date.now()
  const elapsed = (now - checkoutTime) / 60000
  const remaining = 60 - elapsed

  return Math.max(0, Math.floor(remaining))
}
