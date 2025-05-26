import { format } from "date-fns"
import { ro } from "date-fns/locale"

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
export function parseRomanianDateTime(dateString: string): Date | null {
  try {
    if (!dateString) return null

    // If the date is already in a different format, try to parse it
    if (!dateString.includes(".") || !dateString.includes(":")) {
      return new Date(dateString)
    }

    // Split the date and time parts
    const [datePart, timePart] = dateString.split(" ")

    if (!datePart) return null

    // Split the date components
    const [day, month, year] = datePart.split(".")
    const [hour, minute] = timePart ? timePart.split(":") : ["00", "00"]

    if (!day || !month || !year) return null

    // Create a date object
    return new Date(
      Number.parseInt(year),
      Number.parseInt(month) - 1,
      Number.parseInt(day),
      Number.parseInt(hour),
      Number.parseInt(minute),
    )
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
