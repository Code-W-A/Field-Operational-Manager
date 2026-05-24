"use client"

import type { Department, Employee, HrDefaults, HrHoliday, TimesheetCell, TimesheetMonth, TimesheetMonthKey } from "./types"
import type { HrRequest, HrRequestKind, HrRequestStatus } from "./types"
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { HR_SEED_EMPLOYEES, buildSeedTimesheets } from "./mock"
import {
  buildTimesheetCellForHrRequest,
  daysByMonthFromRequest,
  removeHrRequestFromTimesheetCell,
} from "@/lib/hr/request-timesheet-sync"

export type Unsubscribe = () => void

// LocalStorage keys kept only for optional import/migration.
export const HR_LS_EMPLOYEES_KEY = "fom.hr.employees.v1"
export const HR_LS_TIMESHEETS_KEY = "fom.hr.timesheets.v1"

type StoredEmployees = { version: 1; employees: Employee[]; updatedAt: number }
type StoredTimesheets = { version: 1; timesheets: TimesheetMonth[]; updatedAt: number }

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function getCurrentMonthKey(d = new Date()): TimesheetMonthKey {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  return `${y}-${m}` as TimesheetMonthKey
}

export function daysInMonth(monthKey: TimesheetMonthKey) {
  const [yStr, mStr] = monthKey.split("-")
  const y = Number(yStr)
  const m = Number(mStr)
  // JS months are 0-based; to get days in month, ask day 0 of next month.
  return new Date(y, m, 0).getDate()
}

function normalizeEmployee(id: string, data: any): Employee {
  // Support both old (fullName) and new (nume + prenume) formats
  let nume = data.nume ? String(data.nume) : ""
  let prenume = data.prenume ? String(data.prenume) : ""
  
  // If we have old fullName but not new fields, split it
  if (!nume && !prenume && data.fullName) {
    const parts = String(data.fullName).trim().split(/\s+/)
    if (parts.length >= 2) {
      nume = parts[parts.length - 1] // Last word is surname
      prenume = parts.slice(0, -1).join(" ") // Rest is first name
    } else if (parts.length === 1) {
      nume = parts[0]
      prenume = ""
    }
  }
  
  return {
    id,
    // Identification data
    nume,
    prenume,
    cnp: data.cnp ? String(data.cnp) : undefined,
    ciSerie: data.ciSerie ? String(data.ciSerie) : undefined,
    ciNumar: data.ciNumar ? String(data.ciNumar) : undefined,
    ciDataEmiterii: data.ciDataEmiterii ? String(data.ciDataEmiterii) : undefined,
    ciEmitent: data.ciEmitent ? String(data.ciEmitent) : undefined,
    // Workplace data
    title: data.title ? String(data.title) : undefined,
    poziteCOR: data.poziteCOR ? String(data.poziteCOR) : undefined,
    superiorUid: data.superiorUid ? String(data.superiorUid) : undefined,
    superiorIerarhic: data.superiorIerarhic ? String(data.superiorIerarhic) : undefined,
    sectorIds: Array.isArray(data.sectorIds) ? data.sectorIds.map((x: any) => String(x)).filter(Boolean) : undefined,
    managerUidBySector:
      data.managerUidBySector && typeof data.managerUidBySector === "object"
        ? Object.fromEntries(
            Object.entries(data.managerUidBySector as Record<string, any>)
              .map(([k, v]) => [String(k), v == null ? "" : String(v)])
              .filter(([k, v]) => k && v)
          )
        : undefined,
    loculDeMunca: data.loculDeMunca ? String(data.loculDeMunca) : undefined,
    programLucruStart: data.programLucruStart ? String(data.programLucruStart) : undefined,
    programLucruEnd: data.programLucruEnd ? String(data.programLucruEnd) : undefined,
    pauzaStart: data.pauzaStart ? String(data.pauzaStart) : undefined,
    pauzaEnd: data.pauzaEnd ? String(data.pauzaEnd) : undefined,
    zileConcediuAnuale: data.zileConcediuAnuale ? Number(data.zileConcediuAnuale) : undefined,
    // System fields
    active: Boolean(data.active),
    userUid: data.userUid ? String(data.userUid) : undefined,
    photoURL: data.photoURL ? String(data.photoURL) : undefined,
    photoUpdatedAt: data.photoUpdatedAt ? Number(data.photoUpdatedAt) : undefined,
    // Legacy field
    fullName: data.fullName ? String(data.fullName) : undefined,
  }
}

function normalizeTimesheet(id: string, data: any): TimesheetMonth {
  return {
    monthKey: String(data.monthKey) as TimesheetMonthKey,
    employeeId: String(data.employeeId),
    days: (data.days ?? {}) as Record<string, TimesheetCell>,
    updatedAt: Date.now(),
  }
}

