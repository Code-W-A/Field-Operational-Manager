"use client"

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { addUserLogEntry } from "@/lib/firebase/firestore"
import type {
  AttendanceSession,
  CheckInRequest,
  CheckOutRequest,
  ExtraTimeRequest,
  ExtraTimeLog,
  AttendanceMode,
} from "@/types/attendance"
import type { Employee, HrDefaults } from "@/lib/hr/types"
import { calculateHomeRouteMinutes } from "@/lib/attendance/extra-time"
import { clampSessionEndMs } from "@/lib/attendance/auto-pontaj-schedule"
import { syncAttendanceUserDayToTimesheet, type UserDaySyncResult } from "@/lib/attendance/sync-timesheet"
import { logPontajCondicaSyncError, logPontajPlay, logPontajStop } from "@/lib/attendance/pontaj-audit-log"
import {
  selectLatestActiveSession,
  shouldBlockCheckInForLock,
  shouldBlockCheckoutForLock,
  type LockSessionSnapshot,
} from "@/lib/attendance/active-session-lock"
import { getAppNowMs } from "@/lib/utils/test-clock"
import { executeCheckoutPipeline } from "@/lib/attendance/checkout-pipeline"

export type Unsubscribe = () => void

const DEFAULT_PROGRAM_START = "08:00"
const DEFAULT_PROGRAM_END = "16:30"

const DEBUG_PONTAJ = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"

const ACTIVE_SESSION_LOCKS_COLLECTION = "attendanceActiveSessions"

const withoutUndefined = (obj: Record<string, any>) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined))

function debugPontajLog(label: string, payload: Record<string, any>) {
  if (!DEBUG_PONTAJ) return
  try {
    console.log(`[PONTAJ] ${label}`, payload)
  } catch {
    // ignore
  }
}

function timestampToMillis(value: any): number | undefined {
  if (typeof value === "number") return value
  if (value?.toMillis) return value.toMillis()
  return undefined
}

function normalizeAttendanceDoc(id: string, data: any): AttendanceSession {
  return {
    id,
    ...data,
    sessionStart: timestampToMillis(data.sessionStart) ?? getAppNowMs(),
    sessionEnd: data.sessionEnd ? timestampToMillis(data.sessionEnd) : undefined,
    createdAt: timestampToMillis(data.createdAt) ?? getAppNowMs(),
    updatedAt: timestampToMillis(data.updatedAt) ?? getAppNowMs(),
  } as AttendanceSession
}

function toLockSessionSnapshot(id: string, data: any): LockSessionSnapshot {
  return {
    id,
    userId: data?.userId ? String(data.userId) : null,
    status: data?.status ? String(data.status) : null,
    sessionStart: timestampToMillis(data?.sessionStart) ?? null,
  }
}

