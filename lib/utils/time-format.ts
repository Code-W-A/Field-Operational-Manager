/**
 * Utility functions for formatting dates and times
 */

// Format a date to DD.MM.YYYY
export function formatDate(date: Date): string {
  return date.toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// Format a time to HH:MM (24-hour format)
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

// Format a date and time to DD.MM.YYYY HH:MM (24-hour format)
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${formatTime(date)}`
}

// Format a time to HH:MM (24-hour format) - named export for compatibility
export function formatTime24(date: Date): string {
  return formatTime(date)
}

// Format a date and time to DD.MM.YYYY HH:MM (24-hour format) - named export for compatibility
export function formatDateTime24(date: Date): string {
  return formatDateTime(date)
}

// Calculate duration between two ISO timestamps and return as "Xh Ym" format
export function calculateDuration(startTimeISO: string, endTimeISO: string | Date): string {
  const startTime = new Date(startTimeISO)
  const endTime = endTimeISO instanceof Date ? endTimeISO : new Date(endTimeISO)

  const diffMs = endTime.getTime() - startTime.getTime()

  if (diffMs <= 0) {
    return "0m"
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (diffHours === 0) {
    return `${diffMinutes}m`
  } else if (diffMinutes === 0) {
    return `${diffHours}h`
  } else {
    return `${diffHours}h ${diffMinutes}m`
  }
}
