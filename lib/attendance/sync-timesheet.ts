import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { AttendanceSession } from "@/types/attendance"
import type { TimesheetCell, TimesheetMonthKey } from "@/lib/hr/types"
import { getCurrentMonthKey, timesheetDocId } from "@/lib/hr/storage"
import { type HMRange, isValidHMRange } from "@/lib/hr/time-calc"
import { logPontajCondicaSync } from "@/lib/attendance/pontaj-audit-log"
import { buildAttendanceTimesheetCell } from "@/lib/attendance/sync-timesheet-merge"
import { buildAttendanceEntriesFromSessions } from "@/lib/attendance/sync-timesheet-entries"

const DEBUG_PONTAJ = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"

function debugPontajLog(label: string, payload: Record<string, any>) {
  if (!DEBUG_PONTAJ) return
  try {
    console.log(`[CONDICA] ${label}`, payload)
  } catch {
    // ignore
  }
}

function timestampToMillis(value: any): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  const ms = value?.toMillis?.()
  return typeof ms === "number" && Number.isFinite(ms) ? ms : undefined
}

function normalizeAttendanceSessionDoc(id: string, data: any): AttendanceSession {
  return {
    id,
    ...data,
    sessionStart: timestampToMillis(data?.sessionStart) ?? Date.now(),
    sessionEnd: timestampToMillis(data?.sessionEnd),
    createdAt: timestampToMillis(data?.createdAt) ?? Date.now(),
    updatedAt: timestampToMillis(data?.updatedAt) ?? Date.now(),
    extraTimeLogs: Array.isArray(data?.extraTimeLogs)
      ? data.extraTimeLogs.map((log: any) => ({
          ...log,
          startTime: timestampToMillis(log?.startTime) ?? log?.startTime,
          endTime: timestampToMillis(log?.endTime) ?? log?.endTime,
        }))
      : data?.extraTimeLogs,
  } as AttendanceSession
}

let cachedHrDefaults: { pauzaStart?: string; pauzaEnd?: string } | null | undefined = undefined
async function getHrDefaultsBreak(): Promise<{ pauzaStart?: string; pauzaEnd?: string } | null> {
  if (cachedHrDefaults !== undefined) return cachedHrDefaults
  try {
    const ref = doc(db, "hrSettings", "defaults")
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      cachedHrDefaults = null
      return null
    }
    const data = snap.data() as any
    cachedHrDefaults = {
      pauzaStart: data?.pauzaStart ? String(data.pauzaStart) : undefined,
      pauzaEnd: data?.pauzaEnd ? String(data.pauzaEnd) : undefined,
    }
    return cachedHrDefaults
  } catch {
    cachedHrDefaults = null
    return null
  }
}

const employeeBreakCache = new Map<string, HMRange | null>()
async function getEmployeeDefaultBreak(employeeId: string): Promise<HMRange | null> {
  if (employeeBreakCache.has(employeeId)) return employeeBreakCache.get(employeeId) ?? null
  const defaults = await getHrDefaultsBreak()
  try {
    const snap = await getDoc(doc(db, "hrEmployees", employeeId))
    const data = snap.exists() ? (snap.data() as any) : null
    const start = String(data?.pauzaStart || defaults?.pauzaStart || "").trim()
    const end = String(data?.pauzaEnd || defaults?.pauzaEnd || "").trim()
    const r = { start, end }
    const res = isValidHMRange(r) ? r : null
    employeeBreakCache.set(employeeId, res)
    return res
  } catch {
    const start = String(defaults?.pauzaStart || "").trim()
    const end = String(defaults?.pauzaEnd || "").trim()
    const r = { start, end }
    const res = isValidHMRange(r) ? r : null
    employeeBreakCache.set(employeeId, res)
    return res
  }
}

function getAttendanceBreakSnapshot(sessions: AttendanceSession[]): HMRange | null {
  for (const session of sessions) {
    const range = {
      start: String((session as any)?.pauzaStart || "").trim(),
      end: String((session as any)?.pauzaEnd || "").trim(),
    }
    if (isValidHMRange(range)) return range
  }
  return null
}

