import { format } from "date-fns"
import { ro } from "date-fns/locale"
import { parse, isValid as dateFnsIsValid, differenceInMinutes } from "date-fns"

/**
 * Formats a date to Romanian format with 24-hour time
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatRomanianDateTime(date: Date): string {
  return format(date, "dd.MM.yyyy HH:mm", { locale: ro })
}

/**
 * Parses a Romanian format date string to a Date object
 * @param dateString Date string in format "dd.MM.yyyy HH:mm"
 * @returns Date object
 */
export function parseRomanianDateTime(dateTimeStr: string): Date | null {
  try {
    return parse(dateTimeStr, "dd.MM.yyyy HH:mm", new Date())
  } catch (error) {
    console.error("Error parsing date:", error)
    return null
  }
}

/**
 * Extracts time in 24-hour format from a Date object
 * @param date Date object
 * @returns Time string in format "HH:mm"
 */
export function extractTime24(date: Date): string {
  return format(date, "HH:mm")
}

export function isValid(date: Date): boolean {
  return dateFnsIsValid(date)
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

export { differenceInMinutes }
