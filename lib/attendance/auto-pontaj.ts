"use client"

import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import {
  createCheckIn,
  createCheckOut,
  getActiveSession,
  getSessionsForDateRange,
} from "@/lib/attendance/storage"
import { getCurrentLocation } from "@/lib/attendance/location"
import { localDayBounds } from "@/lib/attendance/auto-pontaj-schedule"
import type { AttendanceLocation, AutoPontajReason } from "@/types/attendance"
import { WORK_STATUS } from "@/lib/utils/constants"

export type AutoPontajResult =
  | { ok: true; sessionId?: string; action: "check_in" | "check_out" }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string }

function isMissingIndexError(error: unknown) {
  const msg = (error as any)?.message || ""
  const code = (error as any)?.code || ""
  return code === "failed-precondition" && String(msg).toLowerCase().includes("requires an index")
}

async function fallbackHasOpenInProgressTicket(displayName: string): Promise<boolean> {
  const snap = await getDocs(
    query(
      collection(db, "lucrari"),
      where("tehnicieni", "array-contains", displayName),
      where("statusLucrare", "==", WORK_STATUS.IN_PROGRESS),
    ),
  )
  return !snap.empty
}

/**
 * Există cel puțin un tichet „În lucru” pentru tehnician (după displayName din tichete).
 */
export async function hasOpenInProgressTicketForTechnician(
  _userId: string,
  displayName: string,
): Promise<boolean> {
  const name = String(displayName || "").trim()
  if (!name) return false
  try {
    const q = query(
      collection(db, "lucrari"),
      where("tehnicieni", "array-contains", name),
      where("statusLucrare", "==", WORK_STATUS.IN_PROGRESS),
    )
    const snap = await getDocs(q)
    return !snap.empty
  } catch (error) {
    if (!isMissingIndexError(error)) throw error
    return fallbackHasOpenInProgressTicket(name)
  }
}

/** Pontaj în ziua locală curentă (activ sau completed). */
export async function hasAttendanceToday(userId: string, atMs: number = Date.now()): Promise<boolean> {
  const { startMs, endMs } = localDayBounds(atMs)
  try {
    const sessions = await getSessionsForDateRange(userId, new Date(startMs), new Date(endMs))
    return sessions.length > 0
  } catch {
    const active = await getActiveSession(userId)
    if (active) {
      const { startMs: dayStart, endMs: dayEnd } = localDayBounds(atMs)
      return active.sessionStart >= dayStart && active.sessionStart <= dayEnd
    }
    return false
  }
}

export async function canAutoCheckIn(userId: string, atMs: number = Date.now()): Promise<{ allowed: boolean; reason?: string }> {
  if (!userId) return { allowed: false, reason: "missing_user" }
  const active = await getActiveSession(userId)
  if (active) return { allowed: false, reason: "active_session" }
  if (await hasAttendanceToday(userId, atMs)) return { allowed: false, reason: "already_checked_in_today" }
  return { allowed: true }
}

async function resolveAutoLocation(): Promise<AttendanceLocation> {
  try {
    return await getCurrentLocation()
  } catch {
    return { lat: 0, lng: 0, address: "auto (fără GPS)" }
  }
}

export async function ensureAutoCheckInFromFirstQr(params: {
  userId: string
  userName?: string
  atMs?: number
}): Promise<AutoPontajResult> {
  const atMs = params.atMs ?? Date.now()
  const gate = await canAutoCheckIn(params.userId, atMs)
  if (!gate.allowed) {
    return { ok: false, skipped: true, reason: gate.reason || "not_allowed" }
  }

  try {
    const location = await resolveAutoLocation()
    const sessionId = await createCheckIn({
      userId: params.userId,
      userName: params.userName,
      mode: "field",
      location,
      deviceInfo: {
        type: "auto",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "auto",
        reason: "first_qr",
      },
      sessionStartMs: atMs,
      checkInAuto: true,
      checkInAutoReason: "first_qr",
    })
    return { ok: true, sessionId, action: "check_in" }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, skipped: false, error: msg }
  }
}

export async function canAutoCheckOut(
  userId: string,
  options: { forceEndOfDay?: boolean; technicianDisplayName?: string } = {},
): Promise<{ allowed: boolean; reason?: string; sessionId?: string }> {
  const active = await getActiveSession(userId)
  if (!active) return { allowed: false, reason: "no_active_session" }

  if (!options.forceEndOfDay) {
    const name = String(options.technicianDisplayName || "").trim()
    if (name && (await hasOpenInProgressTicketForTechnician(userId, name))) {
      return { allowed: false, reason: "open_ticket_in_progress", sessionId: active.id }
    }
  }

  return { allowed: true, sessionId: active.id }
}

export async function ensureAutoCheckOut(params: {
  userId: string
  userName?: string
  atMs?: number
  reason: AutoPontajReason
  technicianDisplayName?: string
  forceEndOfDay?: boolean
}): Promise<AutoPontajResult> {
  const atMs = params.atMs ?? Date.now()
  const gate = await canAutoCheckOut(params.userId, {
    forceEndOfDay: params.forceEndOfDay,
    technicianDisplayName: params.technicianDisplayName,
  })
  if (!gate.allowed || !gate.sessionId) {
    return { ok: false, skipped: true, reason: gate.reason || "not_allowed" }
  }

  const active = await getActiveSession(params.userId)
  if (!active) {
    return { ok: false, skipped: true, reason: "no_active_session" }
  }

  try {
    const location = await resolveAutoLocation()
    await createCheckOut({
      sessionId: gate.sessionId,
      mode: active.mode ?? "field",
      location,
      deviceInfo: {
        type: "auto",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "auto",
        reason: params.reason,
      },
      sessionEndMs: atMs,
      skipMinimumDurationCheck: true,
      checkOutAuto: true,
      checkOutAutoReason: params.reason,
      autoStopped: params.reason === "eod_force",
    })
    return { ok: true, sessionId: gate.sessionId, action: "check_out" }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, skipped: false, error: msg }
  }
}