function parseHM(value: string | undefined): number | null {
  if (!value) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim())
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function formatHMFromMs(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function isMissingIndexError(error: unknown) {
  const msg = (error as any)?.message || ""
  const code = (error as any)?.code || ""
  return code === "failed-precondition" && String(msg).toLowerCase().includes("requires an index")
}

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

function computeLateStart(params: { now: number; scheduledStart: string }) {
  const scheduledMs = timeOnSameDay(params.now, params.scheduledStart, { h: 8, m: 0 })
  const diffMin = Math.floor((params.now - scheduledMs) / 60000)
  const lateStartMinutes = Math.max(0, diffMin)
  return { lateStartMinutes, scheduledMs }
}

async function getEmployeeScheduleForUser(
  userId: string,
  userName?: string
): Promise<(Pick<Employee, "programLucruStart" | "programLucruEnd" | "pauzaStart" | "pauzaEnd"> & { employeeId: string }) | null> {
  const defaults = await getHrDefaults()

  const toSchedule = (docSnap: any) => {
    const data = docSnap.data() as any
    return {
      employeeId: docSnap.id,
      programLucruStart: data.programLucruStart ? String(data.programLucruStart) : defaults?.programLucruStart,
      programLucruEnd: data.programLucruEnd ? String(data.programLucruEnd) : defaults?.programLucruEnd,
      pauzaStart: data.pauzaStart ? String(data.pauzaStart) : defaults?.pauzaStart,
      pauzaEnd: data.pauzaEnd ? String(data.pauzaEnd) : defaults?.pauzaEnd,
    }
  }

  const q = query(collection(db, "hrEmployees"), where("userUid", "==", userId), limit(1))
  const snap = await getDocs(q)
  if (!snap.empty) return toSchedule(snap.docs[0])

  // Fallback de compatibilitate: dacă userUid nu e legat corect, încercăm mapare după fullName.
  // Ajută cazurile cu utilizatori noi unde link-ul HR nu este încă propagat.
  const trimmedName = String(userName || "").trim()
  if (trimmedName) {
    const byFullName = await getDocs(query(collection(db, "hrEmployees"), where("fullName", "==", trimmedName), limit(2)))
    if (byFullName.size > 1) {
      throw new Error(
        "Există mai mulți salariați cu acest nume. Asociază explicit contul prin userUid înainte de pontare."
      )
    }
    if (!byFullName.empty) {
      const docSnap = byFullName.docs[0]
      const current = docSnap.data() as any
      const hasMissingOrMismatchedUid = !current?.userUid || String(current.userUid) !== String(userId)

      // Audit tehnic: fallback-ul pe nume a fost folosit (semnal pentru legături HR incomplete).
      void addUserLogEntry({
        actiune: "Fallback mapare salariat după nume",
        detalii: `Pontaj check-in: userId=${userId}; userName=${trimmedName}; employeeId=${docSnap.id}; needsLinkFix=${hasMissingOrMismatchedUid ? "da" : "nu"}`,
        tip: "Avertisment",
        categorie: "Pontaj",
        entityType: "Employee",
        entityId: docSnap.id,
        metadata: {
          source: "attendance.getEmployeeScheduleForUser",
          fallbackUsed: true,
          userId,
          userName: trimmedName,
          employeeId: docSnap.id,
          employeeUserUid: current?.userUid || null,
          needsLinkFix: hasMissingOrMismatchedUid,
        },
      })

      if (!current?.userUid || String(current.userUid) !== String(userId)) {
        try {
          await setDoc(
            doc(db, "hrEmployees", docSnap.id),
            {
              userUid: userId,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          )
        } catch {
          // Non-blocking: păstrăm fallback-ul chiar dacă backfill-ul eșuează.
        }
      }
      return toSchedule(docSnap)
    }
  }

  return null
}

async function checkTimesheetStartOverlap(employeeId: string, startMs: number): Promise<string | null> {
  try {
    const d = new Date(startMs)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const dayKey = String(d.getDate())
    const ref = doc(db, "hrTimesheets", `${employeeId}_${monthKey}`)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const day = (snap.data() as any)?.days?.[dayKey]
    const entries: Array<{ start: string; end: string }> = Array.isArray(day?.entries) ? day.entries : []
    const startMinutes = parseHM(formatHMFromMs(startMs))
    if (startMinutes == null) return null
    const hit = entries.find((e) => {
      const s = parseHM(e.start)
      const en = parseHM(e.end)
      if (s == null || en == null) return false
      return startMinutes >= s && startMinutes < en
    })
    return hit ? `${hit.start}–${hit.end}` : null
  } catch {
    return null
  }
}

async function checkApprovedLeaveBlock(employeeId: string, startMs: number): Promise<boolean> {
  try {
    const d = new Date(startMs)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const dayKey = String(d.getDate())
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

    // First, check existing timesheet day code (fast path).
    const ref = doc(db, "hrTimesheets", `${employeeId}_${monthKey}`)
    const snap = await getDoc(ref)
    if (snap.exists()) {
      const day = (snap.data() as any)?.days?.[dayKey]
      const code = String(day?.code || "")
      if (code === "CO" || code === "CFP" || code === "CM" || code === "IN") {
        return true
      }
    }

    // Fallback: check approved HR requests (in case timesheet is not yet synced).
    const q = query(collection(db, "hrRequests"), where("employeeId", "==", employeeId))
    const reqSnap = await getDocs(q)
    for (const docSnap of reqSnap.docs) {
      const data = docSnap.data() as any
      if (String(data?.status || "") !== "approved") continue
      const kind = String(data?.kind || "")
      if (!(kind === "CO" || kind === "CFP" || kind === "CM" || kind === "IN")) continue
      const payload = data?.payload || {}
      if (kind === "IN") {
        if (String(payload?.date || "") === dateStr) return true
      } else {
        const startDate = String(payload?.startDate || "")
        const endDate = String(payload?.endDate || "")
        if (!startDate || !endDate) continue
        if (startDate <= dateStr && dateStr <= endDate) return true
      }
    }
    return false
  } catch {
    return false
  }
}

async function getHrDefaults(): Promise<HrDefaults | null> {
  try {
    const ref = doc(db, "hrSettings", "defaults")
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const data = snap.data() as any
    return {
      programLucruStart: data?.programLucruStart ? String(data.programLucruStart) : undefined,
      programLucruEnd: data?.programLucruEnd ? String(data.programLucruEnd) : undefined,
      pauzaStart: data?.pauzaStart ? String(data.pauzaStart) : undefined,
      pauzaEnd: data?.pauzaEnd ? String(data.pauzaEnd) : undefined,
    }
  } catch {
    return null
  }
}

async function getUserRoleForAttendance(userId: string): Promise<string> {
  try {
    const snap = await getDoc(doc(db, "users", userId))
    if (!snap.exists()) return ""
    const role = (snap.data() as any)?.role
    return role ? String(role) : ""
  } catch {
    return ""
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
  const now = request.sessionStartMs ?? getAppNowMs()
  const sessionId = `att_${request.userId}_${now}`

  const schedule = await getEmployeeScheduleForUser(request.userId, request.userName)
  const userRole = await getUserRoleForAttendance(request.userId)
  if ((userRole === "admin" || userRole === "dispecer") && !schedule?.employeeId) {
    throw new Error(
      "Contul tău nu este asociat cu un salariat HR. Mergi în Resurse Umane → Salariați și setează userUid."
    )
  }

  if (schedule?.employeeId) {
    const blocked = await checkApprovedLeaveBlock(schedule.employeeId, now)
    if (blocked) {
      throw new Error("Se pare că astăzi ești în concediu.")
    }
    const overlap = await checkTimesheetStartOverlap(schedule.employeeId, now)
    if (overlap) {
      throw new Error(`Există deja pontaj în condică pentru intervalul ${overlap}.`)
    }
  }

  debugPontajLog("check-in:start", {
    userId: request.userId,
    role: userRole || "unknown",
    employeeId: schedule?.employeeId,
    mode: request.mode,
    hasLocation: Boolean(request.location),
    deviceType: request.deviceInfo?.type,
  })

  const scheduledStart = schedule?.programLucruStart ?? DEFAULT_PROGRAM_START
  const late = computeLateStart({ now, scheduledStart })

  const session: Omit<AttendanceSession, "id"> = {
    userId: request.userId,
    employeeId: schedule?.employeeId,
    sessionStart: now,
    mode: request.mode,
    location: request.location,
    faceRecognitionId: request.faceRecognitionId,
    checkInSelfieUrl: request.checkInSelfieUrl ?? undefined,
    checkInSelfiePath: request.checkInSelfiePath ?? undefined,
    checkInSelfieStatus: request.checkInSelfieStatus ?? undefined,
    specialDayConfirmation: request.specialDayConfirmation ?? undefined,
    ...(late.lateStartMinutes > 0
      ? { lateStartMinutes: late.lateStartMinutes, lateStartAt: now, scheduledStart }
      : { scheduledStart }),
    status: "active",
    deviceInfo: request.deviceInfo,
    programLucruStart: scheduledStart,
    programLucruEnd: schedule?.programLucruEnd ?? DEFAULT_PROGRAM_END,
    pauzaStart: schedule?.pauzaStart,
    pauzaEnd: schedule?.pauzaEnd,
    ...(request.checkInAuto ? { checkInAuto: true, checkInAutoReason: request.checkInAutoReason } : {}),
    createdAt: now,
    updatedAt: now,
  }

  const sessionRef = doc(db, "attendance", sessionId)
  const lockRef = doc(db, ACTIVE_SESSION_LOCKS_COLLECTION, request.userId)

  await runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef)
    const lockedSessionId = lockSnap.exists() ? String((lockSnap.data() as any)?.activeSessionId || "") : ""

    if (lockedSessionId) {
      const lockedSessionRef = doc(db, "attendance", lockedSessionId)
      const lockedSessionSnap = await tx.get(lockedSessionRef)
      if (lockedSessionSnap.exists()) {
        const lockedSession = toLockSessionSnapshot(lockedSessionSnap.id, lockedSessionSnap.data())
        if (shouldBlockCheckInForLock(lockedSession)) {
          throw new Error("User already has an active session. Please check out first.")
        }
      }
    }

    tx.set(sessionRef, withoutUndefined({
      ...session,
      sessionStart: Timestamp.fromMillis(now),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }) as any)

    tx.set(lockRef, withoutUndefined({
      userId: request.userId,
      activeSessionId: sessionId,
      sessionStart: Timestamp.fromMillis(now),
      employeeId: schedule?.employeeId ?? null,
      updatedAt: serverTimestamp(),
    }) as any)
  })

  debugPontajLog("check-in:written", {
    sessionId,
    userId: request.userId,
    employeeId: schedule?.employeeId,
    sessionStart: now,
  })

  logPontajPlay({
    userId: request.userId,
    userDisplayName: request.userName,
    employeeId: schedule?.employeeId,
    sessionId,
    sessionStartMs: now,
    auto: request.checkInAuto,
    reason: request.checkInAutoReason,
  })

  return sessionId
}