export function subscribeEmployees(params: {
  onChange: (employees: Employee[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  // Try to order by nume (last name) if available, fallback to fullName for legacy data
  const q = query(collection(db, "hrEmployees"), orderBy("nume", "asc"))
  return onSnapshot(
    q,
    (snap) => {
      const employees = snap.docs.map((d) => normalizeEmployee(d.id, d.data()))
      params.onChange(employees)
    },
    (err) => params.onError?.(err)
  )
}

export async function getEmployeeByUserUid(userUid: string): Promise<Employee | null> {
  const q = query(collection(db, "hrEmployees"), where("userUid", "==", userUid), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return normalizeEmployee(d.id, d.data())
}

export async function createOrUpdateEmployee(employee: Employee) {
  const ref = doc(db, "hrEmployees", employee.id)
  
  // Prepare data object with all fields
  const data: any = {
    // Identification data
    nume: employee.nume,
    prenume: employee.prenume,
    cnp: employee.cnp ?? null,
    ciSerie: employee.ciSerie ?? null,
    ciNumar: employee.ciNumar ?? null,
    ciDataEmiterii: employee.ciDataEmiterii ?? null,
    ciEmitent: employee.ciEmitent ?? null,
    // Workplace data
      title: employee.title ?? null,
    poziteCOR: employee.poziteCOR ?? null,
    superiorUid: employee.superiorUid ?? null,
    superiorIerarhic: employee.superiorIerarhic ?? null,
    sectorIds: employee.sectorIds?.length ? employee.sectorIds : null,
    managerUidBySector: employee.managerUidBySector && Object.keys(employee.managerUidBySector).length ? employee.managerUidBySector : null,
    loculDeMunca: employee.loculDeMunca ?? null,
    programLucruStart: employee.programLucruStart ?? null,
    programLucruEnd: employee.programLucruEnd ?? null,
    pauzaStart: employee.pauzaStart ?? null,
    pauzaEnd: employee.pauzaEnd ?? null,
    zileConcediuAnuale: employee.zileConcediuAnuale ?? null,
    // System fields
      active: employee.active,
      userUid: employee.userUid ?? null,
      photoURL: employee.photoURL ?? null,
      photoUpdatedAt: employee.photoUpdatedAt ?? null,
    // Legacy fullName for backward compatibility
    fullName: `${employee.prenume} ${employee.nume}`.trim(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
  }
  
  await setDoc(ref, data, { merge: true })
}

export async function deleteEmployee(employeeId: string) {
  await deleteDoc(doc(db, "hrEmployees", employeeId))
}

export function subscribeTimesheetsForMonth(params: {
  monthKey: TimesheetMonthKey
  onChange: (timesheets: TimesheetMonth[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(collection(db, "hrTimesheets"), where("monthKey", "==", params.monthKey))
  return onSnapshot(
    q,
    (snap) => {
      const timesheets = snap.docs.map((d) => normalizeTimesheet(d.id, d.data()))
      params.onChange(timesheets)
    },
    (err) => params.onError?.(err)
  )
}

export async function doesEmployeesCollectionExist(): Promise<boolean> {
  const q = query(collection(db, "hrEmployees"), limit(1))
  const snap = await getDocs(q)
  return !snap.empty
}

export async function seedHrIfEmpty(params: { monthKey: TimesheetMonthKey }): Promise<boolean> {
  // IMPORTANT:
  // - HR "seed" is only for development/demo onboarding.
  // - In production, we want the UI to reflect ONLY real Firebase data unless explicitly enabled.
  const enableSeed =
    process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_ENABLE_HR_SEED === "true"
  if (!enableSeed) return false

  const exists = await doesEmployeesCollectionExist()
  if (exists) return false

  const batch = writeBatch(db)

  for (const e of HR_SEED_EMPLOYEES) {
    const ref = doc(db, "hrEmployees", e.id)
    batch.set(
      ref,
      {
        nume: e.nume,
        prenume: e.prenume,
        cnp: e.cnp ?? null,
        ciSerie: e.ciSerie ?? null,
        ciNumar: e.ciNumar ?? null,
        ciDataEmiterii: e.ciDataEmiterii ?? null,
        ciEmitent: e.ciEmitent ?? null,
        title: e.title ?? null,
        poziteCOR: e.poziteCOR ?? null,
        superiorIerarhic: e.superiorIerarhic ?? null,
        loculDeMunca: e.loculDeMunca ?? null,
        programLucruStart: e.programLucruStart ?? null,
        programLucruEnd: e.programLucruEnd ?? null,
        pauzaStart: (e as any).pauzaStart ?? null,
        pauzaEnd: (e as any).pauzaEnd ?? null,
        zileConcediuAnuale: e.zileConcediuAnuale ?? null,
        active: e.active,
        userUid: e.userUid ?? null,
        fullName: `${e.prenume} ${e.nume}`.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
  }

  const seedTs = buildSeedTimesheets(params.monthKey)
  for (const t of seedTs) {
    const ref = doc(db, "hrTimesheets", timesheetDocId(t.employeeId, params.monthKey))
    batch.set(
      ref,
      {
        employeeId: t.employeeId,
        monthKey: params.monthKey,
        days: t.days,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )
  }

  await batch.commit()
  return true
}

export function timesheetDocId(employeeId: string, monthKey: TimesheetMonthKey) {
  return `${employeeId}_${monthKey}`
}

// Helper function to remove undefined values from an object (Firestore doesn't allow undefined)
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: any = {}
  for (const key in obj) {
    const value = obj[key]
    if (value === undefined) continue
    if (Array.isArray(value)) {
      result[key] = value.map(item => 
        typeof item === 'object' && item !== null ? removeUndefined(item) : item
      )
    } else if (typeof value === 'object' && value !== null) {
      result[key] = removeUndefined(value)
    } else {
      result[key] = value
    }
  }
  return result
}

export function upsertTimesheetCell(params: {
  monthKey: TimesheetMonthKey
  employeeId: string
  day: number
  cell: TimesheetCell
}): Promise<void> {
  const ref = doc(db, "hrTimesheets", timesheetDocId(params.employeeId, params.monthKey))
  const dayKey = String(params.day)
  
  // Clean the cell object to remove undefined values
  const cleanCell = removeUndefined(params.cell)
  
  return setDoc(
    ref,
    {
      employeeId: params.employeeId,
      monthKey: params.monthKey,
      updatedAt: serverTimestamp(),
      days: { [dayKey]: cleanCell },
    },
    { merge: true }
  )
}

export async function deleteTimesheetDay(params: { monthKey: TimesheetMonthKey; employeeId: string; day: number }) {
  const ref = doc(db, "hrTimesheets", timesheetDocId(params.employeeId, params.monthKey))
  const dayKey = String(params.day)
  await updateDoc(ref, {
    [`days.${dayKey}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteTimesheetRange(params: {
  monthKey: TimesheetMonthKey
  employeeId: string
  startDay: number
  endDay: number
  deleteEntries: boolean
  deleteBreaks: boolean
}) {
  if (!params.deleteEntries && !params.deleteBreaks) return
  if (!Number.isFinite(params.startDay) || !Number.isFinite(params.endDay)) return
  if (params.startDay < 1 || params.endDay < 1) return
  const start = Math.min(params.startDay, params.endDay)
  const end = Math.max(params.startDay, params.endDay)

  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() }
  for (let d = start; d <= end; d++) {
    const dayKey = String(d)
    if (params.deleteEntries && params.deleteBreaks) {
      updates[`days.${dayKey}`] = deleteField()
      continue
    }
    if (params.deleteEntries) updates[`days.${dayKey}.entries`] = deleteField()
    if (params.deleteBreaks) updates[`days.${dayKey}.breaks`] = deleteField()
  }

  const ref = doc(db, "hrTimesheets", timesheetDocId(params.employeeId, params.monthKey))
  try {
    await updateDoc(ref, updates)
  } catch (err: any) {
    // If the doc doesn't exist, there's nothing to delete.
    if (err?.code === "not-found") return
    throw err
  }
}

/** Optional migration support: read legacy HR data from localStorage. */
export function readLegacyLocalStorageHrData(): { employees: Employee[]; timesheets: TimesheetMonth[] } | null {
  if (typeof window === "undefined") return null
  const se = safeParse<StoredEmployees>(window.localStorage.getItem(HR_LS_EMPLOYEES_KEY))
  const st = safeParse<StoredTimesheets>(window.localStorage.getItem(HR_LS_TIMESHEETS_KEY))
  if (!se?.employees?.length && !st?.timesheets?.length) return null
  return { employees: se?.employees ?? [], timesheets: st?.timesheets ?? [] }
}

export function clearLegacyLocalStorageHrData() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(HR_LS_EMPLOYEES_KEY)
  window.localStorage.removeItem(HR_LS_TIMESHEETS_KEY)
}

export async function importLegacyLocalStorageHrDataToFirestore(): Promise<{ employees: number; timesheets: number } | null> {
  const legacy = readLegacyLocalStorageHrData()
  if (!legacy) return null

  const batch = writeBatch(db)

  for (const e of legacy.employees) {
    if (!e?.id) continue
    const ref = doc(db, "hrEmployees", e.id)
    
    // Split fullName if nume/prenume not available
    let nume = e.nume || ""
    let prenume = e.prenume || ""
    if (!nume && !prenume && e.fullName) {
      const parts = String(e.fullName).trim().split(/\s+/)
      if (parts.length >= 2) {
        nume = parts[parts.length - 1]
        prenume = parts.slice(0, -1).join(" ")
      } else if (parts.length === 1) {
        nume = parts[0]
      }
    }
    
    batch.set(
      ref,
      {
        nume,
        prenume,
        cnp: e.cnp ?? null,
        ciSerie: e.ciSerie ?? null,
        ciNumar: e.ciNumar ?? null,
        ciDataEmiterii: e.ciDataEmiterii ?? null,
        ciEmitent: e.ciEmitent ?? null,
        title: e.title ?? null,
        poziteCOR: e.poziteCOR ?? null,
        superiorIerarhic: e.superiorIerarhic ?? null,
        loculDeMunca: e.loculDeMunca ?? null,
        programLucruStart: e.programLucruStart ?? null,
        programLucruEnd: e.programLucruEnd ?? null,
        pauzaStart: (e as any).pauzaStart ?? null,
        pauzaEnd: (e as any).pauzaEnd ?? null,
        zileConcediuAnuale: e.zileConcediuAnuale ?? null,
        active: e.active,
        userUid: e.userUid ?? null,
        fullName: `${prenume} ${nume}`.trim() || e.fullName,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )
  }

  for (const t of legacy.timesheets) {
    if (!t?.employeeId || !t?.monthKey) continue
    const ref = doc(db, "hrTimesheets", timesheetDocId(t.employeeId, t.monthKey))
    batch.set(
      ref,
      {
        employeeId: t.employeeId,
        monthKey: t.monthKey,
        days: t.days ?? {},
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    )
  }

  await batch.commit()
  clearLegacyLocalStorageHrData()
  return { employees: legacy.employees.length, timesheets: legacy.timesheets.length }
}

// ===== HR Requests (unified) =====

const BLOCKED_OVERLAP_REQUEST_KINDS: HrRequestKind[] = ["CO", "CFP", "CM", "DEL", "IN"]

function shouldEnforceRequestDayUniqueness(kind: HrRequestKind): boolean {
  return BLOCKED_OVERLAP_REQUEST_KINDS.includes(kind)
}

function requestStatusLabelRo(status: HrRequestStatus): string {
  if (status === "approved") return "aprobată"
  if (status === "pending") return "în așteptare"
  return "respinsă"
}

function requestKindLabelRo(kind: HrRequestKind): string {
  switch (kind) {
    case "CO":
      return "Concediu de odihnă"
    case "CFP":
      return "Concediu fără plată"
    case "CM":
      return "Concediu medical"
    case "IN":
      return "Învoire"
    case "DEL":
      return "Delegație"
    case "CORRECT_HOURS":
      return "Corectare ore de lucru"
    case "ADD_OVERTIME":
      return "Adăugare ore suplimentare"
    default:
      return String(kind)
  }
}

function isoToRoDate(iso: string): string {
  const s = String(iso || "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "N/A"
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`
}

function requestActiveDatesISO(kind: HrRequestKind, payload: any): string[] {
  if (!shouldEnforceRequestDayUniqueness(kind) || !payload) return []
  if (kind === "IN") {
    const d = String(payload?.date || "")
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? [d] : []
  }
  const start = String(payload?.startDate || "")
  const end = String(payload?.endDate || "")
  return enumerateDatesInclusiveISO(start, end).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
}

async function assertNoActiveRequestOverlap(params: {
  employeeId: string
  kind: HrRequestKind
  payload: any
  excludeRequestId?: string
}) {
  if (!params.employeeId) return
  if (!shouldEnforceRequestDayUniqueness(params.kind)) return

  const candidateDates = requestActiveDatesISO(params.kind, params.payload)
  if (!candidateDates.length) return
  const candidateSet = new Set(candidateDates)

  const q = query(
    collection(db, "hrRequests"),
    where("employeeId", "==", params.employeeId),
    where("status", "in", ["pending", "approved"]),
  )
  const snap = await getDocs(q)
  for (const d of snap.docs) {
    if (params.excludeRequestId && d.id === params.excludeRequestId) continue
    const req = normalizeHrRequest(d.id, d.data())
    if (!shouldEnforceRequestDayUniqueness(req.kind)) continue

    const existingDates = requestActiveDatesISO(req.kind, req.payload as any)
    const overlap = existingDates.find((dateIso) => candidateSet.has(dateIso))
    if (!overlap) continue

    throw new Error(
      `Există deja o cerere ${requestKindLabelRo(req.kind)} (${requestStatusLabelRo(req.status)}) pe data ${isoToRoDate(overlap)}. ` +
        "Nu poți avea două cereri active în aceeași zi (exceptând Corectare ore și Ore suplimentare).",
    )
  }
}

function normalizeHrRequest(id: string, data: any): HrRequest {
  return {
    id,
    employeeId: String(data.employeeId),
    employeeName: data.employeeName ? String(data.employeeName) : undefined,
    requesterUid: String(data.requesterUid),
    sectorId: String(data.sectorId),
    managerUid: String(data.managerUid),
    kind: String(data.kind) as HrRequestKind,
    status: String(data.status) as HrRequestStatus,
    payload: (data.payload ?? {}) as any,
    rejectionReason: data.rejectionReason ? String(data.rejectionReason) : undefined,
    timesheetClearedAt: data.timesheetClearedAt?.toMillis?.() ?? undefined,
    timesheetClearedByUid: data.timesheetClearedByUid ? String(data.timesheetClearedByUid) : undefined,
    timesheetClearedByRole: data.timesheetClearedByRole ? String(data.timesheetClearedByRole) : undefined,
    timesheetClearedDateISO: data.timesheetClearedDateISO ? String(data.timesheetClearedDateISO) : undefined,
    timesheetClearedNote: data.timesheetClearedNote ? String(data.timesheetClearedNote) : undefined,
    emailChannel: data.emailChannel ? String(data.emailChannel) as any : undefined,
    documentSerial:
      typeof data.documentSerial === "number" && Number.isFinite(data.documentSerial)
        ? data.documentSerial
        : undefined,
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
    decidedAt: data.decidedAt?.toMillis?.() ?? undefined,
    decidedByUid: data.decidedByUid ? String(data.decidedByUid) : undefined,
  }
}

export async function markHrRequestTimesheetCleared(params: {
  requestId: string
  clearedByUid: string
  clearedByRole?: string
  dateISO?: string
  note?: string
}) {
  const ref = doc(db, "hrRequests", params.requestId)
  await updateDoc(ref, {
    timesheetClearedAt: serverTimestamp(),
    timesheetClearedByUid: params.clearedByUid,
    timesheetClearedByRole: params.clearedByRole ?? null,
    timesheetClearedDateISO: params.dateISO ?? null,
    timesheetClearedNote: params.note ?? "Cod șters din condică după aprobare.",
    updatedAt: serverTimestamp(),
  } as any)
}

export function subscribeHrRequestsForEmployee(params: {
  employeeId: string
  onChange: (requests: HrRequest[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(collection(db, "hrRequests"), where("employeeId", "==", params.employeeId))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => normalizeHrRequest(d.id, d.data()))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      params.onChange(items)
    },
    (err) => params.onError?.(err)
  )
}

function requestOverlapsMonth(req: HrRequest, monthKey: TimesheetMonthKey) {
  const [yStr, mStr] = monthKey.split("-")
  const year = Number(yStr)
  const month = Number(mStr)
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

  const payload: any = req.payload as any
  const startStr = payload?.startDate || payload?.date
  const endStr = payload?.endDate || payload?.date
  if (!startStr) return false

  const start = new Date(startStr)
  const end = new Date(endStr || startStr)
  return start <= monthEnd && end >= monthStart
}

export function subscribeHrRequestsForRequester(params: {
  requesterUid: string
  onChange: (requests: HrRequest[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(collection(db, "hrRequests"), where("requesterUid", "==", params.requesterUid))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => normalizeHrRequest(d.id, d.data()))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      params.onChange(items)
    },
    (err) => params.onError?.(err)
  )
}

export function subscribeHrRequestsForMonth(params: {
  monthKey: TimesheetMonthKey
  kinds?: HrRequestKind[]
  onChange: (requests: HrRequest[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(collection(db, "hrRequests"), orderBy("createdAt", "desc"))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => normalizeHrRequest(d.id, d.data()))
      const filtered = items.filter((r) => {
        if (params.kinds?.length && !params.kinds.includes(r.kind)) return false
        return requestOverlapsMonth(r, params.monthKey)
      })
      params.onChange(filtered)
    },
    (err) => params.onError?.(err)
  )
}

export function subscribeHrRequestsForManager(params: {
  managerUid: string
  onChange: (requests: HrRequest[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(collection(db, "hrRequests"), where("managerUid", "==", params.managerUid))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => normalizeHrRequest(d.id, d.data()))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      params.onChange(items)
    },
    (err) => params.onError?.(err)
  )
}

async function notifyHrRequestEmail(params: { requestId: string; event: "created" | "status_changed" }) {
  try {
    const res = await fetch("/api/notifications/hr-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      console.warn("HR email notification failed", { status: res.status, body: txt })
    }
  } catch (err) {
    console.warn("HR email notification error", err)
  }
}

export async function createHrRequest(
  request: Omit<HrRequest, "id" | "createdAt" | "updatedAt">,
): Promise<{ id: string; documentSerial: number }> {
  await assertNoActiveRequestOverlap({
    employeeId: request.employeeId,
    kind: request.kind,
    payload: request.payload,
  })
  const ref = doc(collection(db, "hrRequests"))
  const counterRef = doc(db, "hrCounters", "leaveRequestSerial")
  const cleanRequest = removeUndefined(request as any) as Record<string, unknown>
  delete cleanRequest.documentSerial

  const documentSerial = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef)
    const lastRaw = counterSnap.exists() ? (counterSnap.data() as { last?: unknown }).last : undefined
    const last = typeof lastRaw === "number" && Number.isFinite(lastRaw) ? lastRaw : 0
    const nextSerial = last + 1
    transaction.set(counterRef, { last: nextSerial }, { merge: true })
    transaction.set(ref, {
      ...cleanRequest,
      documentSerial: nextSerial,
      emailChannel: "nextjs",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return nextSerial
  })

  void notifyHrRequestEmail({ requestId: ref.id, event: "created" })
  return { id: ref.id, documentSerial }
}

export async function updateHrRequestByManager(params: {
  requestId: string
  updates: Partial<Pick<HrRequest, "payload" | "sectorId" | "managerUid" | "kind">>
  managerUid: string
}) {
  const ref = doc(db, "hrRequests", params.requestId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error("Cererea nu mai există.")
  }
  const current = normalizeHrRequest(snap.id, snap.data())
  const nextKind = (params.updates.kind ?? current.kind) as HrRequestKind
  const nextPayload = params.updates.payload ?? current.payload
  await assertNoActiveRequestOverlap({
    employeeId: current.employeeId,
    kind: nextKind,
    payload: nextPayload,
    excludeRequestId: params.requestId,
  })

  const cleanUpdates = removeUndefined(params.updates as any)
  await updateDoc(ref, {
    ...cleanUpdates,
    updatedAt: serverTimestamp(),
    // keep audit hints
    editedByUid: params.managerUid,
    editedAt: serverTimestamp(),
  } as any)
}

export async function decideHrRequest(params: {
  requestId: string
  status: "approved" | "rejected"
  decidedByUid: string
  rejectionReason?: string
}) {
  const ref = doc(db, "hrRequests", params.requestId)
  if (params.status === "approved") {
    const snap = await getDoc(ref)
    if (!snap.exists()) throw new Error("Cererea nu mai există.")
    const current = normalizeHrRequest(snap.id, snap.data())
    await assertNoActiveRequestOverlap({
      employeeId: current.employeeId,
      kind: current.kind,
      payload: current.payload,
      excludeRequestId: params.requestId,
    })
  }
  await updateDoc(ref, {
    status: params.status,
    rejectionReason: params.status === "rejected" ? (params.rejectionReason?.trim() || "—") : null,
    decidedByUid: params.decidedByUid,
    decidedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    emailChannel: "nextjs",
  } as any)
  await notifyHrRequestEmail({ requestId: params.requestId, event: "status_changed" })
}

export async function deletePendingHrRequest(requestId: string) {
  const ref = doc(db, "hrRequests", requestId)
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    throw new Error("Cererea nu mai există.")
  }

  const current = normalizeHrRequest(snap.id, snap.data())
  if (current.status !== "pending") {
    throw new Error("Doar cererile în așteptare pot fi șterse.")
  }

  // Pending requests are not synced into condică, so deleting the request does not require timesheet cleanup.
  await deleteDoc(ref)
}

function enumerateDatesInclusiveISO(startDate: string, endDate: string): string[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
  const dates: string[] = []
  const d = new Date(start)
  while (d <= end) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    dates.push(`${y}-${m}-${day}`)
    d.setDate(d.getDate() + 1)
  }
  return dates
}

async function getEmployeeProgramEnd(employeeId: string): Promise<string> {
  try {
    const empSnap = await getDoc(doc(db, "hrEmployees", employeeId))
    const empEnd = (empSnap.data() as any)?.programLucruEnd
    if (typeof empEnd === "string" && empEnd.trim()) return empEnd.trim()

    const defaultsSnap = await getDoc(doc(db, "hrSettings", "defaults"))
    const defaultEnd = (defaultsSnap.data() as any)?.programLucruEnd
    if (typeof defaultEnd === "string" && defaultEnd.trim()) return defaultEnd.trim()
  } catch {
    // Fall back to the standard program end; syncing the request should not fail because settings are missing.
  }
  return "16:30"
}

/**
 * Syncs an HR request into hrTimesheets so it becomes visible in condică (not just highlighted).
 *
 * Behavior:
 * - Writes leave code to each affected day and marks it with sourceRequestId/sourceRequestKind.
 * - Removes old days (when payload changes) only if the cell belongs to the same requestId.
 * - By default overwrites manual cells (so approval is authoritative); set overwriteConflicts=false to be conservative.
 */
export async function syncHrRequestToTimesheets(params: {
  requestId: string
  employeeId: string
  kind: HrRequestKind
  payload: any
  oldPayload?: any
  overwriteConflicts?: boolean
}): Promise<{ updated: number; removed: number; skipped: number; months: TimesheetMonthKey[] }> {
  const overwrite = params.overwriteConflicts !== false
  const newByMonth = daysByMonthFromRequest(params.kind, params.payload)
  const oldByMonth = params.oldPayload ? daysByMonthFromRequest(params.kind, params.oldPayload) : {}
  const monthKeys = Array.from(new Set([...Object.keys(newByMonth), ...Object.keys(oldByMonth)])).sort() as TimesheetMonthKey[]

  let updated = 0
  let removed = 0
  let skipped = 0

  for (const monthKey of monthKeys) {
    const ref = doc(db, "hrTimesheets", timesheetDocId(params.employeeId, monthKey))
    const newDays = new Set<number>(newByMonth[monthKey] ?? [])
    const oldDays = new Set<number>(oldByMonth[monthKey] ?? [])
    const programEnd = params.kind === "ADD_OVERTIME" ? await getEmployeeProgramEnd(params.employeeId) : undefined

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref)
      const data: any = snap.exists() ? snap.data() : null
      const days: Record<string, TimesheetCell> = (data?.days ?? {}) as any

      const updates: Record<string, any> = { updatedAt: serverTimestamp() }

      // Remove days that used to be in the request but are no longer.
      for (const d of Array.from(oldDays)) {
        if (newDays.has(d)) continue
        const existing = days[String(d)]
        if (params.kind === "ADD_OVERTIME" || params.kind === "CORRECT_HOURS") {
          const cleaned = removeHrRequestFromTimesheetCell(existing, params.requestId)
          if (cleaned === null) {
            updates[`days.${String(d)}`] = deleteField()
            removed++
          } else if (cleaned && cleaned !== existing) {
            updates[`days.${String(d)}`] = cleaned
            removed++
          } else if (existing) {
            skipped++
          }
          continue
        }
        if (overwrite) {
          if (existing) {
            updates[`days.${String(d)}`] = deleteField()
            removed++
          }
          continue
        }
        if (existing?.sourceRequestId === params.requestId) {
          updates[`days.${String(d)}`] = deleteField()
          removed++
        } else if (existing) {
          skipped++
        }
      }

      // Apply new days.
      for (const d of Array.from(newDays)) {
        const existing = days[String(d)]
        if (!overwrite) {
          const existingHasOtherSource = existing?.sourceRequestId && existing.sourceRequestId !== params.requestId
          const existingHasManual = existing && !existing.sourceRequestId && existing.code && existing.code !== "EMPTY"
          if (existingHasOtherSource || existingHasManual) {
            skipped++
            continue
          }
        }

        const cell = buildTimesheetCellForHrRequest({
          requestId: params.requestId,
          kind: params.kind,
          payload: params.payload,
          existing,
          programEnd,
        })
        if (!cell) {
          skipped++
          continue
        }

        updates[`days.${String(d)}`] = cell as any
        updated++
      }

      if (!snap.exists()) {
        // Create the doc if needed (only when we actually write something).
        const anyDayWrite = Object.keys(updates).some((k) => k.startsWith("days."))
        if (anyDayWrite) {
          tx.set(
            ref,
            {
              employeeId: params.employeeId,
              monthKey,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
              days: {},
            },
            { merge: true }
          )
        }
      }

      const hasOps = Object.keys(updates).length > 1
      if (hasOps) tx.update(ref, updates)
    })
  }

  return { updated, removed, skipped, months: monthKeys }
}

// ===== Departments =====

function normalizeDepartment(id: string, data: any): Department {
  return {
    id,
    name: String(data.name || ""),
    description: data.description ? String(data.description) : undefined,
    managerUid: data.managerUid ? String(data.managerUid) : undefined,
    active: Boolean(data.active),
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
    createdBy: data.createdBy ? String(data.createdBy) : undefined,
  }
}

export function subscribeDepartments(params: {
  onChange: (departments: Department[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(collection(db, "hrDepartments"), orderBy("name", "asc"))
  return onSnapshot(
    q,
    (snap) => {
      const departments = snap.docs.map((d) => normalizeDepartment(d.id, d.data()))
      params.onChange(departments)
    },
    (err) => params.onError?.(err)
  )
}

export async function getActiveDepartments(): Promise<Department[]> {
  const q = query(collection(db, "hrDepartments"), where("active", "==", true), orderBy("name", "asc"))
  const snap = await getDocs(q)
  return snap.docs.map((d) => normalizeDepartment(d.id, d.data()))
}

export async function createOrUpdateDepartment(department: Department) {
  const ref = doc(db, "hrDepartments", department.id)
  const data: any = {
    name: department.name,
    description: department.description ?? null,
    managerUid: department.managerUid ?? null,
    active: department.active,
    createdBy: department.createdBy ?? null,
    updatedAt: serverTimestamp(),
  }
  
  // Only set createdAt on new documents
  const docSnap = await getDocs(query(collection(db, "hrDepartments"), where("__name__", "==", department.id), limit(1)))
  if (docSnap.empty) {
    data.createdAt = serverTimestamp()
  }
  
  await setDoc(ref, data, { merge: true })
}

export async function deleteDepartment(departmentId: string): Promise<{ success: boolean; error?: string }> {
  // Check if any employees are using this department
  const employeesQuery = query(
    collection(db, "hrEmployees"),
    where("sectorIds", "array-contains", departmentId)
  )
  const employeesSnap = await getDocs(employeesQuery)
  
  if (!employeesSnap.empty) {
    return {
      success: false,
      error: `Nu se poate șterge departamentul. Este folosit de ${employeesSnap.size} angajat${employeesSnap.size === 1 ? "" : "i"}.`
    }
  }
  
  await deleteDoc(doc(db, "hrDepartments", departmentId))
  return { success: true }
}

// ===== HR Defaults (program standard) =====

function normalizeHrDefaults(data: any): HrDefaults {
  return {
    programLucruStart: data?.programLucruStart ? String(data.programLucruStart) : undefined,
    programLucruEnd: data?.programLucruEnd ? String(data.programLucruEnd) : undefined,
    pauzaStart: data?.pauzaStart ? String(data.pauzaStart) : undefined,
    pauzaEnd: data?.pauzaEnd ? String(data.pauzaEnd) : undefined,
  }
}

export function subscribeHrDefaults(params: {
  onChange: (defaults: HrDefaults) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const ref = doc(db, "hrSettings", "defaults")
  return onSnapshot(
    ref,
    (snap) => {
      params.onChange(snap.exists() ? normalizeHrDefaults(snap.data()) : {})
    },
    (err) => params.onError?.(err)
  )
}

export async function saveHrDefaults(defaults: HrDefaults) {
  const ref = doc(db, "hrSettings", "defaults")
  await setDoc(
    ref,
    {
      programLucruStart: defaults.programLucruStart ?? null,
      programLucruEnd: defaults.programLucruEnd ?? null,
      pauzaStart: defaults.pauzaStart ?? null,
      pauzaEnd: defaults.pauzaEnd ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

export async function applyHrDefaultsToEmployees(defaults: HrDefaults): Promise<number> {
  const snap = await getDocs(collection(db, "hrEmployees"))
  if (snap.empty) return 0

  let updated = 0
  let batch = writeBatch(db)
  let ops = 0

  const shouldUpdate = (data: any) => {
    const ps = data?.programLucruStart ? String(data.programLucruStart).trim() : ""
    const pe = data?.programLucruEnd ? String(data.programLucruEnd).trim() : ""
    const bs = data?.pauzaStart ? String(data.pauzaStart).trim() : ""
    const be = data?.pauzaEnd ? String(data.pauzaEnd).trim() : ""
    const missingProgram = !ps && !pe
    const missingBreak = !bs && !be
    return missingProgram || missingBreak
  }

  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    if (!shouldUpdate(data)) continue
    const ref = doc(db, "hrEmployees", docSnap.id)
    const updateData: Record<string, unknown> = { updatedAt: serverTimestamp() }
    const ps = data?.programLucruStart ? String(data.programLucruStart).trim() : ""
    const pe = data?.programLucruEnd ? String(data.programLucruEnd).trim() : ""
    const bs = data?.pauzaStart ? String(data.pauzaStart).trim() : ""
    const be = data?.pauzaEnd ? String(data.pauzaEnd).trim() : ""
    if (!ps && !pe) {
      updateData.programLucruStart = defaults.programLucruStart ?? null
      updateData.programLucruEnd = defaults.programLucruEnd ?? null
    }
    if (!bs && !be) {
      updateData.pauzaStart = defaults.pauzaStart ?? null
      updateData.pauzaEnd = defaults.pauzaEnd ?? null
    }
    batch.update(ref, updateData)
    updated++
    ops++
    if (ops >= 450) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }

  if (ops > 0) {
    await batch.commit()
  }
  return updated
}

export async function applyHrDefaultsToAllEmployees(defaults: HrDefaults): Promise<number> {
  const snap = await getDocs(collection(db, "hrEmployees"))
  if (snap.empty) return 0

  let updated = 0
  let batch = writeBatch(db)
  let ops = 0

  for (const docSnap of snap.docs) {
    const ref = doc(db, "hrEmployees", docSnap.id)
    batch.update(ref, {
      programLucruStart: defaults.programLucruStart ?? null,
      programLucruEnd: defaults.programLucruEnd ?? null,
      pauzaStart: defaults.pauzaStart ?? null,
      pauzaEnd: defaults.pauzaEnd ?? null,
      updatedAt: serverTimestamp(),
    })
    updated++
    ops++
    if (ops >= 450) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }

  if (ops > 0) {
    await batch.commit()
  }
  return updated
}

// ===== Legal holidays (Sărbători legale) =====

function normalizeHrHoliday(raw: any): HrHoliday | null {
  const date = raw?.date ? String(raw.date) : ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const label = raw?.label ? String(raw.label) : undefined
  return { date, label: label?.trim() ? label.trim() : undefined }
}

export function subscribeHrHolidays(params: {
  year: number
  onChange: (items: HrHoliday[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const ref = doc(db, "hrHolidays", String(params.year))
  return onSnapshot(
    ref,
    (snap) => {
      const data: any = snap.data() as any
      const rawItems = Array.isArray(data?.items) ? data.items : []
      const items = rawItems.map(normalizeHrHoliday).filter(Boolean) as HrHoliday[]
      params.onChange(items)
    },
    (err) => params.onError?.(err)
  )
}

export async function saveHrHolidays(params: { year: number; items: HrHoliday[]; updatedByUid?: string }) {
  const ref = doc(db, "hrHolidays", String(params.year))
  await setDoc(
    ref,
    {
      year: params.year,
      items: params.items.map((h) => ({ date: h.date, label: h.label ?? null })),
      updatedByUid: params.updatedByUid ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  )
}

// ===== Data Migration =====

/**
 * Migrates employees that have fullName but not nume/prenume split fields.
 * This is a one-time migration that can be run manually or on app initialization.
 */
export async function migrateEmployeesFullNameToSplit(): Promise<{ migrated: number; skipped: number; errors: number }> {
  const snapshot = await getDocs(collection(db, "hrEmployees"))
  const batch = writeBatch(db)
  let migrated = 0
  let skipped = 0
  let errors = 0
  
  for (const docSnap of snapshot.docs) {
    try {
      const data = docSnap.data()
      
      // Skip if already has nume and prenume
      if (data.nume && data.prenume) {
        skipped++
        continue
      }
      
      // Skip if no fullName to split
      if (!data.fullName) {
        errors++
        continue
      }
      
      // Split fullName into nume and prenume
      const fullName = String(data.fullName).trim()
      const parts = fullName.split(/\s+/)
      
      let nume = ""
      let prenume = ""
      
      if (parts.length >= 2) {
        nume = parts[parts.length - 1] // Last word is surname
        prenume = parts.slice(0, -1).join(" ") // Rest is first name
      } else if (parts.length === 1) {
        nume = parts[0]
        prenume = ""
      } else {
        errors++
        continue
      }
      
      // Update the document
      const ref = doc(db, "hrEmployees", docSnap.id)
      batch.update(ref, {
        nume,
        prenume,
        updatedAt: serverTimestamp(),
      })
      
      migrated++
      
      // Firestore batch has a limit of 500 operations
      if (migrated % 500 === 0) {
        await batch.commit()
      }
    } catch (err) {
      console.error(`Error migrating employee ${docSnap.id}:`, err)
      errors++
    }
  }
  
  // Commit any remaining operations
  if (migrated % 500 !== 0) {
    await batch.commit()
  }
  
  return { migrated, skipped, errors }
}
