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
  userName?: string // Display name for quick reference
  sessionStart: number // timestamp
  sessionEnd?: number // timestamp
  mode: AttendanceMode
  location: AttendanceLocation
  faceRecognitionId?: string // Mock ID for face recognition
  extraTimeLogs?: ExtraTimeLog[]
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
  location: AttendanceLocation
  faceRecognitionId?: string
}

export interface ExtraTimeRequest {
  sessionId: string
  type: ExtraTimeType
}