/**
 * Check out from active session
 */
export async function createCheckOut(request: CheckOutRequest): Promise<UserDaySyncResult | null> {
  const sessionRef = doc(db, "attendance", request.sessionId)

  // Initial read is used for client-side timing rules; the transaction below revalidates status atomically.
  const initialSnap = await getDoc(sessionRef)

  if (!initialSnap.exists()) {
    throw new Error("Session not found")
  }

  const raw = initialSnap.data() as any
  const sessionData = raw as AttendanceSession
  const sessionStart = typeof sessionData.sessionStart === 'number' 
    ? sessionData.sessionStart 
    : (sessionData.sessionStart as any).toMillis()
  
  const debugEnabled = process.env.NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true"

  const endOfDayLocalMs = (startMs: number) => {
    const d = new Date(startMs)
    d.setHours(23, 59, 59, 999)
    return d.getTime()
  }

  const now = (() => {
    if (request.sessionEndMs != null && Number.isFinite(request.sessionEndMs)) {
      return request.sessionEndMs
    }
    const baseNow = getAppNowMs()
    const mins = request.debugSimulatedDurationMinutes
    if (!debugEnabled || !mins || !Number.isFinite(mins) || mins <= 0) return baseNow
    // Keep within the same local day to match HR day queries.
    const desired = sessionStart + Math.round(mins) * 60 * 1000
    const clamped = Math.min(desired, endOfDayLocalMs(sessionStart))
    // Ensure it still respects the 1-minute rule relative to start.
    return Math.max(clamped, sessionStart + 60 * 1000)
  })()

  debugPontajLog("check-out:start", {
    sessionId: request.sessionId,
    userId: sessionData.userId,
    employeeId: (sessionData as any)?.employeeId,
    sessionStart,
    sessionEnd: now,
    debugMinutes: request.debugSimulatedDurationMinutes,
  })

  const elapsedSeconds = (now - sessionStart) / 1000

  // 1-minute rule: must wait at least 60 seconds before checking out (skipped for auto depontaj)
  if (!request.skipMinimumDurationCheck && elapsedSeconds < 60) {
    const remainingSeconds = Math.ceil(60 - elapsedSeconds)
    throw new Error(`Te rugăm să mai aștepți ${remainingSeconds} secunde înainte de a opri pontajul.`)
  }

  const programLucruStart = raw.programLucruStart ? String(raw.programLucruStart) : DEFAULT_PROGRAM_START
  const programLucruEnd = raw.programLucruEnd ? String(raw.programLucruEnd) : DEFAULT_PROGRAM_END

  // Anti-corupere salarii: o sesiune uitată deschisă peste ziua ei nu poate înregistra
  // mai mult decât ziua de start. Pentru astfel de sesiuni facturăm la ora de final a programului.
  const effectiveEnd = clampSessionEndMs(sessionStart, now, programLucruEnd)

  const pipeline = await executeCheckoutPipeline({
    commit: () => runTransaction(db, async (tx) => {
      const currentSnap = await tx.get(sessionRef)
      if (!currentSnap.exists()) {
        throw new Error("Session not found")
      }

      const currentRaw = currentSnap.data() as any
      if (currentRaw.status !== "active") {
        throw new Error("Sesiunea este deja închisă.")
      }

      const currentUserId = String(currentRaw.userId || sessionData.userId || "")
      const lockRef = doc(db, ACTIVE_SESSION_LOCKS_COLLECTION, currentUserId)
      const lockSnap = await tx.get(lockRef)
      const lockedSessionId = lockSnap.exists() ? String((lockSnap.data() as any)?.activeSessionId || "") : ""
      let shouldDeleteLock = false

      if (lockedSessionId === request.sessionId) {
        shouldDeleteLock = true
      } else if (lockedSessionId) {
        const lockedSessionRef = doc(db, "attendance", lockedSessionId)
        const lockedSessionSnap = await tx.get(lockedSessionRef)
        const lockedSession = lockedSessionSnap.exists()
          ? toLockSessionSnapshot(lockedSessionSnap.id, lockedSessionSnap.data())
          : null
        if (shouldBlockCheckoutForLock({ requestedSessionId: request.sessionId, lockedSession })) {
          throw new Error("Există altă sesiune activă pentru acest utilizator. Reîncarcă pontajul înainte de depontare.")
        }
        shouldDeleteLock = true
      }

      const currentProgramLucruStart = currentRaw.programLucruStart ? String(currentRaw.programLucruStart) : DEFAULT_PROGRAM_START
      const currentProgramLucruEnd = currentRaw.programLucruEnd ? String(currentRaw.programLucruEnd) : DEFAULT_PROGRAM_END
      const currentExtraTimeLogs = finalizeOpenExtraTimeLogs({
        session: currentRaw,
        now: effectiveEnd,
        programLucruStart: currentProgramLucruStart,
        programLucruEnd: currentProgramLucruEnd,
      })

      tx.update(sessionRef, withoutUndefined({
        sessionEnd: Timestamp.fromMillis(effectiveEnd),
        status: "completed",
        checkOutMode: request.mode,
        checkOutLocation: request.location,
        checkOutFaceRecognitionId: request.faceRecognitionId ?? null,
        checkOutSelfieUrl: request.checkOutSelfieUrl ?? null,
        checkOutSelfiePath: request.checkOutSelfiePath ?? null,
        checkOutSelfieStatus: request.checkOutSelfieStatus ?? null,
        checkOutDeviceInfo: request.deviceInfo,
        ...(request.checkOutAuto
          ? { checkOutAuto: true, checkOutAutoReason: request.checkOutAutoReason ?? null }
          : {}),
        ...(request.autoStopped ? { autoStopped: true, autoStoppedAt: serverTimestamp() } : {}),
        ...(currentExtraTimeLogs ? { extraTimeLogs: currentExtraTimeLogs } : {}),
        updatedAt: serverTimestamp(),
      }) as any)

      if (shouldDeleteLock) {
        tx.delete(lockRef)
      }

      return {
        sessionData: normalizeAttendanceDoc(currentSnap.id, currentRaw),
        extraTimeLogsCount: Array.isArray(currentExtraTimeLogs) ? currentExtraTimeLogs.length : 0,
      }
    }),
    audit: (txResult) => logPontajStop({
      userId: txResult.sessionData.userId,
      userDisplayName: (txResult.sessionData as any)?.userName,
      employeeId: (txResult.sessionData as any)?.employeeId,
      sessionId: request.sessionId,
      sessionStartMs: sessionStart,
      sessionEndMs: effectiveEnd,
      auto: request.checkOutAuto,
      reason: request.checkOutAutoReason,
    }),
    sync: (txResult) => syncAttendanceUserDayToTimesheet(txResult.sessionData.userId, new Date(sessionStart)),
    onSyncError: (error, txResult) => {
      console.warn("Auto-sync Pontaj → Condică failed (storage):", error)
      logPontajCondicaSyncError(txResult.sessionData.userId, error)
    },
  })

  const txResult = pipeline.committed

  debugPontajLog("check-out:written", {
    sessionId: request.sessionId,
    userId: txResult.sessionData.userId,
    employeeId: (txResult.sessionData as any)?.employeeId,
    sessionStart,
    sessionEnd: effectiveEnd,
    requestedEnd: now,
    clamped: effectiveEnd !== now,
    extraTimeLogs: txResult.extraTimeLogsCount,
  })

  debugPontajLog("condica:sync-result", pipeline.syncResult ?? {})
  return pipeline.syncResult
}

