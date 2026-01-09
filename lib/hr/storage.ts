"use client"

import type { Employee, TimesheetCell, TimesheetMonth, TimesheetMonthKey } from "./types"
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
  return {
    id,
    fullName: String(data.fullName ?? ""),
    title: data.title ? String(data.title) : undefined,
    active: Boolean(data.active),
    userUid: data.userUid ? String(data.userUid) : undefined,
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
  const q = query(collection(db, "hrEmployees"), orderBy("fullName", "asc"))
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
  await setDoc(
    ref,
    {
      fullName: employee.fullName,
      title: employee.title ?? null,
      active: employee.active,
      userUid: employee.userUid ?? null,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  )
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
  const exists = await doesEmployeesCollectionExist()
  if (exists) return false

  const batch = writeBatch(db)

  for (const e of HR_SEED_EMPLOYEES) {
    const ref = doc(db, "hrEmployees", e.id)
    batch.set(
      ref,
      {
        fullName: e.fullName,
        title: e.title ?? null,
        active: e.active,
        userUid: e.userUid ?? null,
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
    batch.set(
      ref,
      {
        fullName: e.fullName,
        title: e.title ?? null,
        active: e.active,
        userUid: e.userUid ?? null,
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

