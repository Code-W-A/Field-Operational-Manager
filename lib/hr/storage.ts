"use client"

import type { Department, Employee, TimesheetCell, TimesheetMonth, TimesheetMonthKey } from "./types"
import type { HrRequest, HrRequestKind, HrRequestStatus } from "./types"
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteField,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { HR_SEED_EMPLOYEES, buildSeedTimesheets } from "./mock"

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
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    updatedAt: data.updatedAt?.toMillis?.() ?? Date.now(),
    decidedAt: data.decidedAt?.toMillis?.() ?? undefined,
    decidedByUid: data.decidedByUid ? String(data.decidedByUid) : undefined,
  }
}

export function subscribeHrRequestsForEmployee(params: {
  employeeId: string
  onChange: (requests: HrRequest[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(
    collection(db, "hrRequests"),
    where("employeeId", "==", params.employeeId),
    orderBy("createdAt", "desc")
  )
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => normalizeHrRequest(d.id, d.data()))
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
  const q = query(
    collection(db, "hrRequests"),
    where("managerUid", "==", params.managerUid),
    orderBy("createdAt", "desc")
  )
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => normalizeHrRequest(d.id, d.data()))
      params.onChange(items)
    },
    (err) => params.onError?.(err)
  )
}

export async function createHrRequest(request: Omit<HrRequest, "id" | "createdAt" | "updatedAt">) {
  const ref = doc(collection(db, "hrRequests"))
  const cleanRequest = removeUndefined(request as any)
  await setDoc(ref, {
    ...cleanRequest,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateHrRequestByManager(params: {
  requestId: string
  updates: Partial<Pick<HrRequest, "payload" | "sectorId" | "managerUid" | "kind">>
  managerUid: string
}) {
  const ref = doc(db, "hrRequests", params.requestId)
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
  await updateDoc(ref, {
    status: params.status,
    rejectionReason: params.status === "rejected" ? (params.rejectionReason?.trim() || "—") : null,
    decidedByUid: params.decidedByUid,
    decidedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as any)
}

// ===== Departments =====

function normalizeDepartment(id: string, data: any): Department {
  return {
    id,
    name: String(data.name || ""),
    description: data.description ? String(data.description) : undefined,
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