/**
 * Get active session for a user
 */
export async function getActiveSession(userId: string): Promise<AttendanceSession | null> {
  try {
    const lockSnap = await getDoc(doc(db, ACTIVE_SESSION_LOCKS_COLLECTION, userId))
    const lockedSessionId = lockSnap.exists() ? String((lockSnap.data() as any)?.activeSessionId || "") : ""
    if (lockedSessionId) {
      const lockedSessionSnap = await getDoc(doc(db, "attendance", lockedSessionId))
      if (lockedSessionSnap.exists()) {
        const lockedSession = normalizeAttendanceDoc(lockedSessionSnap.id, lockedSessionSnap.data())
        if (lockedSession.userId === userId && lockedSession.status === "active") {
          return lockedSession
        }
      }
    }

    const q = query(
      collection(db, "attendance"),
      where("userId", "==", userId),
      where("status", "==", "active"),
      orderBy("sessionStart", "desc"),
      limit(1)
    )

    const snapshot = await getDocs(q)
    if (snapshot.empty) return null

    const activeDoc = snapshot.docs[0]
    return normalizeAttendanceDoc(activeDoc.id, activeDoc.data())
  } catch (error) {
    if (!isMissingIndexError(error)) throw error
    console.warn("Missing index for active session query; using fallback scan.")
    const fallbackSnap = await getDocs(
      query(collection(db, "attendance"), where("userId", "==", userId))
    )
    const sessions: AttendanceSession[] = fallbackSnap.docs.map((doc) => {
      return normalizeAttendanceDoc(doc.id, doc.data())
    })
    return selectLatestActiveSession(sessions)
  }
}

