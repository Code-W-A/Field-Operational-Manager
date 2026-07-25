import assert from "node:assert/strict"
import test from "node:test"

import {
  AttendanceLocationError,
  classifyGeolocationError,
  detectLocationGuidancePlatform,
  getGoogleMapsUrl,
  getLocationPermissionGuidance,
  isAttendanceLocationError,
} from "./location"

test("classifies browser geolocation errors into stable attendance codes", () => {
  assert.equal(classifyGeolocationError({ code: 1 }).code, "permission_denied")
  assert.equal(classifyGeolocationError({ code: 2 }).code, "position_unavailable")
  assert.equal(classifyGeolocationError({ code: 3 }).code, "timeout")
  assert.equal(classifyGeolocationError({ code: 99 }).code, "position_unavailable")
  assert.equal(isAttendanceLocationError(new AttendanceLocationError("unsupported")), true)
  assert.equal(isAttendanceLocationError(new Error("other")), false)
})

test("builds an exact Google Maps coordinate URL", () => {
  assert.equal(
    getGoogleMapsUrl({ lat: 44.4267674, lng: 26.1025384 }),
    "https://www.google.com/maps/search/?api=1&query=44.4267674%2C26.1025384"
  )
})

test("returns platform-specific permission guidance", () => {
  assert.equal(detectLocationGuidancePlatform("Mozilla/5.0 (iPhone) Safari"), "ios")
  assert.equal(detectLocationGuidancePlatform("Mozilla/5.0 (Linux; Android 15) Chrome"), "android")
  assert.equal(detectLocationGuidancePlatform("Mozilla/5.0 (Macintosh) Chrome"), "desktop")
  assert.match(getLocationPermissionGuidance("ios").join(" "), /Configurări/)
  assert.match(getLocationPermissionGuidance("android").join(" "), /Permisiuni/)
  assert.match(getLocationPermissionGuidance("desktop").join(" "), /bara de adrese/)
})
