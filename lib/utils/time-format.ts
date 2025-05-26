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
