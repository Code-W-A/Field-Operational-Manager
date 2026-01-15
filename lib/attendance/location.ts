import type { AttendanceLocation, AttendanceMode } from "@/types/attendance"
import type { OfficeLocation } from "@/lib/firebase/auth"

/**
 * Get current location from browser GPS
 */
export async function getCurrentLocation(): Promise<AttendanceLocation> {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported by your browser")
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
        let errorMessage = "Could not get your location"
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location permission denied. Please enable location access."
            break
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable"
            break
          case error.TIMEOUT:
            errorMessage = "Location request timed out"
            break
        }

        reject(new Error(errorMessage))
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
