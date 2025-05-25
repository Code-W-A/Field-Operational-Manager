/**
 * Calculates the duration between arrival and departure times
 * @param arrivalDate - Arrival date in dd-MM-yyyy format
 * @param arrivalTime - Arrival time in HH:mm format
 * @param departureDate - Departure date in dd-MM-yyyy format
 * @param departureTime - Departure time in HH:mm format
 * @returns Object containing hours, minutes, and total minutes
 */
export function calculateDuration(
  arrivalDate?: string,
  arrivalTime?: string,
  departureDate?: string,
  departureTime?: string,
): { hours: number; minutes: number; totalMinutes: number } | null {
  if (!arrivalDate || !arrivalTime || !departureDate || !departureTime) {
    return null
  }

  try {
    // Parse dates in dd-MM-yyyy format and times in HH:mm format
    const [arrivalDay, arrivalMonth, arrivalYear] = arrivalDate.split("-").map(Number)
    const [arrivalHour, arrivalMinute] = arrivalTime.split(":").map(Number)

    const [departureDay, departureMonth, departureYear] = departureDate.split("-").map(Number)
    const [departureHour, departureMinute] = departureTime.split(":").map(Number)

    // Create Date objects
    const arrivalDateTime = new Date(
      arrivalYear,
      arrivalMonth - 1, // JavaScript months are 0-indexed
      arrivalDay,
      arrivalHour,
      arrivalMinute,
    )

    const departureDateTime = new Date(departureYear, departureMonth - 1, departureDay, departureHour, departureMinute)

    // Calculate difference in milliseconds
    const diffMs = departureDateTime.getTime() - arrivalDateTime.getTime()

    // Check if the difference is negative (departure before arrival)
    if (diffMs < 0) {
      return null
    }

    // Convert to minutes and hours
    const totalMinutes = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return { hours, minutes, totalMinutes }
  } catch (error) {
    console.error("Error calculating duration:", error)
    return null
  }
}

/**
 * Formats a duration into a human-readable string
 * @param hours - Number of hours
 * @param minutes - Number of minutes
 * @returns Formatted duration string
 */
export function formatDuration(hours: number, minutes: number): string {
  if (hours === 0 && minutes === 0) {
    return "0 minute"
  }

  const hourText = hours === 1 ? "oră" : "ore"
  const minuteText = minutes === 1 ? "minut" : "minute"

  if (hours === 0) {
    return `${minutes} ${minuteText}`
  }

  if (minutes === 0) {
    return `${hours} ${hourText}`
  }

  return `${hours} ${hourText} și ${minutes} ${minuteText}`
}
