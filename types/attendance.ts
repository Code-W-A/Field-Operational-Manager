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

export type AttendanceSpecialDayKind = "saturday" | "sunday" | "legal_holiday"

export interface AttendanceSpecialDayConfirmation {
  required: boolean
  confirmed: boolean
  kind: AttendanceSpecialDayKind
  label: string
  date: string // yyyy-mm-dd, local date
  confirmedAt: number // timestamp
}

export interface DeviceInfo {
  type: string
  userAgent: string
  /** Auto pontaj/depontaj motive (ex. first_qr, report_signed). */
  reason?: string
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
  /** Check-in face scan audit id (no image stored). Prefix may encode method, e.g. face_cam_* vs face_mock_*. */
  faceRecognitionId?: string
  /** Optional selfie captured at check-in (stored in Firebase Storage). */
  checkInSelfieUrl?: string
  checkInSelfiePath?: string
  checkInSelfieStatus?: "ok" | "missing" | "error"
  /** Explicit user confirmation when check-in starts on weekend/legal holiday. */
  specialDayConfirmation?: AttendanceSpecialDayConfirmation
  /** Late start metadata (computed at check-in vs scheduled start). */
  lateStartMinutes?: number
  lateStartAt?: number
  scheduledStart?: string // "HH:mm"
  /** Backward-compatible check-in device info. */
  extraTimeLogs?: ExtraTimeLog[]
  /** Optional work schedule captured at check-in (used for extra-time caps). */
  programLucruStart?: string // "HH:mm"
  programLucruEnd?: string // "HH:mm"
  /** Break configuration captured at check-in for deterministic timesheet sync. */
  pauzaStart?: string // "HH:mm"
  pauzaEnd?: string // "HH:mm"
  /** Explicit checkout metadata (separate from check-in). */
  checkOutMode?: AttendanceMode
  checkOutLocation?: AttendanceLocation
  /** Check-out face scan audit id (no image stored). Prefix may encode method, e.g. face_cam_* vs face_mock_*. */
  checkOutFaceRecognitionId?: string
  /** Optional selfie captured at check-out (stored in Firebase Storage). */
  checkOutSelfieUrl?: string
  checkOutSelfiePath?: string
  checkOutSelfieStatus?: "ok" | "missing" | "error"
  checkOutDeviceInfo?: DeviceInfo
  /** Auto check-in (primul QR al zilei). */
  checkInAuto?: boolean
  checkInAutoReason?: string
  /** Auto check-out (raport, program+grace, 23:59). */
  checkOutAuto?: boolean
  checkOutAutoReason?: string
  /** Legacy end-of-day stop; kept for backward compatibility. */
  autoStopped?: boolean
  autoStoppedAt?: number
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

export type AutoPontajReason = "first_qr" | "report_signed" | "schedule_grace" | "eod_force"

export interface CheckInRequest {
  userId: string
  userName?: string
  mode: AttendanceMode
  location: AttendanceLocation
  faceRecognitionId?: string
  checkInSelfieUrl?: string
  checkInSelfiePath?: string
  checkInSelfieStatus?: "ok" | "missing" | "error"
  specialDayConfirmation?: AttendanceSpecialDayConfirmation
  deviceInfo: DeviceInfo
  /** Override session start (ex. ora scanării QR). */
  sessionStartMs?: number
  checkInAuto?: boolean
  checkInAutoReason?: AutoPontajReason | string
}

export interface CheckOutRequest {
  sessionId: string
  mode: AttendanceMode
  location: AttendanceLocation
  faceRecognitionId?: string
  checkOutSelfieUrl?: string
  checkOutSelfiePath?: string
  checkOutSelfieStatus?: "ok" | "missing" | "error"
  deviceInfo: DeviceInfo
  sessionEndMs?: number
  skipMinimumDurationCheck?: boolean
  checkOutAuto?: boolean
  checkOutAutoReason?: AutoPontajReason | string
  autoStopped?: boolean
  /**
   * DEBUG ONLY: simulate longer sessions without waiting.
   * Only honored when NEXT_PUBLIC_ENABLE_DEBUG_PANEL === "true".
   */
  debugSimulatedDurationMinutes?: number
}

export interface ExtraTimeRequest {
  sessionId: string
  type: ExtraTimeType
}
