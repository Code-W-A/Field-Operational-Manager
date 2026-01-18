import { format, isValid, parse } from "date-fns"
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
 * Formats a date to Romanian dot format "dd.MM.yyyy"
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatRomanianDateDots(date: Date): string {
  return format(date, "dd.MM.yyyy", { locale: ro })
}

/**
 * Formats an ISO date string (yyyy-mm-dd) to Romanian dot format "dd.MM.yyyy"
 * @param isoDate ISO date string
 * @returns Formatted date string
 */
export function formatRomanianDateDotsISO(isoDate: string): string {
  if (!isoDate) return ""
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ""
  return formatRomanianDateDots(d)
}

/**
 * Formats a date to Romanian display format "dd MMM yyyy"
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatRomanianDate(date: Date): string {
  return format(date, "dd MMM yyyy", { locale: ro })
}

/**
 * Formats an ISO date string (yyyy-mm-dd) to Romanian display format "dd MMM yyyy"
 * @param isoDate ISO date string
 * @returns Formatted date string
 */
export function formatRomanianDateISO(isoDate: string): string {
  if (!isoDate) return ""
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return ""
  return formatRomanianDate(d)
}

/**
 * Parses a Romanian date string "dd MMM yyyy" to a Date object.
 * @param value Date string in format "dd MMM yyyy"
 * @returns Date object or null
 */
export function parseRomanianDateString(value: string): Date | null {
  if (!value) return null
  const parsed = parse(value.trim(), "dd MMM yyyy", new Date(), { locale: ro })
  if (!isValid(parsed)) return null
  return parsed
}

/**
 * Formats a Date object to ISO date string "yyyy-MM-dd"
 * @param date Date to format
 * @returns ISO date string
 */
export function formatISODate(date: Date): string {
  return format(date, "yyyy-MM-dd")
}

/**
 * Formats a date to Romanian display format "dd MMM yyyy HH:mm"
 * @param date Date to format
 * @returns Formatted date string
 */
export function formatRomanianDateTimeLong(date: Date): string {
  return format(date, "dd MMM yyyy HH:mm", { locale: ro })
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
