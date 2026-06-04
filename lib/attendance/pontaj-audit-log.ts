import { addUserLogEntry } from "@/lib/firebase/firestore"

/** Oglindă minimală a rezultatului din syncAttendanceUserDayToTimesheet (evită import circular). */
export type PontajCondicaSyncResult =
  | {
      synced: true
      reason: "synced"
      employeeId: string
      sessionCount: number
      totalHours: number
      monthKey: string
      day: number
    }
  | {
      synced: false
      reason: "no_sessions" | "no_employee" | "protected_day"
      sessionCount: number
      employeeId?: string
      monthKey: string
      day: number
    }

function localDateLabel(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/**
 * Audit pontaj în colecția `logs` (categorie „Pontaj”). Non-blocant prin addUserLogEntry.
 */
export function logPontajPlay(params: {
  userId: string
  userDisplayName?: string
  employeeId?: string
  sessionId: string
  sessionStartMs: number
  auto?: boolean
  reason?: string
}): void {
  const day = localDateLabel(params.sessionStartMs)
  const autoSuffix = params.auto ? ` • automat${params.reason ? ` (${params.reason})` : ""}` : ""
  const detalii = `Play${autoSuffix} • sesiune ${params.sessionId} • zi ${day}`
  void addUserLogEntry({
    utilizator: params.userDisplayName,
    utilizatorId: params.userId,
    actiune: "Pontaj Play",
    detalii,
    tip: "Informație",
    categorie: "Pontaj",
    actionOutcome: "success",
    entityType: "AttendanceSession",
    entityId: params.sessionId,
    metadata: {
      userId: params.userId,
      employeeId: params.employeeId ?? null,
      sessionId: params.sessionId,
      day,
      sessionStartMs: params.sessionStartMs,
      auto: params.auto ?? false,
      autoReason: params.reason ?? null,
    },
  })
}

export function logPontajStop(params: {
  userId: string
  userDisplayName?: string
  employeeId?: string
  sessionId: string
  sessionStartMs: number
  sessionEndMs: number
  auto?: boolean
  reason?: string
}): void {
  const day = localDateLabel(params.sessionStartMs)
  const autoSuffix = params.auto ? ` • automat${params.reason ? ` (${params.reason})` : ""}` : ""
  const detalii = `Stop${autoSuffix} • sesiune ${params.sessionId} • zi ${day}`
  void addUserLogEntry({
    utilizator: params.userDisplayName,
    utilizatorId: params.userId,
    actiune: "Pontaj Stop",
    detalii,
    tip: "Informație",
    categorie: "Pontaj",
    actionOutcome: "success",
    entityType: "AttendanceSession",
    entityId: params.sessionId,
    metadata: {
      userId: params.userId,
      employeeId: params.employeeId ?? null,
      sessionId: params.sessionId,
      day,
      sessionStartMs: params.sessionStartMs,
      sessionEndMs: params.sessionEndMs,
      auto: params.auto ?? false,
      autoReason: params.reason ?? null,
    },
  })
}

/** Apelat la fiecare ieșire din syncAttendanceUserDayToTimesheet (sursă unică pentru condică). */
export function logPontajCondicaSync(
  userId: string,
  result: PontajCondicaSyncResult,
  options?: { existingCode?: string },
): void {
  const baseMeta = {
    userId,
    synced: result.synced,
    reason: result.reason,
    monthKey: result.monthKey,
    day: result.day,
    sessionCount: result.sessionCount,
    ...(result.synced
      ? { employeeId: result.employeeId, totalHours: result.totalHours }
      : { employeeId: result.employeeId ?? null }),
    ...(options?.existingCode ? { existingCode: options.existingCode } : {}),
  }

  if (result.synced) {
    const detalii = `Condică actualizată • ${result.monthKey} zi ${result.day} • ${result.sessionCount} sesiuni • ${result.totalHours}h • salariat ${result.employeeId}`
    void addUserLogEntry({
      utilizatorId: userId,
      actiune: "Pontaj condică sync",
      detalii,
      tip: "Informație",
      categorie: "Pontaj",
      actionOutcome: "success",
      entityType: "HrTimesheet",
      entityId: `${result.employeeId}_${result.monthKey}`,
      metadata: baseMeta,
    })
    return
  }

  const reasonLabels: Record<string, string> = {
    no_sessions: "fără sesiuni completed în zi",
    no_employee: "salariat nerezolvat (userUid / mapare)",
    protected_day: "zi protejată (CO/CFP/CM/IN)",
  }
  const detalii = `Fără sync condică • ${result.monthKey} zi ${result.day} • ${reasonLabels[result.reason] || result.reason}`
  const tip = result.reason === "protected_day" ? "Avertisment" : "Avertisment"

  void addUserLogEntry({
    utilizatorId: userId,
    actiune: "Pontaj condică sync",
    detalii,
    tip,
    categorie: "Pontaj",
    actionOutcome: "fail",
    entityType: "HrTimesheet",
    entityId: result.employeeId ? `${result.employeeId}_${result.monthKey}` : `${userId}_${result.monthKey}`,
    metadata: baseMeta,
  })
}

export function logPontajCondicaSyncError(userId: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  const short = msg.length > 220 ? `${msg.slice(0, 217)}…` : msg
  void addUserLogEntry({
    utilizatorId: userId,
    actiune: "Pontaj condică sync",
    detalii: `Eroare la sincronizare: ${short}`,
    tip: "Eroare",
    categorie: "Pontaj",
    actionOutcome: "fail",
    errorMessage: short,
    metadata: { userId, phase: "sync_exception" },
  })
}
