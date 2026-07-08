/**
 * Kill-switch pentru depontarea automată AGRESIVĂ din timpul zilei
 * (program + grace și raport semnat). Rămâne `false` până la fix-ul cauzei.
 */
export const AUTO_CHECKOUT_ENABLED = false

/**
 * Plasă de siguranță: depontarea automată la sfârșitul zilei (23:59).
 * Este sigură (nu închide pe nimeni în timpul programului) și previne
 * sesiunile uitate deschise care se acumulează zile la rând.
 */
export const AUTO_EOD_STOP_ENABLED = true

/** Minutes after programLucruEnd before auto depontaj (ex. 17:00 + 30 = 17:30). */
export const DEPONTAJ_AUTO_GRACE_MINUTES = 30

const DEFAULT_PROGRAM_END = "16:30"

function parseHHmm(value: string | undefined, fallback: { h: number; m: number }) {
  if (!value) return fallback
  const [hStr, mStr] = String(value).trim().split(":")
  const h = Number(hStr)
  const m = Number(mStr)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback
  if (h < 0 || h > 23 || m < 0 || m > 59) return fallback
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

/** Sfârșitul zilei locale (23:59:59.999) pentru un timestamp de referință. */
export function endOfLocalDayMs(referenceMs: number): number {
  const d = new Date(referenceMs)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/**
 * Ora de final facturată pentru o sesiune lăsată deschisă peste ziua ei (Stop uitat).
 * Decizie de business: facturăm la ora de final a programului din ziua de START a sesiunii.
 * Dacă programul lipsește sau este înainte de startul sesiunii (ex. ture de seară),
 * cădem pe sfârșitul zilei, astfel încât rezultatul rămâne mereu în ziua de start și > start.
 */
export function forgottenSessionEndMs(
  sessionStartMs: number,
  programLucruEnd: string | undefined,
): number {
  const programEnd = timeOnSameDayMs(sessionStartMs, programLucruEnd ?? DEFAULT_PROGRAM_END, { h: 16, m: 30 })
  if (programEnd > sessionStartMs) return programEnd
  return endOfLocalDayMs(sessionStartMs)
}

/**
 * Limitează ora de Stop astfel încât o singură sesiune să nu poată înregistra
 * niciodată mai mult decât ziua ei locală.
 * - Stop în aceeași zi: întoarce ora cerută nemodificată (inclusiv ture târzii, ex. 18:00).
 * - Sesiune uitată (trece de ziua de start): facturează la ora de final a programului
 *   din ziua de start (vezi `forgottenSessionEndMs`).
 */
export function clampSessionEndMs(
  sessionStartMs: number,
  requestedEndMs: number,
  programLucruEnd: string | undefined,
): number {
  if (!Number.isFinite(requestedEndMs)) return forgottenSessionEndMs(sessionStartMs, programLucruEnd)
  if (requestedEndMs <= endOfLocalDayMs(sessionStartMs)) return requestedEndMs
  return forgottenSessionEndMs(sessionStartMs, programLucruEnd)
}
