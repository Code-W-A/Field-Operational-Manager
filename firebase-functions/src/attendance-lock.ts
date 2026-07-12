export function getLockedAttendanceSessionId(lockData: unknown): string {
  if (!lockData || typeof lockData !== "object") return ""
  const value = lockData as { activeSessionId?: unknown; sessionId?: unknown }
  return String(value.activeSessionId || value.sessionId || "")
}
