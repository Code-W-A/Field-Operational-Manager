// Funcții utilitare pentru formatarea datelor și timpului

/**
 * Formatează o dată în formatul DD.MM.YYYY
 * @param date Data care trebuie formatată
 * @returns String formatat
 */
export function formatDate(date: Date): string {
  const day = date.getDate().toString().padStart(2, "0")
  const month = (date.getMonth() + 1).toString().padStart(2, "0")
  const year = date.getFullYear()

  return `${day}.${month}.${year}`
}

/**
 * Formatează timpul în formatul HH:MM
 * @param date Data din care se extrage timpul
 * @returns String formatat
 */
export function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0")
  const minutes = date.getMinutes().toString().padStart(2, "0")

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
 * Formatează data în formatul DD.MM.YYYY HH:MM
 * @param date Data care trebuie formatată
 * @returns String formatat
 */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

/**
 * Formatează data în formatul DD.MM.YYYY HH:MM (24h)
 * @param date Data care trebuie formatată
 * @returns String formatat
 */
export function formatDateTime24(date: Date): string {
  return `${formatDate(date)} ${formatTime24(date)}`
}

/**
 * Calculează durata dintre două timestamp-uri și o formatează ca "Xh Ym"
 * @param startTime Timestamp de început (ISO string)
 * @param endTime Timestamp de sfârșit (ISO string sau Date)
 * @returns String formatat cu durata
 */
export function calculateDuration(startTime: string, endTime: string | Date): string {
  const start = new Date(startTime)
  const end = endTime instanceof Date ? endTime : new Date(endTime)

  // Calculăm diferența în milisecunde
  const diffMs = end.getTime() - start.getTime()

  // Convertim în minute și ore
  const diffMinutes = Math.floor(diffMs / 60000)
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60

  // Formatăm rezultatul
  if (hours === 0) {
    return `${minutes}m`
  } else if (minutes === 0) {
    return `${hours}h`
  } else {
    return `${hours}h ${minutes}m`
  }
}