/**
 * Get latest completed session for a user (useful for "Traseu către casă" after Stop)
 */
export async function getLatestCompletedSession(
  userId: string,
  params?: { sinceMs?: number }
): Promise<AttendanceSession | null> {
  try {
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
      createdAt: typeof data.createdAt === "number" ? data.createdAt : data.createdAt?.toMillis?.() || getAppNowMs(),
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : data.updatedAt?.toMillis?.() || getAppNowMs(),
    } as AttendanceSession

    if (params?.sinceMs && session.sessionEnd && session.sessionEnd < params.sinceMs) return null
    return session
  } catch (error) {
    if (!isMissingIndexError(error)) throw error
    console.warn("Missing index for completed session query; using fallback scan.")
    const fallbackSnap = await getDocs(
      query(collection(db, "attendance"), where("userId", "==", userId))
    )
    const sessions: AttendanceSession[] = fallbackSnap.docs.map((doc) => {
      const data = doc.data() as any
      return {
        id: doc.id,
        ...data,
        sessionStart: typeof data.sessionStart === "number" ? data.sessionStart : data.sessionStart?.toMillis?.(),
        sessionEnd: data.sessionEnd ? (typeof data.sessionEnd === "number" ? data.sessionEnd : data.sessionEnd?.toMillis?.()) : undefined,
        createdAt: typeof data.createdAt === "number" ? data.createdAt : data.createdAt?.toMillis?.() || getAppNowMs(),
        updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : data.updatedAt?.toMillis?.() || getAppNowMs(),
      } as AttendanceSession
    })
    const latest = sessions
      .filter((s) => s.status === "completed" && typeof s.sessionEnd === "number")
      .sort((a, b) => (b.sessionEnd ?? 0) - (a.sessionEnd ?? 0))[0]
    if (!latest) return null
    if (params?.sinceMs && latest.sessionEnd && latest.sessionEnd < params.sinceMs) return null
    return latest
  }
}

