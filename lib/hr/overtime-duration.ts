/** Minute permise pentru ore suplimentare (granularitate 30 min). */
export const OVERTIME_MINUTE_OPTIONS = [0, 30] as const

export type OvertimeDurationParts = {
  hours: number
  minutes: number
}

export function snapOvertimeMinutes(minutes: number): (typeof OVERTIME_MINUTE_OPTIONS)[number] {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  if (m <= 15) return 0
  return 30
}

export function overtimeHoursFromParts(hours: number, minutes: number): number {
  const h = Math.max(0, Math.floor(Number(hours) || 0))
  const m = snapOvertimeMinutes(minutes)
  const extraHour = m === 30 ? 0.5 : 0
  return Math.round((h + extraHour) * 100) / 100
}

export function overtimePartsFromHours(totalHours: unknown): OvertimeDurationParts {
  const normalized = normalizeOvertimeHoursValue(totalHours)
  if (normalized <= 0) return { hours: 0, minutes: 0 }

  const totalMinutes = Math.round(normalized * 60)
  const hours = Math.floor(totalMinutes / 60)
  const remainder = totalMinutes % 60
  const minutes = remainder >= 15 ? 30 : 0
  return { hours, minutes }
}

/**
 * Corecție pentru cereri vechi: 15/30/45 au fost introduse ca „minute” într-un câmp etichetat ore.
 */
export function normalizeOvertimeHoursValue(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 0
  if (Number.isInteger(n) && (n === 15 || n === 30 || n === 45)) {
    return Math.round((n / 60) * 100) / 100
  }
  return Math.round(n * 100) / 100
}

export function isValidOvertimeDuration(totalHours: unknown): boolean {
  return normalizeOvertimeHoursValue(totalHours) > 0
}

export function formatOvertimeDuration(totalHours: unknown): string {
  const n = normalizeOvertimeHoursValue(totalHours)
  if (n <= 0) return "—"

  const totalMinutes = Math.round(n * 60)
  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }

  if (totalMinutes % 60 === 0) {
    const wholeHours = totalMinutes / 60
    return `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(wholeHours)} h`
  }

  const formatted = new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n)
  return `${formatted} h`
}
