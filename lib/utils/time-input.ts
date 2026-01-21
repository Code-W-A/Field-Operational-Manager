export function isValidTimeHHmm(val: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(val)
}

/**
 * Normalize a user-entered time to strict "HH:mm" (24h).
 *
 * Accepts loose inputs like:
 * - "8" -> "08:00"
 * - "830" -> "08:30"
 * - "0830" -> "08:30"
 * - "8:3" -> "08:03"
 * - "8:30" -> "08:30"
 *
 * Returns:
 * - "" for empty input
 * - null if input cannot be parsed or is out of range
 */
export function normalizeTimeHHmmLoose(input: string): string | null {
  const raw = String(input ?? "").trim()
  if (!raw) return ""

  let hStr = ""
  let mStr = ""

  if (raw.includes(":")) {
    const [hPart = "", mPart = ""] = raw.split(":")
    hStr = hPart.replace(/[^\d]/g, "")
    mStr = mPart.replace(/[^\d]/g, "")
    if (!hStr) return null
    if (!mStr) mStr = "00"
    if (mStr.length === 1) mStr = `0${mStr}`
    if (mStr.length !== 2) return null
  } else {
    const digits = raw.replace(/[^\d]/g, "")
    if (!digits) return null
    if (digits.length === 1 || digits.length === 2) {
      hStr = digits
      mStr = "00"
    } else if (digits.length === 3) {
      hStr = digits.slice(0, 1)
      mStr = digits.slice(1)
    } else if (digits.length === 4) {
      hStr = digits.slice(0, 2)
      mStr = digits.slice(2)
    } else {
      return null
    }
  }

  const h = Number.parseInt(hStr, 10)
  const m = Number.parseInt(mStr, 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23) return null
  if (m < 0 || m > 59) return null

  const out = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
  return isValidTimeHHmm(out) ? out : null
}