/**
 * Subscribe to active session for real-time updates
 */
export function subscribeActiveSession(
  userId: string,
  onChange: (session: AttendanceSession | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  let innerUnsubscribe: Unsubscribe | null = null

  const clearInner = () => {
    if (innerUnsubscribe) {
      innerUnsubscribe()
      innerUnsubscribe = null
    }
  }

  const subscribeLegacyActive = () => {
    clearInner()
    const q = query(
      collection(db, "attendance"),
      where("userId", "==", userId),
      where("status", "==", "active"),
    )

    innerUnsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const sessions = snapshot.docs.map((doc) => normalizeAttendanceDoc(doc.id, doc.data()))
        onChange(selectLatestActiveSession(sessions))
      },
      (error) => {
        onError?.(error as Error)
      },
    )
  }

  const lockUnsubscribe = onSnapshot(
    doc(db, ACTIVE_SESSION_LOCKS_COLLECTION, userId),
    (snapshot) => {
      const lockedSessionId = snapshot.exists() ? String((snapshot.data() as any)?.activeSessionId || "") : ""
      if (!lockedSessionId) {
        subscribeLegacyActive()
        return
      }

      clearInner()
      innerUnsubscribe = onSnapshot(
        doc(db, "attendance", lockedSessionId),
        (sessionSnap) => {
          if (!sessionSnap.exists()) {
            subscribeLegacyActive()
            return
          }
          const session = normalizeAttendanceDoc(sessionSnap.id, sessionSnap.data())
          if (session.userId !== userId || session.status !== "active") {
            subscribeLegacyActive()
            return
          }
          onChange(session)
        },
        (error) => {
          onError?.(error as Error)
        },
      )
    },
    (error) => {
      onError?.(error as Error)
    }
  )

  return () => {
    clearInner()
    lockUnsubscribe()
  }
}

/**
 * Start tracking extra time (route to client/home)
 */
export async function startExtraTimeLog(request: ExtraTimeRequest): Promise<void> {
  const sessionRef = doc(db, "attendance", request.sessionId)
  const now = getAppNowMs()

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
  const now = getAppNowMs()

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

  const now = getAppNowMs()
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
      createdAt: typeof data.createdAt === 'number' ? data.createdAt : data.createdAt?.toMillis() || getAppNowMs(),
      updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : data.updatedAt?.toMillis() || getAppNowMs(),
    } as AttendanceSession
  })
}
