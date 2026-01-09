export type TimesheetCode = "WORK" | "WE" | "CO" | "DEL" | "IN" | "SL" | "EMPTY"

export type TimesheetCell = {
  code: TimesheetCode
  /** Relevant for WORK / IN / SL when tracking hours. */
  hours?: number
  entries?: Array<{
    start: string // "HH:mm"
    end: string // "HH:mm"
    methodStart?: string
    methodEnd?: string
    project?: string
  }>
  breaks?: Array<{
    start: string // "HH:mm"
    end: string // "HH:mm"
  }>
}

export type Employee = {
  id: string
  fullName: string
  title?: string
  active: boolean
  /** Optional link to an app user (Firebase Auth / Firestore users doc id = uid). */
  userUid?: string
}

export type TimesheetMonthKey = `${number}-${string}` // e.g. "2026-01"

export type TimesheetMonth = {
  monthKey: TimesheetMonthKey
  employeeId: string
  /** day ("1".."31") -> cell (Firestore map keys are strings). */
  days: Record<string, TimesheetCell>
  updatedAt: number
}


