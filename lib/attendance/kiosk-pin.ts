export const KIOSK_PIN_ELIGIBLE_ROLES = ["tehnician", "admin", "dispecer"] as const

export type KioskPinEligibleRole = (typeof KIOSK_PIN_ELIGIBLE_ROLES)[number]

/** Exact 4 digits (0-9), as string — preserves leading zeros (e.g. "0400"). */
export function isValidKioskPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value)
}

export function normalizeKioskPinInput(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 4)
}

/**
 * Normalize a PIN as stored in Firestore / roster.
 * Recovers leading zeros lost when a value was coerced to a number (e.g. 400 → "0400").
 */
export function normalizeStoredKioskPin(value: unknown): string | null {
  if (value == null || value === "") return null

  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 9999) return null
    return String(value).padStart(4, "0")
  }

  if (typeof value === "string") {
    const digits = value.trim()
    if (!/^\d{1,4}$/.test(digits)) return null
    return digits.padStart(4, "0")
  }

  return null
}

export function isKioskPinEligibleRole(role: unknown): role is KioskPinEligibleRole {
  return KIOSK_PIN_ELIGIBLE_ROLES.includes(role as KioskPinEligibleRole)
}

/**
 * Returns a Firestore-ready kioskPin value, or null when the field should be cleared.
 * Always returns a 4-digit string (never a number) so leading zeros are preserved.
 * Invalid non-empty values throw.
 */
export function resolveKioskPinForSave(params: {
  role: unknown
  kioskPin: unknown
}): string | null {
  if (!isKioskPinEligibleRole(params.role)) {
    return null
  }

  const raw = String(params.kioskPin ?? "").trim()
  if (!raw) {
    return null
  }

  // UI must provide exactly 4 digits (including leading zeros typed by admin).
  if (!isValidKioskPin(raw)) {
    throw new Error("PIN-ul kiosk trebuie să aibă exact 4 cifre.")
  }
  return raw
}
