import type { AttendanceLocation, AttendanceMode } from "@/types/attendance"
import type { OfficeLocation } from "@/lib/firebase/auth"

export type AttendanceLocationErrorCode =
  | "permission_denied"
  | "position_unavailable"
  | "timeout"
  | "unsupported"

const LOCATION_ERROR_MESSAGES: Record<AttendanceLocationErrorCode, string> = {
  permission_denied: "Permisiunea pentru locație a fost refuzată.",
  position_unavailable: "Locația GPS nu este disponibilă momentan.",
  timeout: "Determinarea locației a durat prea mult.",
  unsupported: "Acest browser nu permite determinarea locației.",
}

export class AttendanceLocationError extends Error {
  readonly code: AttendanceLocationErrorCode

  constructor(code: AttendanceLocationErrorCode) {
    super(LOCATION_ERROR_MESSAGES[code])
    this.name = "AttendanceLocationError"
    this.code = code
  }
}

export function isAttendanceLocationError(error: unknown): error is AttendanceLocationError {
  return error instanceof AttendanceLocationError
}

export function classifyGeolocationError(error: { code: number }): AttendanceLocationError {
  if (error.code === 1) return new AttendanceLocationError("permission_denied")
  if (error.code === 2) return new AttendanceLocationError("position_unavailable")
  if (error.code === 3) return new AttendanceLocationError("timeout")
  return new AttendanceLocationError("position_unavailable")
}

export function getGoogleMapsUrl(location: Pick<AttendanceLocation, "lat" | "lng">): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${location.lat},${location.lng}`)}`
}

export type LocationGuidancePlatform = "ios" | "android" | "desktop"

export function detectLocationGuidancePlatform(userAgent: string): LocationGuidancePlatform {
  if (/iPad|iPhone|iPod/i.test(userAgent)) return "ios"
  if (/Android/i.test(userAgent)) return "android"
  return "desktop"
}

export function getLocationPermissionGuidance(platform: LocationGuidancePlatform): string[] {
  if (platform === "ios") {
    return [
      "Deschide Configurări → Confidențialitate și securitate → Servicii de localizare.",
      "Alege browserul folosit (de exemplu Safari Websites) și permite locația în timpul utilizării.",
      "Revino în aplicație și apasă „Încearcă din nou”.",
    ]
  }
  if (platform === "android") {
    return [
      "Activează Locația (GPS) din setările rapide ale telefonului.",
      "În browser, deschide informațiile/setările site-ului → Permisiuni → Locație → Permite.",
      "Revino în aplicație și apasă „Încearcă din nou”.",
    ]
  }
  return [
    "Deschide setările site-ului din bara de adrese a browserului.",
    "Setează permisiunea Locație pe „Permite” și verifică dacă serviciile de localizare sunt active.",
    "Revino în aplicație și apasă „Încearcă din nou”.",
  ]
}

/**
 * Get current location from browser GPS
 */
export async function getCurrentLocation(): Promise<AttendanceLocation> {
  if (!navigator.geolocation) {
    throw new AttendanceLocationError("unsupported")
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const location: AttendanceLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }

        // Try to get address from reverse geocoding (optional)
        try {
          const address = await reverseGeocode(location.lat, location.lng)
          location.address = address
        } catch (error) {
          console.warn("Could not get address from coordinates:", error)
        }

        resolve(location)
      },
      (error) => {
        reject(classifyGeolocationError(error))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  })
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

/**
 * Check if current location is at office (within 50m radius)
 */
export function isAtOffice(
  currentLocation: AttendanceLocation,
  officeLocation?: OfficeLocation
): boolean {
  if (!officeLocation) {
    // If no office location defined, assume not at office
    return false
  }

  const distance = calculateDistance(
    currentLocation.lat,
    currentLocation.lng,
    officeLocation.lat,
    officeLocation.lng
  )

  // Within 50 meters is considered "at office"
  return distance <= 50
}

/**
 * Determine mode automatically based on location
 */
export function determineMode(
  currentLocation: AttendanceLocation,
  officeLocation?: OfficeLocation
): AttendanceMode {
  return isAtOffice(currentLocation, officeLocation) ? "office" : "field"
}

/**
 * Reverse geocode coordinates to address (using OpenStreetMap Nominatim)
 * This is a free service - for production consider using Google Maps API or similar
 */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const response = await fetch(
      `/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`
    )

    if (!response.ok) {
      throw new Error("Geocoding failed")
    }

    const data = await response.json()
    return data.display_name || "Unknown location"
  } catch (error) {
    console.error("Reverse geocoding error:", error)
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  }
}

/**
 * Request location permissions
 */
export async function requestLocationPermission(): Promise<PermissionState> {
  if (!navigator.permissions) {
    throw new Error("Permissions API not supported")
  }

  try {
    const result = await navigator.permissions.query({ name: "geolocation" })
    return result.state
  } catch (error) {
    console.error("Permission query error:", error)
    throw error
  }
}
