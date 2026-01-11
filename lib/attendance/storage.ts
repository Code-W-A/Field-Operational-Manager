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

export type Unsubscribe = () => void

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

  const session: Omit<AttendanceSession, "id"> = {
    userId: request.userId,
    userName: request.userName,
    sessionStart: now,
    mode: request.mode,
    location: request.location,
    faceRecognitionId: request.faceRecognitionId,
    status: "active",
    deviceInfo: request.deviceInfo,
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

  const sessionData = sessions.docs[0].data() as AttendanceSession
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

  await updateDoc(sessionRef, {
    sessionEnd: Timestamp.fromMillis(now),
    status: "completed",
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

  const sessionData = sessions.docs[0].data()
  const currentLogs = sessionData.extraTimeLogs || []

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

  const sessionData = sessions.docs[0].data()
  const currentLogs: ExtraTimeLog[] = sessionData.extraTimeLogs || []

  // Find the active log of this type
  const logIndex = currentLogs.findIndex(
    (log) => log.type === type && !log.endTime
  )

  if (logIndex === -1) {
    throw new Error(`No active ${type} tracking found`)
  }

  const log = currentLogs[logIndex]
  const minutesElapsed = Math.floor((now - log.startTime) / 60000)

  // Update the log with end time and eligible minutes
  const updatedLogs = [...currentLogs]
  updatedLogs[logIndex] = {
    ...log,
    endTime: now,
    minutesEligible: minutesElapsed,
  }

  await updateDoc(sessionRef, {
    extraTimeLogs: updatedLogs,
    updatedAt: serverTimestamp(),
  })

  return minutesElapsed
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
