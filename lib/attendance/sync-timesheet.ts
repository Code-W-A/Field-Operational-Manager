import { collection, query, where, getDocs, doc, getDoc, writeBatch, Timestamp } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type { AttendanceSession } from "@/types/attendance"
import type { TimesheetEntry } from "@/lib/hr/types"

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

    // For each user, create/update timesheet entries
    const batch = writeBatch(db)
    const dateKey = formatDateKey(date)

    for (const [userId, sessions] of Object.entries(sessionsByUser)) {
      // Get employee ID from user
      const employeeId = await getEmployeeIdForUser(userId)
      if (!employeeId) {
        console.warn(`No employee found for user ${userId}`)
        continue
      }

      // Calculate total work hours for the day
      const totalMinutes = sessions.reduce((sum, session) => {
        if (!session.sessionEnd) return sum
        const duration = (session.sessionEnd - session.sessionStart) / (1000 * 60)
        return sum + duration
      }, 0)

      // Calculate total extra time
      const totalExtraMinutes = sessions.reduce((sum, session) => {
        if (!session.extraTimeLogs) return sum
        return sum + session.extraTimeLogs.reduce((logSum, log) => logSum + log.minutesEligible, 0)
      }, 0)

      // Calculate work hours (total - extra)
      const workMinutes = totalMinutes - totalExtraMinutes
      const workHours = (workMinutes / 60).toFixed(2)

      // Calculate extra hours
      const extraHours = (totalExtraMinutes / 60).toFixed(2)

      // Create timesheet entry
      const timesheetEntry: Partial<TimesheetEntry> = {
        start: formatTime(sessions[0].sessionStart),
        end: sessions[sessions.length - 1].sessionEnd
          ? formatTime(sessions[sessions.length - 1].sessionEnd!)
          : undefined,
        type: "P", // Present
        hours: workHours,
        notes: `Auto-sync from attendance. Work: ${workHours}h${totalExtraMinutes > 0 ? `, Extra: ${extraHours}h` : ""}`,
        syncedFromAttendance: true,
        attendanceSessionIds: sessions.map((s) => s.id),
      }

      // Update timesheet in Firestore
      const timesheetRef = doc(db, "hrTimesheets", `${employeeId}_${dateKey}`)
      batch.set(
        timesheetRef,
        {
          employeeId,
          date: dateKey,
          entries: {
            [dateKey]: timesheetEntry,
          },
          syncedAt: Timestamp.now(),
          syncedBy: "attendance-system",
        },
        { merge: true }
      )

      console.log(
        `Synced ${sessions.length} session(s) for employee ${employeeId}: ${workHours}h work + ${extraHours}h extra`
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
async function getEmployeeIdForUser(userId: string): Promise<string | null> {
  try {
    // First, try to find employee by userUid
    const employeesQuery = query(collection(db, "hrEmployees"), where("userUid", "==", userId))
    const employeesSnapshot = await getDocs(employeesQuery)

    if (!employeesSnapshot.empty) {
      return employeesSnapshot.docs[0].id
    }

    // If not found, get user data and try to match by name
    const userDoc = await getDoc(doc(db, "users", userId))
    if (!userDoc.exists()) {
      return null
    }

    const userData = userDoc.data()
    const displayName = userData.displayName || ""

    if (!displayName) {
      return null
    }

    // Try to find employee by matching full name
    const allEmployeesSnapshot = await getDocs(collection(db, "hrEmployees"))
    for (const empDoc of allEmployeesSnapshot.docs) {
      const empData = empDoc.data()
      const fullName = `${empData.prenume || ""} ${empData.nume || ""}`.trim()
      if (fullName === displayName) {
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
 * Format date as YYYY-MM-DD for timesheet keys
 */
function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
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
  const dateKey = formatDateKey(date)

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

  // Check if timesheets exist for this date
  const timesheetsQuery = query(
    collection(db, "hrTimesheets"),
    where("date", "==", dateKey),
    where("syncedFromAttendance", "==", true)
  )

  const timesheetsSnapshot = await getDocs(timesheetsQuery)

  return {
    synced: !timesheetsSnapshot.empty,
    sessionCount: sessionsSnapshot.size,
    lastSyncAt: timesheetsSnapshot.empty
      ? undefined
      : timesheetsSnapshot.docs[0].data().syncedAt?.toMillis?.(),
  }
}
