/** Minutes after programLucruEnd before auto depontaj (ex. 17:00 + 30 = 17:30). */
export const DEPONTAJ_AUTO_GRACE_MINUTES = 30

const DEFAULT_PROGRAM_END = "16:30"

function parseHHmm(value: string | undefined, fallback: { h: number; m: number }) {
  if (!value) return fallback
  const [hStr, mStr] = String(value).trim().split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  return { h, m }
}

/** Local calendar day bounds for a reference timestamp. */
export function localDayBounds(referenceMs: number = Date.now()) {
  const start = new Date(referenceMs)
  start.setHours(0, 0, 0, 0)
  const end = new Date(referenceMs)
  end.setHours(23, 59, 59, 999)
  return { startMs: start.getTime(), endMs: end.getTime() }
}

export function timeOnSameDayMs(
  ts: number,
  hhmm: string | undefined,
  fallback: { h: number; m: number } = { h: 16, m: 30 },
) {
  const d = new Date(ts)
  const { h, m } = parseHHmm(hhmm, fallback)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/**
 * Timestamp when auto depontaj at program end + grace becomes eligible (local day of referenceMs).
 */
export function scheduleGraceThresholdMs(
  referenceMs: number,
  programLucruEnd: string | undefined,
  graceMinutes: number = DEPONTAJ_AUTO_GRACE_MINUTES,
): number {
  const endMs = timeOnSameDayMs(referenceMs, programLucruEnd ?? DEFAULT_PROGRAM_END, { h: 16, m: 30 })
  return endMs + graceMinutes * 60 * 1000
}

export function isAtOrPastScheduleGrace(
  nowMs: number,
  programLucruEnd: string | undefined,
  graceMinutes: number = DEPONTAJ_AUTO_GRACE_MINUTES,
): boolean {
  return nowMs >= scheduleGraceThresholdMs(nowMs, programLucruEnd, graceMinutes)
}
