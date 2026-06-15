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
import { AUTO_CHECKOUT_ENABLED, localDayBounds } from "@/lib/attendance/auto-pontaj-schedule"
import { technicianHasUnfinishedWorkToday, type RemainingWorkTicket } from "@/lib/attendance/remaining-work"
import { toDateSafe } from "@/lib/utils/time-format"
import type { AttendanceLocation, AutoPontajReason } from "@/types/attendance"

export type AutoPontajResult =
  | { ok: true; sessionId?: string; action: "check_in" | "check_out" }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string }

/**
 * Tehnicianul mai are cel puțin o lucrare neterminată programată AZI (după displayName din tichete).
 * Folosit pentru a NU deponta automat la primul raport semnat când mai sunt lucrări de făcut în ziua curentă.
 *
 * Notă: Firestore nu permite `array-contains` + `in` în aceeași interogare, așa că filtrăm statusurile
 * și data client-side prin `technicianHasUnfinishedWorkToday` (interogarea folosește doar `array-contains`,
 * deci nu necesită index compus).
 */
export async function hasUnfinishedWorkForTechnicianToday(
  displayName: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const name = String(displayName || "").trim()
  if (!name) return false

  const snap = await getDocs(
    query(collection(db, "lucrari"), where("tehnicieni", "array-contains", name)),
  )

  const tickets: RemainingWorkTicket[] = snap.docs.map((d) => {
    const data = d.data() as any
    return {
      statusLucrare: String(data?.statusLucrare ?? ""),
      interventionMs: toDateSafe(data?.dataInterventie)?.getTime() ?? null,
    }
  })

  return technicianHasUnfinishedWorkToday(tickets, nowMs)
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
  options: { forceEndOfDay?: boolean; technicianDisplayName?: string; atMs?: number } = {},
): Promise<{ allowed: boolean; reason?: string; sessionId?: string }> {
  const active = await getActiveSession(userId)
  if (!active) return { allowed: false, reason: "no_active_session" }

  if (!options.forceEndOfDay) {
    const name = String(options.technicianDisplayName || "").trim()
    if (name && (await hasUnfinishedWorkForTechnicianToday(name, options.atMs ?? Date.now()))) {
      return { allowed: false, reason: "remaining_work_today", sessionId: active.id }
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
  if (!AUTO_CHECKOUT_ENABLED) {
    return { ok: false, skipped: true, reason: "auto_checkout_disabled" }
  }

  const atMs = params.atMs ?? Date.now()
  const gate = await canAutoCheckOut(params.userId, {
    forceEndOfDay: params.forceEndOfDay,
    technicianDisplayName: params.technicianDisplayName,
    atMs,
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