async function getSyncBreak(employeeId: string, sessions: AttendanceSession[]): Promise<HMRange | null> {
  return getAttendanceBreakSnapshot(sessions) ?? getEmployeeDefaultBreak(employeeId)
}

/**
 * Sync attendance sessions to HR timesheet system
 * This should be run daily (e.g., at end of day or start of next day)
 */
export async function syncAttendanceToTimesheet(date: Date): Promise<void> {
  try {
    console.log(`Syncing attendance for date: ${date.toISOString()}`)

    // Get start and end of the day
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    // Get all completed attendance sessions for this day
    const sessionsQuery = query(
      collection(db, "attendance"),
      where("sessionStart", ">=", Timestamp.fromDate(startOfDay)),
      where("sessionStart", "<=", Timestamp.fromDate(endOfDay)),
      where("status", "==", "completed")
    )

    const sessionsSnapshot = await getDocs(sessionsQuery)

    if (sessionsSnapshot.empty) {
      console.log("No completed sessions found for this date")
      return
    }

    // Group sessions by userId
    const sessionsByUser: Record<string, AttendanceSession[]> = {}

    sessionsSnapshot.docs.forEach((docSnap) => {
      const session = normalizeAttendanceSessionDoc(docSnap.id, docSnap.data())

      if (!sessionsByUser[session.userId]) {
        sessionsByUser[session.userId] = []
      }
      sessionsByUser[session.userId].push(session)
    })

    // For each user, create/update timesheet cells in hrTimesheets/{employeeId}_{monthKey}
    const batch = writeBatch(db)
    const monthKey = getCurrentMonthKey(date)
    const day = date.getDate()
    const dayKey = String(day)

    for (const [userId, sessions] of Object.entries(sessionsByUser)) {
      // Get employee ID from user
      const employeeId = await getEmployeeIdForUser(userId, {
        employeeId: (sessions?.[0] as any)?.employeeId,
        userName: sessions?.[0]?.userName,
      })
      if (!employeeId) {
        console.warn(`No employee found for user ${userId}`)
        continue
      }

      const sorted = [...sessions].sort((a, b) => a.sessionStart - b.sessionStart)

      const totalExtraMinutes = sorted.reduce((sum, session) => {
        const logs = session.extraTimeLogs || []
        return sum + logs.reduce((s, l) => s + (l.minutesEligible || 0), 0)
      }, 0)

      const computedEntries = buildAttendanceEntriesFromSessions(sorted)
      const defaultBreak = await getSyncBreak(employeeId, sorted)

      const timesheetRef = doc(db, "hrTimesheets", timesheetDocId(employeeId, monthKey as TimesheetMonthKey))
      let existingDay: TimesheetCell | undefined = undefined
      try {
        const existingSnap = await getDoc(timesheetRef)
        existingDay = existingSnap.exists() ? ((existingSnap.data() as any)?.days?.[dayKey] as TimesheetCell | undefined) : undefined
      } catch {
        // ignore
      }

      const merged = buildAttendanceTimesheetCell({
        existingDay,
        computedEntries,
        defaultBreak,
      })
      if (!merged.cell) {
        console.log(`Skipped protected HR day for employee ${employeeId}: ${merged.protectedCode}`)
        continue
      }

      batch.set(
        timesheetRef,
        {
          employeeId,
          monthKey,
          updatedAt: serverTimestamp(),
          days: { [dayKey]: merged.cell },
        },
        { merge: true }
      )

      console.log(
        `Synced ${sessions.length} session(s) for employee ${employeeId}: ${merged.cell.hours ?? 0}h total (${totalExtraMinutes}m extra)`
      )
    }

    await batch.commit()
    console.log(`Successfully synced attendance to timesheet for ${Object.keys(sessionsByUser).length} user(s)`)
  } catch (error) {
    console.error("Failed to sync attendance to timesheet:", error)
    throw error
  }
}

/**
 * Get employee ID from user ID
 */
