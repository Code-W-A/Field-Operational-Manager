"use client"

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import type {
  AttendanceSession,
  CheckInRequest,
  CheckOutRequest,
  ExtraTimeRequest,
  ExtraTimeLog,
  AttendanceMode,
} from "@/types/attendance"
import type { Employee } from "@/lib/hr/types"
import { calculateHomeRouteMinutes } from "@/lib/attendance/extra-time"

export type Unsubscribe = () => void

const DEFAULT_PROGRAM_START = "08:00"
const DEFAULT_PROGRAM_END = "16:30"

function parseHHmm(value: string | undefined, fallback: { h: number; m: number }) {
  if (!value) return fallback
  const [hStr, mStr] = String(value).trim().split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  return { h, m }
}

function timeOnSameDay(ts: number, hhmm: string | undefined, fallback: { h: number; m: number }) {
  const d = new Date(ts)
  const { h, m } = parseHHmm(hhmm, fallback)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

async function getEmployeeScheduleForUser(
  userId: string
): Promise<(Pick<Employee, "programLucruStart" | "programLucruEnd"> & { employeeId: string }) | null> {
  const q = query(collection(db, "hrEmployees"), where("userUid", "==", userId), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  const data = docSnap.data() as any
  return {
    employeeId: docSnap.id,
    programLucruStart: data.programLucruStart ? String(data.programLucruStart) : undefined,
    programLucruEnd: data.programLucruEnd ? String(data.programLucruEnd) : undefined,
  }
}

function finalizeOpenExtraTimeLogs(params: {
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
      const eightAm = timeOnSameDay(log.startTime, "08:00", { h: 8, m: 0 })
      const programStartTs = timeOnSameDay(log.startTime, params.programLucruStart ?? DEFAULT_PROGRAM_START, { h: 8, m: 0 })
      const clientCapEnd = Math.min(eightAm, programStartTs)
      const effectiveEnd = Math.min(params.now, clientCapEnd)
      const minutesEligible = Math.max(0, Math.floor((effectiveEnd - log.startTime) / 60000))
      return { ...log, endTime: effectiveEnd, minutesEligible }
    }
    if (log.type === "to_home") {
      const programEndTs = timeOnSameDay(log.startTime, params.programLucruEnd ?? DEFAULT_PROGRAM_END, { h: 16, m: 30 })
      const homeCapEnd = programEndTs + 60 * 60 * 1000
      const effectiveEnd = Math.min(params.now, log.startTime + 60 * 60 * 1000, homeCapEnd)
      const minutesEligible = Math.max(0, calculateHomeRouteMinutes(log.startTime, effectiveEnd))
      return { ...log, endTime: effectiveEnd, minutesEligible }
    }
    return log
  })

  return changed ? updated : currentLogs
}

/**
 * Create a new check-in session
 */
