"use client"

import type { Employee, LeaveRequest, TimesheetCell, TimesheetMonth, TimesheetMonthKey } from "./types"
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
    superiorIerarhic: data.superiorIerarhic ? String(data.superiorIerarhic) : undefined,
    loculDeMunca: data.loculDeMunca ? String(data.loculDeMunca) : undefined,
    programLucruStart: data.programLucruStart ? String(data.programLucruStart) : undefined,
    programLucruEnd: data.programLucruEnd ? String(data.programLucruEnd) : undefined,
    zileConcediuAnuale: data.zileConcediuAnuale ? Number(data.zileConcediuAnuale) : undefined,
    // System fields
    active: Boolean(data.active),
    userUid: data.userUid ? String(data.userUid) : undefined,
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
    superiorIerarhic: employee.superiorIerarhic ?? null,
    loculDeMunca: employee.loculDeMunca ?? null,
    programLucruStart: employee.programLucruStart ?? null,
    programLucruEnd: employee.programLucruEnd ?? null,
    zileConcediuAnuale: employee.zileConcediuAnuale ?? null,
    // System fields
    active: employee.active,
    userUid: employee.userUid ?? null,
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

export function upsertTimesheetCell(params: {
  monthKey: TimesheetMonthKey
  employeeId: string
  day: number
  cell: TimesheetCell
}): Promise<void> {
  const ref = doc(db, "hrTimesheets", timesheetDocId(params.employeeId, params.monthKey))
  const dayKey = String(params.day)
  return setDoc(
    ref,
    {
      employeeId: params.employeeId,
      monthKey: params.monthKey,
      updatedAt: serverTimestamp(),
      days: { [dayKey]: params.cell },
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

// ===== Leave Requests =====

export function subscribeLeaveRequests(params: {
  monthKey: TimesheetMonthKey
  onChange: (requests: LeaveRequest[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const [year, month] = params.monthKey.split("-")
  const startDate = `${year}-${month}-01`
  const endDate = `${year}-${month}-31`
  
  const q = query(
    collection(db, "hrLeaveRequests"),
    where("startDate", ">=", startDate),
    where("startDate", "<=", endDate),
    orderBy("startDate", "desc")
  )
  
  return onSnapshot(
    q,
    (snap) => {
      const requests = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() ?? Date.now()
      } as LeaveRequest))
      params.onChange(requests)
    },
    (err) => params.onError?.(err)
  )
}

export async function createLeaveRequest(request: Omit<LeaveRequest, "id" | "createdAt">) {
  const ref = doc(collection(db, "hrLeaveRequests"))
  await setDoc(ref, {
    ...request,
    createdAt: serverTimestamp(),
  })
}

export function subscribeEmployeeLeaveRequests(params: {
  employeeId: string
  onChange: (requests: LeaveRequest[]) => void
  onError?: (err: unknown) => void
}): Unsubscribe {
  const q = query(
    collection(db, "hrLeaveRequests"),
    where("employeeId", "==", params.employeeId),
    orderBy("startDate", "desc")
  )
  
  return onSnapshot(
    q,
    (snap) => {
      const requests = snap.docs.map(d => ({ 
        id: d.id, 
        ...d.data(),
        createdAt: d.data().createdAt?.toMillis?.() ?? Date.now()
      } as LeaveRequest))
      params.onChange(requests)
    },
    (err) => params.onError?.(err)
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