function normalizeName(input: string): string {
  return String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

async function getEmployeeIdForUser(
  userId: string,
  opts?: { userName?: string; employeeId?: string }
): Promise<string | null> {
  try {
    // Best signal: employeeId already captured in attendance session at check-in.
    if (opts?.employeeId) return String(opts.employeeId)

    // First, try to find employee by userUid
    const employeesQuery = query(collection(db, "hrEmployees"), where("userUid", "==", userId))
    const employeesSnapshot = await getDocs(employeesQuery)

    if (!employeesSnapshot.empty) {
      return employeesSnapshot.docs[0].id
    }

    // Fallback: try to match by name (best-effort).
    // Prefer the name recorded in attendance sessions (userName) because it doesn't depend on users/{uid}.
    let displayName = String(opts?.userName || "").trim()
    if (!displayName) {
      const userDoc = await getDoc(doc(db, "users", userId))
      if (userDoc.exists()) {
        const userData = userDoc.data() as any
        displayName = String(userData?.displayName || "").trim()
      }
    }
    if (!displayName) return null

    const target = normalizeName(displayName)
    if (!target) return null

    // Try to find employee by matching full name (diacritics/case/spacing-insensitive).
    const allEmployeesSnapshot = await getDocs(collection(db, "hrEmployees"))
    for (const empDoc of allEmployeesSnapshot.docs) {
      const empData = empDoc.data()
      const fullName = `${empData.prenume || ""} ${empData.nume || ""}`.trim()
      const fullNameRev = `${empData.nume || ""} ${empData.prenume || ""}`.trim()
      const legacy = String(empData.fullName || "").trim()
      const candidates = [fullName, fullNameRev, legacy].filter(Boolean)
      if (candidates.some((c) => normalizeName(c) === target)) {
        return empDoc.id
      }
    }

    return null
  } catch (error) {
    console.error("Failed to get employee ID for user:", error)
    return null
  }
}

/**
 * Manually trigger sync for a specific date range
 * Useful for backfilling or fixing issues
 */
export async function syncAttendanceRangeToTimesheet(startDate: Date, endDate: Date): Promise<void> {
  const currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    await syncAttendanceToTimesheet(new Date(currentDate))
    currentDate.setDate(currentDate.getDate() + 1)
  }
}

/**
 * Get sync status for a date
 */
export async function getAttendanceSyncStatus(date: Date): Promise<{
  synced: boolean
  sessionCount: number
  lastSyncAt?: number
}> {
  const monthKey = getCurrentMonthKey(date)
  const dayKey = String(date.getDate())

  // Get all sessions for this date
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const sessionsQuery = query(
    collection(db, "attendance"),
    where("sessionStart", ">=", Timestamp.fromDate(startOfDay)),
    where("sessionStart", "<=", Timestamp.fromDate(endOfDay)),
    where("status", "==", "completed")
  )

  const sessionsSnapshot = await getDocs(sessionsQuery)

  // Check if any hrTimesheets doc for this month has this day populated.
  const timesheetsQuery = query(collection(db, "hrTimesheets"), where("monthKey", "==", monthKey))
  const timesheetsSnapshot = await getDocs(timesheetsQuery)

  let syncedCount = 0
  let lastSyncAt: number | undefined
  for (const d of timesheetsSnapshot.docs) {
    const data = d.data() as any
    const hasDay = Boolean(data?.days?.[dayKey])
    if (hasDay) syncedCount++
    const updatedAtMs = data?.updatedAt?.toMillis?.()
    if (updatedAtMs && (!lastSyncAt || updatedAtMs > lastSyncAt)) lastSyncAt = updatedAtMs
  }

  return {
    synced: syncedCount > 0,
    sessionCount: sessionsSnapshot.size,
    lastSyncAt,
  }
}

