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
import type { TimesheetCell, TimesheetMonthKey, TimesheetCode } from "@/lib/hr/types"
import { getCurrentMonthKey, timesheetDocId } from "@/lib/hr/storage"

const DEBUG_PONTAJ = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"

function debugPontajLog(label: string, payload: Record<string, any>) {
  if (!DEBUG_PONTAJ) return
  try {
    console.log(`[CONDICA] ${label}`, payload)
  } catch {
    // ignore
  }
}

function parseHM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function normalizeNonOverlappingEntries(entries: NonNullable<TimesheetCell["entries"]>) {
  const withRanges = entries
    .map((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || s >= en) return null
      return { entry: e, start: s, end: en }
    })
    .filter(Boolean) as Array<{ entry: TimesheetCell["entries"][number]; start: number; end: number }>
  if (withRanges.length <= 1) return withRanges.map((r) => r.entry)
  withRanges.sort((a, b) => (a.start - b.start) || (a.end - b.end))
  const result: typeof withRanges = []
  for (const item of withRanges) {
    const last = result[result.length - 1]
    if (!last || item.start >= last.end) {
      result.push(item)
      continue
    }
    debugPontajLog("overlap:skip", {
      reason: "computed_overlap",
      kept: { start: last.entry.start, end: last.entry.end },
      skipped: { start: item.entry.start, end: item.entry.end },
    })
  }
  return result.map((r) => r.entry)
}

function filterOverlappingEntries(
  existing: NonNullable<TimesheetCell["entries"]>,
  incoming: NonNullable<TimesheetCell["entries"]>
) {
  const existingRanges = existing
    .map((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null || s >= en) return null
      return { start: s, end: en }
    })
    .filter(Boolean) as Array<{ start: number; end: number }>
  if (!existingRanges.length) return incoming
  return incoming.filter((e) => {
    const s = parseHM(e.start)
    const en = parseHM(e.end)
    if (s == null || en == null || s >= en) return false
    const overlaps = existingRanges.some((ex) => s < ex.end && ex.start < en)
    if (overlaps) {
      debugPontajLog("overlap:skip", {
        reason: "existing_overlap",
        skipped: { start: e.start, end: e.end },
      })
    }
    return !overlaps
  })
}