export async function createCheckIn(request: CheckInRequest): Promise<string> {
  // Check if user has an active session
  const activeSession = await getActiveSession(request.userId)
  if (activeSession) {
    throw new Error("User already has an active session. Please check out first.")
  }

  const sessionId = `att_${request.userId}_${Date.now()}`
  const now = Date.now()

  const schedule = await getEmployeeScheduleForUser(request.userId)

  const session: Omit<AttendanceSession, "id"> = {
    userId: request.userId,
    employeeId: schedule?.employeeId,
    sessionStart: now,
    mode: request.mode,
    location: request.location,
    faceRecognitionId: request.faceRecognitionId,
    status: "active",
    deviceInfo: request.deviceInfo,
    programLucruStart: schedule?.programLucruStart ?? DEFAULT_PROGRAM_START,
    programLucruEnd: schedule?.programLucruEnd ?? DEFAULT_PROGRAM_END,
    createdAt: now,
    updatedAt: now,
  }

  await setDoc(doc(db, "attendance", sessionId), {
    ...session,
    sessionStart: Timestamp.fromMillis(now),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return sessionId
}

/**
 * Check out from active session
 */
export async function createCheckOut(request: CheckOutRequest): Promise<void> {
  const sessionRef = doc(db, "attendance", request.sessionId)
  
  // Get the session to check the 1-minute rule
  const sessions = await getDocs(
    query(collection(db, "attendance"), where("__name__", "==", request.sessionId))
  )
  
  if (sessions.empty) {
    throw new Error("Session not found")
  }

  const raw = sessions.docs[0].data() as any
  const sessionData = raw as AttendanceSession
  const sessionStart = typeof sessionData.sessionStart === 'number' 
    ? sessionData.sessionStart 
    : (sessionData.sessionStart as any).toMillis()
  
  const now = Date.now()
  const elapsedSeconds = (now - sessionStart) / 1000

  // 1-minute rule: must wait at least 60 seconds before checking out
  if (elapsedSeconds < 60) {
    const remainingSeconds = Math.ceil(60 - elapsedSeconds)
    throw new Error(`Please wait ${remainingSeconds} more seconds before checking out.`)
  }

  const programLucruStart = raw.programLucruStart ? String(raw.programLucruStart) : DEFAULT_PROGRAM_START
  const programLucruEnd = raw.programLucruEnd ? String(raw.programLucruEnd) : DEFAULT_PROGRAM_END
  const extraTimeLogs = finalizeOpenExtraTimeLogs({ session: raw, now, programLucruStart, programLucruEnd })

  await updateDoc(sessionRef, {
    sessionEnd: Timestamp.fromMillis(now),
    status: "completed",
    checkOutMode: request.mode,
    checkOutLocation: request.location,
    checkOutFaceRecognitionId: request.faceRecognitionId ?? null,
    checkOutDeviceInfo: request.deviceInfo,
    ...(extraTimeLogs ? { extraTimeLogs } : {}),
    updatedAt: serverTimestamp(),
  })
}

/**
 * Get active session for a user
 */
export async function getActiveSession(userId: string): Promise<AttendanceSession | null> {
  const q = query(
    collection(db, "attendance"),
    where("userId", "==", userId),
    where("status", "==", "active"),
    limit(1)
  )

  const snapshot = await getDocs(q)
  if (snapshot.empty) return null

  const doc = snapshot.docs[0]
  const data = doc.data()
  
  return {
    id: doc.id,
    ...data,
    sessionStart: typeof data.sessionStart === 'number' ? data.sessionStart : data.sessionStart.toMillis(),
    sessionEnd: data.sessionEnd ? (typeof data.sessionEnd === 'number' ? data.sessionEnd : data.sessionEnd.toMillis()) : undefined,
    createdAt: typeof data.createdAt === 'number' ? data.createdAt : data.createdAt?.toMillis() || Date.now(),
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : data.updatedAt?.toMillis() || Date.now(),
  } as AttendanceSession
}

/**
 * Get latest completed session for a user (useful for "Traseu către casă" after Stop)
 */
export async function getLatestCompletedSession(
  userId: string,
  params?: { sinceMs?: number }
): Promise<AttendanceSession | null> {
  const q = query(
    collection(db, "attendance"),
    where("userId", "==", userId),
    where("status", "==", "completed"),
    orderBy("sessionEnd", "desc"),
    limit(1)
  )

  const snapshot = await getDocs(q)
  if (snapshot.empty) return null

  const d = snapshot.docs[0]
  const data = d.data() as any
  const session: AttendanceSession = {
    id: d.id,
    ...data,
    sessionStart: typeof data.sessionStart === "number" ? data.sessionStart : data.sessionStart?.toMillis?.(),
    sessionEnd: data.sessionEnd ? (typeof data.sessionEnd === "number" ? data.sessionEnd : data.sessionEnd?.toMillis?.()) : undefined,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : data.createdAt?.toMillis?.() || Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : data.updatedAt?.toMillis?.() || Date.now(),
  } as AttendanceSession

  if (params?.sinceMs && session.sessionEnd && session.sessionEnd < params.sinceMs) return null
  return session
}

/**
 * Subscribe to active session for real-time updates
 */
export function subscribeActiveSession(
  userId: string,
  onChange: (session: AttendanceSession | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, "attendance"),
    where("userId", "==", userId),
    where("status", "==", "active"),
    limit(1)
  )

  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onChange(null)
        return
      }

      const doc = snapshot.docs[0]
      const data = doc.data()

      const session: AttendanceSession = {
        id: doc.id,
        ...data,
        sessionStart: typeof data.sessionStart === 'number' ? data.sessionStart : data.sessionStart.toMillis(),
        sessionEnd: data.sessionEnd ? (typeof data.sessionEnd === 'number' ? data.sessionEnd : data.sessionEnd.toMillis()) : undefined,
        createdAt: typeof data.createdAt === 'number' ? data.createdAt : data.createdAt?.toMillis() || Date.now(),
        updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : data.updatedAt?.toMillis() || Date.now(),
      } as AttendanceSession

      onChange(session)
    },
    (error) => {
      onError?.(error as Error)
    }
  )
}

