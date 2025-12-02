/**
 * Formatează o dată în formatul DD.MM.YYYY
 * @param date Data care trebuie formatată
 * @returns String formatat
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const year = d.getFullYear()
  return `${day}.${month}.${year}`
}

/**
 * Formatează timpul în formatul HH:MM
 * @param date Data care trebuie formatată
 * @returns String formatat
 */
export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const hours = d.getHours().toString().padStart(2, "0")
  const minutes = d.getMinutes().toString().padStart(2, "0")
  return `${hours}:${minutes}`
}

/**
 * Formatează timpul în formatul HH:MM (24h)
 * @param date Data din care se extrage timpul
 * @returns String formatat
 */
export function formatTime24(date: Date): string {
  return formatTime(date)
}

/**
 * Formatează data și timpul în formatul DD.MM.YYYY HH:MM
 * @param date Data care trebuie formatată
 * @returns String formatat
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  return `${formatDate(d)} ${formatTime(d)}`
}

/**
 * Formatează data și timpul în formatul DD.MM.YYYY HH:MM (24h)
 * @param date Data care trebuie formatată
 * @returns String formatat
 */
export function formatDateTime24(date: Date): string {
  return `${formatDate(date)} ${formatTime24(date)}`
}

/**
 * Convert a variety of date-like values to a valid Date object.
 * Supports Firestore Timestamp, {seconds,nanoseconds}, ISO string, "dd.MM.yyyy" or "dd.MM.yyyy HH:mm", and Date.
 */
export function toDateSafe(val: any): Date | null {
  try {
    if (!val) return null
    if (typeof val?.toDate === "function") return val.toDate()
    if (typeof val?.seconds === "number") {
      return new Date(val.seconds * 1000)
    }
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val
    if (typeof val === "string") {
      // Accept ONLY strict ISO-like strings for native Date parsing to avoid dd.MM ambiguity
      const isIsoLike = /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+\-]\d{2}:?\d{2})?)?$/.test(val)
      if (isIsoLike) {
        const iso = new Date(val)
        if (!isNaN(iso.getTime())) return iso
      }
      // Fallback dd.MM.yyyy [HH:mm]
      const [datePart, timePart = "00:00"] = val.trim().split(" ")
      const [dd, mm, yyyy] = datePart.split(".").map((x) => parseInt(x, 10))
      const [HH, MM] = timePart.split(":").map((x) => parseInt(x, 10))
      if (yyyy && mm && dd) {
        const d = new Date(yyyy, (mm - 1) as number, dd, HH || 0, MM || 0, 0, 0)
        return isNaN(d.getTime()) ? null : d
      }
    }
  } catch {}
  return null
}

/**
 * Format any date-like value to "dd.MM.yyyy HH:mm" safely (RO).
 */
export function formatDateTimeSafe(val: any): string {
  const d = toDateSafe(val)
  if (!d) return "-"
  const day = d.getDate().toString().padStart(2, "0")
  const month = (d.getMonth() + 1).toString().padStart(2, "0")
  const year = d.getFullYear()
  const hours = d.getHours().toString().padStart(2, "0")
  const minutes = d.getMinutes().toString().padStart(2, "0")
  return `${day}.${month}.${year} ${hours}:${minutes}`
}

/**
 * UI only: Formatează data ca "dd MMM yyyy" (ex: 29 Nov 2025).
 * Acceptă Date sau string; pentru Firestore Timestamp treceți .toDate() înainte.
 */
export function formatUiDate(dateLike: any): string {
  try {
    let d: Date
    if (!dateLike) return "-"
    if (dateLike?.toDate && typeof dateLike.toDate === "function") {
      d = dateLike.toDate()
    } else if (typeof dateLike?.seconds === "number") {
      d = new Date(dateLike.seconds * 1000)
    } else if (dateLike instanceof Date) {
      d = dateLike
    } else {
      d = new Date(dateLike)
    }
    if (isNaN(d.getTime())) return "-"
    const day = d.getDate().toString().padStart(2, "0")
    // Romanian short month names, lowercase
    const monthShort = ["ian","feb","mar","apr","mai","iun","iul","aug","sep","oct","nov","dec"][d.getMonth()]
    const year = d.getFullYear()
    return `${day} ${monthShort} ${year}`
  } catch {
    return "-"
  }
}

/**
 * Calculează durata între două timestamp-uri și o formatează ca "Xh Ym"
 * @param startTime Timestamp de început (ISO string)
 * @param endTime Timestamp de sfârșit (ISO string sau Date)
 * @returns String formatat cu durata
 */
export function calculateDuration(startTime: string, endTime: string | Date): string {
  const start = new Date(startTime)
  const end = typeof endTime === "string" ? new Date(endTime) : endTime

  // Calculăm diferența în milisecunde
  const diffMs = end.getTime() - start.getTime()

  // Convertim în minute
  const diffMinutes = Math.floor(diffMs / 60000)

  // Calculăm orele și minutele
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60

  // Formatăm rezultatul mereu ca "Xh Ym"
  return `${hours}h ${minutes}m`
}
