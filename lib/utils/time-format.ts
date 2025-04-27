import { format, parse } from "date-fns"
import { ro } from "date-fns/locale"

/**
 * Formats a date to Romanian format with 24-hour time
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatDateTime24(date: Date): string {
  return format(date, "dd.MM.yyyy HH:mm", { locale: ro })
}

/**
 * Formats just the time portion in 24-hour format
 * @param date Date to format
 * @returns Time string in 24-hour format
 */
export function formatTime24(date: Date): string {
  return format(date, "HH:mm", { locale: ro })
}

/**
 * Parses a date string in Romanian format with 24-hour time
 * @param dateString Date string in format "dd.MM.yyyy HH:mm"
 * @returns Date object
 */
export function parseDateTime24(dateString: string): Date | null {
  try {
    return parse(dateString, "dd.MM.yyyy HH:mm", new Date())
  } catch (error) {
    console.error("Error parsing date:", error)
    return null
  }
}
