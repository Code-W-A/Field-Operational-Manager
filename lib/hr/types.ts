export type TimesheetCode = "WORK" | "WE" | "CO" | "CFP" | "CM" | "DEL" | "IN" | "SL" | "EMPTY"

export type TimesheetCell = {
  code: TimesheetCode
  /** Relevant for WORK / IN / SL when tracking hours. */
  hours?: number
  /** If this whole day cell was created by an approved HR request, keep traceability. */
  sourceRequestId?: string
  sourceRequestKind?: HrRequestKind
  entries?: Array<{
    start: string // "HH:mm"
    end: string // "HH:mm"
    /** Absolute instants retained for attendance-generated entries (DST-safe duration). */
    startTimestampMs?: number
    endTimestampMs?: number
    methodStart?: string
    methodEnd?: string
    project?: string
    /** Mark this interval as "traseu la client" (client travel). */
    travelToClient?: boolean
    /** Optional link back to the attendance session that generated this entry. */
    attendanceSessionId?: string
    /** Optional selfie URLs for start/stop (when generated from attendance). */
    selfieStartUrl?: string
    selfieEndUrl?: string
    /** Optional lateness marker (minutes) for the day (set from attendance check-in). */
    lateStartMinutes?: number
    /** If this entry was created by an approved HR request, keep traceability. */
    sourceRequestId?: string
    sourceRequestKind?: HrRequestKind
  }>
  breaks?: Array<{
    start: string // "HH:mm"
    end: string // "HH:mm"
    sourceRequestId?: string
    sourceRequestKind?: HrRequestKind
  }>
}

export type Employee = {
  id: string
  // Identification data (Date de identificare)
  nume: string // Last name
  prenume: string // First name
  cnp?: string // Personal ID Number
  ciSerie?: string // ID card series
  ciNumar?: string // ID card number
  ciDataEmiterii?: string // ID issue date (format: DD.MM.YYYY or YYYY-MM-DD)
  ciEmitent?: string // ID issuer
  
  // Workplace data (Date despre locul de munca)
  title?: string // Function/role (kept for compatibility)
  poziteCOR?: string // COR position code (e.g. "8114-Montator ansambluri mecanice")
  superiorUid?: string // Hierarchical superior (user UID)
  /** @deprecated Legacy field - use superiorUid instead */
  superiorIerarhic?: string
  /** Optional: sectors the employee belongs to (used for approvals routing). */
  sectorIds?: string[]
  /** Optional: for each sectorId, which userUid is the hierarchical superior (approver). */
  managerUidBySector?: Record<string, string>
  loculDeMunca?: string // Workplace location
  programLucruStart?: string // Work schedule start (HH:mm format, e.g. "8:00")
  programLucruEnd?: string // Work schedule end (HH:mm format, e.g. "16:30")
  /** Optional general break interval for the employee (HH:mm). */
  pauzaStart?: string
  /** Optional general break interval for the employee (HH:mm). */
  pauzaEnd?: string
  zileConcediuAnuale?: number // Annual vacation days entitlement (default 21)
  
  // System fields
  active: boolean
  /** Optional link to an app user (Firebase Auth / Firestore users doc id = uid). */
  userUid?: string

  /** Optional profile photo URL (Firebase Storage download URL). */
  photoURL?: string
  /** Optional: last time the photo was updated (ms since epoch). */
  photoUpdatedAt?: number
  
  // Computed field for backward compatibility - use getFullName() helper
  fullName?: string // Deprecated: use nume + prenume
}

export type Department = {
  id: string
  name: string
  description?: string
  /** Optional: UID-ul șefului de departament (utilizator). */
  managerUid?: string
  active: boolean
  createdAt: number
  updatedAt: number
  createdBy?: string
}

export type HrDefaults = {
  programLucruStart?: string
  programLucruEnd?: string
  pauzaStart?: string
  pauzaEnd?: string
}

export type TimesheetMonthKey = `${number}-${string}` // e.g. "2026-01"

export type TimesheetMonth = {
  monthKey: TimesheetMonthKey
  employeeId: string
  /** day ("1".."31") -> cell (Firestore map keys are strings). */
  days: Record<string, TimesheetCell>
  updatedAt: number
}

export type HrRequestStatus = "pending" | "approved" | "rejected"

export type HrRequestKind =
  | "CO" // concediu odihna
  | "CFP" // concediu fara plata
  | "CM" // concediu medical
  | "IN" // invoire
  | "DEL" // delegatie
  | "CORRECT_HOURS" // corectare ore
  | "ADD_OVERTIME" // ore suplimentare

export type HrRequestPayload =
  | {
      kind: "CO" | "CFP" | "CM" | "DEL"
      startDate: string // yyyy-mm-dd
      endDate: string // yyyy-mm-dd
      reason?: string
      /** Optional event start time (used for CO template export). */
      eventStartTime?: string // HH:mm
      /** Optional event end time (used for CO template export). */
      eventEndTime?: string // HH:mm
      /** Optional client name (used for delegatie template export). */
      clientName?: string
      /** Optional medical proof document URL (required by UI for CM). */
      medicalDocumentUrl?: string
      /** Optional original uploaded file name for CM proof. */
      medicalDocumentName?: string
    }
  | {
      kind: "IN"
      date: string // yyyy-mm-dd
      startTime: string // HH:mm
      endTime: string // HH:mm
      reason?: string
    }
  | {
      kind: "CORRECT_HOURS"
      date: string // yyyy-mm-dd
      entries: Array<{ start: string; end: string; project?: string; travelToClient?: boolean }>
      breaks?: Array<{ start: string; end: string }>
      reason?: string
    }
  | {
      kind: "ADD_OVERTIME"
      date: string // yyyy-mm-dd
      overtimeHours: number
      reason?: string
    }

export type HrRequest = {
  id: string
  employeeId: string
  /** Snapshot for UI/exports (manager might not have hrEmployees access). */
  employeeName?: string
  requesterUid: string
  sectorId: string
  managerUid: string
  kind: HrRequestKind
  status: HrRequestStatus
  payload: HrRequestPayload
  rejectionReason?: string
  /** Optional audit: condica cell was cleared after approval (e.g. CO removed manually). */
  timesheetClearedAt?: number
  timesheetClearedByUid?: string
  timesheetClearedByRole?: string
  timesheetClearedDateISO?: string
  timesheetClearedNote?: string
  /** Optional: which backend channel sends email notifications. */
  emailChannel?: "nextjs" | "firebase"
  /** Număr secvențial pentru documente (1–9999), alocat la creare. */
  documentSerial?: number
  createdAt: number
  updatedAt: number
  decidedAt?: number
  decidedByUid?: string
}

// Helper function to get full name from Employee
export function getEmployeeFullName(employee: Employee | null | undefined): string {
  if (!employee) return ""
  if (employee.prenume && employee.nume) {
    return `${employee.prenume} ${employee.nume}`
  }
  // Fallback to legacy fullName if present
  return employee.fullName || ""
}

export type HrHoliday = {
  /** ISO date: yyyy-mm-dd */
  date: string
  /** Optional label shown in tooltips/UI */
  label?: string
}
