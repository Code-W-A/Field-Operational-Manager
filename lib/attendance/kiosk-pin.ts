export const KIOSK_PIN_ELIGIBLE_ROLES = ["tehnician", "admin", "dispecer"] as const

export type KioskPinEligibleRole = (typeof KIOSK_PIN_ELIGIBLE_ROLES)[number]

/** Exact 4 digits (0-9). */
export function isValidKioskPin(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}$/.test(value)
}

export function normalizeKioskPinInput(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").slice(0, 4)
}

export function isKioskPinEligibleRole(role: unknown): role is KioskPinEligibleRole {
  return KIOSK_PIN_ELIGIBLE_ROLES.includes(role as KioskPinEligibleRole)
}

/**
 * Returns a Firestore-ready kioskPin value, or null when the field should be cleared.
 * Invalid non-empty values throw.
 */
export function resolveKioskPinForSave(params: {
  role: unknown
  kioskPin: unknown
}): string | null {
  const raw = String(params.kioskPin ?? "").trim()
  if (!isKioskPinEligibleRole(params.role)) {
    return null
  }
  if (!raw) {
    return null
  }
  if (!isValidKioskPin(raw)) {
    throw new Error("PIN-ul kiosk trebuie să aibă exact 4 cifre.")
  }
  return raw
}