/**
 * Start tracking extra time (route to client/home)
 */
export async function startExtraTimeLog(request: ExtraTimeRequest): Promise<void> {
  const sessionRef = doc(db, "attendance", request.sessionId)
  const now = Date.now()

  const newLog: ExtraTimeLog = {
    type: request.type,
    startTime: now,
    minutesEligible: 0, // Will be calculated on end
  }

  // Get current session to append to extraTimeLogs
  const sessions = await getDocs(
    query(collection(db, "attendance"), where("__name__", "==", request.sessionId))
  )

  if (sessions.empty) {
    throw new Error("Session not found")
  }

  const sessionData = sessions.docs[0].data() as any
  const currentLogs = sessionData.extraTimeLogs || []

  const programLucruStart = sessionData.programLucruStart ? String(sessionData.programLucruStart) : DEFAULT_PROGRAM_START
  const programLucruEnd = sessionData.programLucruEnd ? String(sessionData.programLucruEnd) : DEFAULT_PROGRAM_END

  // Eligibility enforcement (backend-guaranteed)
  if (request.type === "to_client") {
    if (sessionData.status !== "active") throw new Error("Traseu către client este disponibil doar în timpul turei.")
    if (sessionData.mode !== "field") throw new Error("Traseu către client este disponibil doar în modul Din mașină.")
    const eightAm = timeOnSameDay(now, "08:00", { h: 8, m: 0 })
    const programStartTs = timeOnSameDay(now, programLucruStart, { h: 8, m: 0 })
    const capEnd = Math.min(eightAm, programStartTs)
    if (now >= capEnd) throw new Error("Traseu către client este disponibil doar până la ora 08:00.")
  }

  if (request.type === "to_home") {
    if (sessionData.status !== "completed") throw new Error("Traseu către casă este disponibil doar după Stop.")
    if (sessionData.mode !== "field") throw new Error("Traseu către casă este disponibil doar în modul Din mașină.")
    const sessionEnd = sessionData.sessionEnd?.toMillis?.() ?? sessionData.sessionEnd
    if (!sessionEnd || !Number.isFinite(sessionEnd)) throw new Error("Nu există ora de final pentru tură.")
    const programEndTs = timeOnSameDay(sessionEnd, programLucruEnd, { h: 16, m: 30 })
    if (sessionEnd < programEndTs) throw new Error("Traseu către casă este disponibil doar dacă ai terminat după ora de final a programului.")
    const homeWindowEnd = programEndTs + 60 * 60 * 1000
    if (now > homeWindowEnd) throw new Error("Fereastra de Traseu către casă (1h) a expirat.")
    const minutesSinceCheckout = (now - sessionEnd) / 60000
    if (minutesSinceCheckout > 60) throw new Error("Traseu către casă este disponibil max 1 oră după Stop.")
  }

  // Check if there's already an active log of this type
  const hasActiveLog = currentLogs.some(
    (log: ExtraTimeLog) => log.type === request.type && !log.endTime
  )

  if (hasActiveLog) {
    throw new Error(`Already tracking ${request.type} time`)
  }

  await updateDoc(sessionRef, {
    extraTimeLogs: [...currentLogs, newLog],
    updatedAt: serverTimestamp(),
  })
}

/**
 * End tracking extra time
 */
