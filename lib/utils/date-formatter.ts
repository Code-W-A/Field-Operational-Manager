/**
 * Formats a date string from "dd.MM.yyyy HH:mm" to a more readable format
 * @param dateString Date string in format "dd.MM.yyyy HH:mm"
 * @returns Formatted date string
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

    // Create a formatted date
    const months = [
      "ianuarie",
      "februarie",
      "martie",
      "aprilie",
      "mai",
      "iunie",
      "iulie",
      "august",
      "septembrie",
      "octombrie",
      "noiembrie",
      "decembrie",
    ]

    const monthName = months[Number.parseInt(month) - 1] || month

    // Format with or without time
    if (timePart) {
      return `${day} ${monthName} ${year}, ora ${timePart}`
    } else {
      return `${day} ${monthName} ${year}`
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
