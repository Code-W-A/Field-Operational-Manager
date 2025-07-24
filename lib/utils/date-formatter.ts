/**
 * Formats a date string from "dd.MM.yyyy HH:mm" to standard format "dd.MM.yyyy"
 * @param dateString Date string in format "dd.MM.yyyy HH:mm"
 * @returns Formatted date string in dd.MM.yyyy format
 */
export function formatDate(dateString: string): string {
  try {
    if (!dateString) return ""

    // If the date is already in a different format, return it as is
    if (!dateString.includes(".") && !dateString.includes(":")) {
      return dateString
    }

    // Split the date and time parts
    const [datePart, timePart] = dateString.split(" ")

    if (!datePart) return dateString

    // Split the date components
    const [day, month, yearPart] = datePart.split(".")
    const year = yearPart?.split(" ")[0] || yearPart

    if (!day || !month || !year) return dateString

    // Return in standard dd.MM.yyyy format
    const paddedDay = day.padStart(2, "0")
    const paddedMonth = month.padStart(2, "0")

    // Format with or without time - but always return dd.MM.yyyy format for display
    if (timePart) {
      return `${paddedDay}.${paddedMonth}.${year} ${timePart}`
    } else {
      return `${paddedDay}.${paddedMonth}.${year}`
    }
  } catch (error) {
    // If any error occurs, return the original string
    return dateString
  }
}

/**
 * Formats a date string from "dd.MM.yyyy HH:mm" to a short format "dd.MM.yyyy"
 * @param dateString Date string in format "dd.MM.yyyy HH:mm"
 * @returns Formatted date string
 */
export function formatShortDate(dateString: string): string {
  try {
    if (!dateString) return ""

    // If the date contains time, extract just the date part
    if (dateString.includes(" ")) {
      return dateString.split(" ")[0]
    }

    return dateString
  } catch (error) {
    // If any error occurs, return the original string
    return dateString
  }
}