function calcHoursFromEntries(entries: NonNullable<TimesheetCell["entries"]>) {
  const minutes = entries.reduce((sum, e) => {
    const s = parseHM(e.start)
    const en = parseHM(e.end)
    if (s == null || en == null || s >= en) return sum
    return sum + (en - s)
  }, 0)
  return Math.round((minutes / 60) * 100) / 100
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
      const session = {
        id: docSnap.id,
        ...docSnap.data(),
        sessionStart: docSnap.data().sessionStart?.toMillis?.() || Date.now(),
        sessionEnd: docSnap.data().sessionEnd?.toMillis?.(),
        createdAt: docSnap.data().createdAt?.toMillis?.() || Date.now(),
        updatedAt: docSnap.data().updatedAt?.toMillis?.() || Date.now(),
      } as AttendanceSession

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

      const totalMinutes = sorted.reduce((sum, session) => {
        if (!session.sessionEnd) return sum
        return sum + (session.sessionEnd - session.sessionStart) / 60000
      }, 0)

      const totalExtraMinutes = sorted.reduce((sum, session) => {
        const logs = session.extraTimeLogs || []
        return sum + logs.reduce((s, l) => s + (l.minutesEligible || 0), 0)
      }, 0)

      const entries: NonNullable<TimesheetCell["entries"]> = []

      for (const s of sorted) {
        if (!s.sessionEnd) continue
        entries.push({
          start: formatTime(s.sessionStart),
          end: formatTime(s.sessionEnd),
          methodStart: `Play (${s.mode})`,
          methodEnd: `Stop (${s.checkOutMode || s.mode})`,
          project: "Pontaj",
        })

        for (const log of s.extraTimeLogs || []) {
          if (!log.endTime) continue
          entries.push({
            start: formatTime(log.startTime),
            end: formatTime(log.endTime),
            methodStart: "Extra",
            methodEnd: "Extra",
            project: log.type === "to_client" ? "Traseu către client" : "Traseu către casă",
          })
        }
      }

      const normalizedEntries = normalizeNonOverlappingEntries(entries)
      const totalHours = calcHoursFromEntries(normalizedEntries)

      const cell: TimesheetCell = {
        code: "WORK",
        hours: totalHours,
        entries: normalizedEntries,
      }

      const timesheetRef = doc(db, "hrTimesheets", timesheetDocId(employeeId, monthKey as TimesheetMonthKey))
      batch.set(
        timesheetRef,
        {
          employeeId,
          monthKey,
          updatedAt: serverTimestamp(),
          days: { [dayKey]: cell },
        },
        { merge: true }
      )

      console.log(
        `Synced ${sessions.length} session(s) for employee ${employeeId}: ${totalHours}h total (${totalExtraMinutes}m extra)`
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
 * Format timestamp as HH:mm
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
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

function isNonWorkHrCode(code: TimesheetCode | undefined) {
  if (!code) return false
  return code === "CO" || code === "DEL" || code === "SL" || code === "WE" || code === "IN"
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

/**
 * Sync (recompute) a single user's attendance for a specific day into HR timesheet.
 * - Pulls all completed attendance sessions for that user for that day
 * - Builds a WORK cell (hours + entries)
 * - Non-destructive: will NOT overwrite CO/DEL/SL/WE/IN days
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

  const sessionsQuery = query(
    collection(db, "attendance"),
    where("userId", "==", userId),
    where("sessionStart", ">=", Timestamp.fromDate(start)),
    where("sessionStart", "<=", Timestamp.fromDate(end)),
    where("status", "==", "completed")
  )

  const sessionsSnapshot = await getDocs(sessionsQuery)

  const sessions: AttendanceSession[] = sessionsSnapshot.docs
    .map((docSnap) => {
      const data = docSnap.data() as any
      const session: AttendanceSession = {
        id: docSnap.id,
        ...data,
        sessionStart: data.sessionStart?.toMillis?.() ?? data.sessionStart ?? Date.now(),
        sessionEnd: data.sessionEnd?.toMillis?.() ?? data.sessionEnd,
        createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
        updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
      } as AttendanceSession
      return session
    })
    .filter((s) => Boolean(s.sessionEnd))
    .sort((a, b) => a.sessionStart - b.sessionStart)

  if (!sessions.length) {
    debugPontajLog("sync-user-day:no-sessions", { userId, monthKey, day })
    return { synced: false, reason: "no_sessions", sessionCount: 0, monthKey, day }
  }

  const employeeId = await getEmployeeIdForUser(userId, {
    employeeId: (sessions?.[0] as any)?.employeeId,
    userName: sessions?.[0]?.userName,
  })
  if (!employeeId) {
    debugPontajLog("sync-user-day:no-employee", { userId, monthKey, day })
    return { synced: false, reason: "no_employee", sessionCount: sessions.length, monthKey, day }
  }

  const dayKey = String(day)
  const timesheetRef = doc(db, "hrTimesheets", timesheetDocId(employeeId, monthKey as TimesheetMonthKey))

  // Non-destructive guard: don't overwrite protected day types.
  const existingSnap = await getDoc(timesheetRef)
  const existingDay = existingSnap.exists() ? ((existingSnap.data() as any)?.days?.[dayKey] as TimesheetCell | undefined) : undefined
  const existingCode = existingDay?.code as TimesheetCode | undefined
  if (isNonWorkHrCode(existingCode)) {
    debugPontajLog("sync-user-day:protected", { userId, employeeId, monthKey, day, existingCode })
    return { synced: false, reason: "protected_day", sessionCount: sessions.length, employeeId, monthKey, day }
  }

  const totalMinutes = sessions.reduce((sum, s) => {
    if (!s.sessionEnd) return sum
    return sum + (s.sessionEnd - s.sessionStart) / 60000
  }, 0)
  const computedEntries: NonNullable<TimesheetCell["entries"]> = []
  for (const s of sessions) {
    if (!s.sessionEnd) continue
    computedEntries.push({
      start: formatTime(s.sessionStart),
      end: formatTime(s.sessionEnd),
      methodStart: `Play (${s.mode})`,
      methodEnd: `Stop (${s.checkOutMode || s.mode})`,
      project: "Pontaj",
    })

    for (const log of s.extraTimeLogs || []) {
      if (!log.endTime) continue
      computedEntries.push({
        start: formatTime(log.startTime),
        end: formatTime(log.endTime),
        methodStart: "Extra",
        methodEnd: "Extra",
        project: log.type === "to_client" ? "Traseu către client" : "Traseu către casă",
      })
    }
  }

  const pontajProjects = new Set<string>(["Pontaj", "Traseu către client", "Traseu către casă"])
  const preservedEntries = (existingDay?.entries ?? []).filter((e) => !pontajProjects.has(String(e.project ?? "")))
  const normalizedComputed = normalizeNonOverlappingEntries(computedEntries)
  const safeComputed = filterOverlappingEntries(preservedEntries, normalizedComputed)
  const totalHours = calcHoursFromEntries(safeComputed)

  const cell: TimesheetCell = {
    code: "WORK",
    hours: totalHours,
    entries: [...preservedEntries, ...safeComputed],
    ...(existingDay?.breaks ? { breaks: existingDay.breaks } : {}),
  }

  const batch = writeBatch(db)
  batch.set(
    timesheetRef,
    {
      employeeId,
      monthKey,
      updatedAt: serverTimestamp(),
      days: { [dayKey]: cell },
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
    totalHours,
  })

  return {
    synced: true,
    reason: "synced",
    employeeId,
    sessionCount: sessions.length,
    totalHours,
    monthKey,
    day,
  }
}