function startOfDayLocal(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function endOfDayLocal(d: Date) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export type UserDaySyncResult =
  | {
      synced: true
      reason: "synced"
      employeeId: string
      sessionCount: number
      totalHours: number
      monthKey: TimesheetMonthKey
      day: number
    }
  | {
      synced: false
      reason: "no_sessions" | "no_employee" | "protected_day"
      sessionCount: number
      employeeId?: string
      monthKey: TimesheetMonthKey
      day: number
    }

async function getCompletedUserSessionsForLocalDay(userId: string, startMs: number, endMs: number): Promise<AttendanceSession[]> {
  // Avoid a composite-index dependency during checkout. A stale condică is worse
  // than scanning this user's sessions and filtering the target day client-side.
  const snapshot = await getDocs(query(collection(db, "attendance"), where("userId", "==", userId)))
  return snapshot.docs
    .map((docSnap) => normalizeAttendanceSessionDoc(docSnap.id, docSnap.data()))
    .filter((session) => {
      return (
        session.status === "completed" &&
        typeof session.sessionStart === "number" &&
        session.sessionStart >= startMs &&
        session.sessionStart <= endMs &&
        typeof session.sessionEnd === "number"
      )
    })
    .sort((a, b) => a.sessionStart - b.sessionStart)
}

/**
 * Sync (recompute) a single user's attendance for a specific day into HR timesheet.
 * - Pulls all completed attendance sessions for that user for that day
 * - Builds a WORK cell (hours + entries)
 * - Non-destructive: will NOT overwrite CO/CFP/CM/IN days
 * - Avoid duplicates: preserves non-pontaj entries when overwriting a WORK day
 */
export async function syncAttendanceUserDayToTimesheet(userId: string, date: Date): Promise<UserDaySyncResult> {
  const day = new Date(date).getDate()
  const monthKey = getCurrentMonthKey(date)

  debugPontajLog("sync-user-day:start", {
    userId,
    monthKey,
    day,
  })

  // Use local day boundaries (matches HR UI expectations).
  const start = startOfDayLocal(date)
  const end = endOfDayLocal(date)

  const sessions = await getCompletedUserSessionsForLocalDay(userId, start.getTime(), end.getTime())

  if (!sessions.length) {
    debugPontajLog("sync-user-day:no-sessions", { userId, monthKey, day })
    const r = { synced: false as const, reason: "no_sessions" as const, sessionCount: 0, monthKey, day }
    logPontajCondicaSync(userId, r)
    return r
  }

  const employeeId = await getEmployeeIdForUser(userId, {
    employeeId: (sessions?.[0] as any)?.employeeId,
    userName: sessions?.[0]?.userName,
  })
  if (!employeeId) {
    debugPontajLog("sync-user-day:no-employee", { userId, monthKey, day })
    const r = {
      synced: false as const,
      reason: "no_employee" as const,
      sessionCount: sessions.length,
      monthKey,
      day,
    }
    logPontajCondicaSync(userId, r)
    return r
  }

  const dayKey = String(day)
  const timesheetRef = doc(db, "hrTimesheets", timesheetDocId(employeeId, monthKey as TimesheetMonthKey))

  const existingSnap = await getDoc(timesheetRef)
  const existingDay = existingSnap.exists() ? ((existingSnap.data() as any)?.days?.[dayKey] as TimesheetCell | undefined) : undefined

  const computedEntries = buildAttendanceEntriesFromSessions(sessions)
  const defaultBreak = await getSyncBreak(employeeId, sessions)
  const merged = buildAttendanceTimesheetCell({
    existingDay,
    computedEntries,
    defaultBreak,
  })
  if (!merged.cell) {
    debugPontajLog("sync-user-day:protected", { userId, employeeId, monthKey, day, existingCode: merged.protectedCode })
    const r = {
      synced: false as const,
      reason: "protected_day" as const,
      sessionCount: sessions.length,
      employeeId,
      monthKey,
      day,
    }
    logPontajCondicaSync(userId, r, { existingCode: String(merged.protectedCode) })
    return r
  }

  const batch = writeBatch(db)
  batch.set(
    timesheetRef,
    {
      employeeId,
      monthKey,
      updatedAt: serverTimestamp(),
      days: { [dayKey]: merged.cell },
    },
    { merge: true }
  )
  await batch.commit()

  debugPontajLog("sync-user-day:done", {
    userId,
    employeeId,
    monthKey,
    day,
    sessionCount: sessions.length,
    totalHours: merged.cell.hours ?? 0,
  })

  const ok = {
    synced: true as const,
    reason: "synced" as const,
    employeeId,
    sessionCount: sessions.length,
    totalHours: merged.cell.hours ?? 0,
    monthKey,
    day,
  }
  logPontajCondicaSync(userId, ok)
  return ok
}
