export type AttendanceMode = "office" | "field"

export type AttendanceStatus = "active" | "completed"

export type ExtraTimeType = "to_client" | "to_home"

export interface ExtraTimeLog {
  type: ExtraTimeType
  startTime: number // timestamp
  endTime?: number // timestamp
  minutesEligible: number
}

export interface AttendanceLocation {
  lat: number
  lng: number
  address?: string
}

export interface DeviceInfo {
  type: string
  userAgent: string
}

export interface AttendanceSession {
  id: string
  userId: string //UID of the technician
  /** @deprecated Snapshot for older records; UI should resolve via IDs (userId/employeeId). */
  userName?: string
  /** HR employee id (hrEmployees doc id). Filled at check-in when available for deterministic sync. */
  employeeId?: string
  sessionStart: number // timestamp
  sessionEnd?: number // timestamp
  /** Check-in mode (office kiosk vs field). */
  mode: AttendanceMode
  /** Backward-compatible check-in location. */
  location: AttendanceLocation
  /** Backward-compatible check-in face recognition id (mock). */
  faceRecognitionId?: string
  /** Backward-compatible check-in device info. */
  extraTimeLogs?: ExtraTimeLog[]
  /** Optional work schedule captured at check-in (used for extra-time caps). */
  programLucruStart?: string // "HH:mm"
  programLucruEnd?: string // "HH:mm"
  /** Explicit checkout metadata (separate from check-in). */
  checkOutMode?: AttendanceMode
  checkOutLocation?: AttendanceLocation
  checkOutFaceRecognitionId?: string
  checkOutDeviceInfo?: DeviceInfo
  status: AttendanceStatus
  deviceInfo: DeviceInfo
  createdAt: number
  updatedAt: number
}

export interface FaceRecognitionResult {
  success: boolean
  confidence?: number
  faceId?: string
  error?: string
  processingTime?: number
}

export interface CheckInRequest {
  userId: string
  userName?: string
  mode: AttendanceMode
  location: AttendanceLocation
  faceRecognitionId?: string
  deviceInfo: DeviceInfo
}

export interface CheckOutRequest {
  sessionId: string
  mode: AttendanceMode
  location: AttendanceLocation
  faceRecognitionId?: string
  deviceInfo: DeviceInfo
}

export interface ExtraTimeRequest {
  sessionId: string
  type: ExtraTimeType
}