export async function endExtraTimeLog(sessionId: string, type: ExtraTimeRequest["type"]): Promise<number> {
  const sessionRef = doc(db, "attendance", sessionId)
  const now = Date.now()

  // Get current session
  const sessions = await getDocs(
    query(collection(db, "attendance"), where("__name__", "==", sessionId))
  )

  if (sessions.empty) {
    throw new Error("Session not found")
  }

  const sessionData = sessions.docs[0].data() as any
  const currentLogs: ExtraTimeLog[] = sessionData.extraTimeLogs || []

  // Find the active log of this type
  const logIndex = currentLogs.findIndex(
    (log) => log.type === type && !log.endTime
  )

  if (logIndex === -1) {
    throw new Error(`No active ${type} tracking found`)
  }

  const log = currentLogs[logIndex]
  const programLucruStart = sessionData.programLucruStart ? String(sessionData.programLucruStart) : DEFAULT_PROGRAM_START
  const programLucruEnd = sessionData.programLucruEnd ? String(sessionData.programLucruEnd) : DEFAULT_PROGRAM_END

  let effectiveEnd = now
  if (type === "to_client") {
    const eightAm = timeOnSameDay(log.startTime, "08:00", { h: 8, m: 0 })
    const programStartTs = timeOnSameDay(log.startTime, programLucruStart, { h: 8, m: 0 })
    const capEnd = Math.min(eightAm, programStartTs)
    effectiveEnd = Math.min(now, capEnd)
  } else if (type === "to_home") {
    const programEndTs = timeOnSameDay(log.startTime, programLucruEnd, { h: 16, m: 30 })
    const homeWindowEnd = programEndTs + 60 * 60 * 1000
    effectiveEnd = Math.min(now, log.startTime + 60 * 60 * 1000, homeWindowEnd)
  }

  const minutesEligible =
    type === "to_client"
      ? Math.max(0, Math.floor((effectiveEnd - log.startTime) / 60000))
      : Math.max(0, calculateHomeRouteMinutes(log.startTime, effectiveEnd))

  // Update the log with end time and eligible minutes
  const updatedLogs = [...currentLogs]
  updatedLogs[logIndex] = {
    ...log,
    endTime: effectiveEnd,
    minutesEligible,
  }

  await updateDoc(sessionRef, {
    extraTimeLogs: updatedLogs,
    updatedAt: serverTimestamp(),
  })

  return minutesEligible
}

/**
 * Check if checkout is allowed (1-minute rule)
 */
export async function canCheckOut(sessionId: string): Promise<{ allowed: boolean; remainingSeconds?: number }> {
  const sessions = await getDocs(
    query(collection(db, "attendance"), where("__name__", "==", sessionId))
  )

  if (sessions.empty) {
    return { allowed: false }
  }

  const sessionData = sessions.docs[0].data()
  const sessionStart = typeof sessionData.sessionStart === 'number'
    ? sessionData.sessionStart
    : sessionData.sessionStart.toMillis()

  const now = Date.now()
  const elapsedSeconds = (now - sessionStart) / 1000

  if (elapsedSeconds < 60) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil(60 - elapsedSeconds),
    }
  }

  return { allowed: true }
}

/**
 * Get all sessions for a date range
 */
export async function getSessionsForDateRange(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<AttendanceSession[]> {
  const q = query(
    collection(db, "attendance"),
    where("userId", "==", userId),
    where("sessionStart", ">=", Timestamp.fromDate(startDate)),
    where("sessionStart", "<=", Timestamp.fromDate(endDate)),
    orderBy("sessionStart", "desc")
  )

  const snapshot = await getDocs(q)
  
  return snapshot.docs.map((doc) => {
    const data = doc.data()
    return {
      id: doc.id,
      ...data,
      sessionStart: typeof data.sessionStart === 'number' ? data.sessionStart : data.sessionStart.toMillis(),
      sessionEnd: data.sessionEnd ? (typeof data.sessionEnd === 'number' ? data.sessionEnd : data.sessionEnd.toMillis()) : undefined,
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : data.createdAt?.toMillis() || Date.now(),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : data.updatedAt?.toMillis() || Date.now(),
    } as AttendanceSession
  })
}
