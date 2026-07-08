export interface ActiveSessionLock {
  userId: string
  activeSessionId?: string | null
  sessionStart?: number | null
  employeeId?: string | null
}

export interface LockSessionSnapshot {
  id: string
  userId?: string | null
  status?: string | null
  sessionStart?: number | null
}

export function shouldBlockCheckInForLock(session: LockSessionSnapshot | null): boolean {
  return Boolean(session && session.status === "active")
}

export function shouldBlockCheckoutForLock(params: {
  requestedSessionId: string
  lockedSession: LockSessionSnapshot | null
}): boolean {
  const locked = params.lockedSession
  return Boolean(locked && locked.id !== params.requestedSessionId && locked.status === "active")
}

export function selectLatestActiveSession<T extends LockSessionSnapshot>(sessions: T[]): T | null {
  return (
    sessions
      .filter((session) => session.status === "active")
      .sort((a, b) => (b.sessionStart ?? 0) - (a.sessionStart ?? 0))[0] ?? null
  )
}
