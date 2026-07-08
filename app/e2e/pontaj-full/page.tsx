"use client"

import { useMemo, useState } from "react"
import { isE2eTestMode } from "@/lib/utils/environment"
import { buildAttendanceTimesheetCell } from "@/lib/attendance/sync-timesheet-merge"
import { clampSessionEndMs } from "@/lib/attendance/auto-pontaj-schedule"
import { reconcileOvertimeWithTimesheets } from "@/lib/hr/overtime-report"
import type { AttendanceSession } from "@/types/attendance"
import type { Employee, HrRequest, TimesheetCell, TimesheetMonth } from "@/lib/hr/types"

const EMPLOYEE: Employee = {
  id: "emp-e2e",
  nume: "Pontaj",
  prenume: "Test",
  active: true,
  userUid: "user-e2e",
  programLucruStart: "08:00",
  programLucruEnd: "16:30",
}

const OVERTIME_REQUEST: HrRequest = {
  id: "req-e2e-overtime",
  employeeId: EMPLOYEE.id,
  employeeName: "Test Pontaj",
  requesterUid: "user-e2e",
  sectorId: "sector-e2e",
  managerUid: "manager-e2e",
  kind: "ADD_OVERTIME",
  status: "approved",
  payload: {
    kind: "ADD_OVERTIME",
    date: "2026-03-15",
    overtimeHours: 1.5,
    reason: "Validare E2E",
  },
  createdAt: 0,
  updatedAt: 0,
}

function localMs(h: number, m: number) {
  return new Date(2026, 2, 15, h, m, 0, 0).getTime()
}

function formatCell(cell: TimesheetCell | null) {
  if (!cell) return "empty"
  return (cell.entries ?? []).map((entry) => `${entry.project}:${entry.start}-${entry.end}`).join(" | ")
}

function computedTimesheet(cell: TimesheetCell | null): TimesheetMonth[] {
  if (!cell) return []
  return [
    {
      employeeId: EMPLOYEE.id,
      monthKey: "2026-03",
      days: { "15": cell },
      updatedAt: 0,
    },
  ]
}

export default function PontajFullHarness() {
  const enabled = isE2eTestMode()
  const [route, setRoute] = useState("/dashboard/resurse-umane/pontaj")
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null)
  const [completedSession, setCompletedSession] = useState<AttendanceSession | null>(null)
  const [timesheetCell, setTimesheetCell] = useState<TimesheetCell>({
    code: "WORK",
    entries: [
      {
        start: "16:30",
        end: "18:00",
        project: "Ore suplimentare",
        methodStart: "Aprobat cerere",
        methodEnd: "Aprobat cerere",
        sourceRequestId: OVERTIME_REQUEST.id,
        sourceRequestKind: "ADD_OVERTIME",
      },
      {
        start: "18:00",
        end: "18:30",
        project: "Pregătire manuală",
      },
    ],
  })
  const [kioskSession, setKioskSession] = useState<AttendanceSession | null>(null)
  const [filter, setFilter] = useState<"all" | "problems">("all")

  const startField = () => {
    const session: AttendanceSession = {
      id: "att-field-e2e",
      userId: "user-e2e",
      employeeId: EMPLOYEE.id,
      userName: "Test Pontaj",
      sessionStart: localMs(8, 0),
      mode: "field",
      location: { lat: 44.43, lng: 26.1 },
      status: "active",
      deviceInfo: { type: "browser" },
      programLucruStart: "08:00",
      programLucruEnd: "16:30",
      createdAt: localMs(8, 0),
      updatedAt: localMs(8, 0),
    }
    setActiveSession(session)
    setCompletedSession(null)
  }

  const stopField = () => {
    if (!activeSession) return
    const sessionEnd = clampSessionEndMs(activeSession.sessionStart, localMs(18, 0), activeSession.programLucruEnd)
    const completed: AttendanceSession = {
      ...activeSession,
      status: "completed",
      sessionEnd,
      checkOutMode: "field",
      checkOutLocation: activeSession.location,
      updatedAt: sessionEnd,
    }
    setActiveSession(null)
    setCompletedSession(completed)
  }

  const syncManual = () => {
    if (!completedSession) return
    const merged = buildAttendanceTimesheetCell({
      existingDay: timesheetCell,
      computedEntries: [
        {
          start: "08:00",
          end: "18:00",
          methodStart: "Play (field)",
          methodEnd: "Stop (field)",
          project: "Pontaj",
          attendanceSessionId: completedSession.id,
        },
      ],
    })
    if (merged.cell) setTimesheetCell(merged.cell)
  }

  const startKiosk = () => {
    setKioskSession({
      id: "att-kiosk-e2e",
      userId: "user-kiosk-e2e",
      employeeId: "emp-kiosk-e2e",
      userName: "Kiosk Test",
      sessionStart: localMs(9, 0),
      mode: "office",
      location: { lat: 44.43, lng: 26.1 },
      status: "active",
      deviceInfo: { type: "kiosk" },
      createdAt: localMs(9, 0),
      updatedAt: localMs(9, 0),
    })
  }

  const stopKiosk = () => {
    if (!kioskSession) return
    setKioskSession({ ...kioskSession, status: "completed", sessionEnd: localMs(17, 0), updatedAt: localMs(17, 0) })
  }

  const reconciliation = useMemo(() => {
    return reconcileOvertimeWithTimesheets({
      requests: [OVERTIME_REQUEST],
      employees: [EMPLOYEE],
      timesheets: computedTimesheet(timesheetCell),
    })[0]
  }, [timesheetCell])

  const hasManualEntry = Boolean(timesheetCell.entries?.some((entry) => entry.project === "Pregătire manuală"))
  const hasOvertimeEntry = Boolean(timesheetCell.entries?.some((entry) => entry.sourceRequestId === OVERTIME_REQUEST.id))
  const hasPontajEntry = Boolean(timesheetCell.entries?.some((entry) => entry.project === "Pontaj" && entry.attendanceSessionId === "att-field-e2e"))
  const showRow = filter === "all" || reconciliation?.status !== "confirmed"

  if (!enabled) {
    return <div data-testid="pontaj-full-disabled">Harness indisponibil în afara E2E.</div>
  }

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 980 }}>
      <h1 data-testid="pontaj-full-title">Pontaj full E2E</h1>

      <nav aria-label="Rute pontaj" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {[
          "/dashboard/resurse-umane/pontaj",
          "/dashboard/resurse-umane/pontaj/dashboard",
          "/dashboard/resurse-umane/pontaj/sync",
          "/dashboard/resurse-umane/condica-prezenta",
          "/kiosk",
        ].map((target) => (
          <button key={target} data-testid={`route-${target}`} onClick={() => setRoute(target)}>
            {target}
          </button>
        ))}
      </nav>

      <section aria-label="Ruta curentă">
        <strong>Rută:</strong> <span data-testid="current-route">{route}</span>
      </section>

      <section aria-label="Pontaj teren" style={{ marginTop: 24 }}>
        <h2>Field check-in / check-out</h2>
        <button data-testid="field-check-in" onClick={startField} disabled={Boolean(activeSession)}>
          Play
        </button>
        <button data-testid="field-check-out" onClick={stopField} disabled={!activeSession}>
          Stop
        </button>
        <div data-testid="field-state">{activeSession ? "active" : completedSession ? "completed" : "idle"}</div>
      </section>

      <section aria-label="Condică" style={{ marginTop: 24 }}>
        <h2>Condică</h2>
        <button data-testid="manual-sync" onClick={syncManual} disabled={!completedSession}>
          Sync manual
        </button>
        <div data-testid="timesheet-hours">{timesheetCell.hours ?? 0}</div>
        <div data-testid="timesheet-entries">{formatCell(timesheetCell)}</div>
        <div data-testid="has-pontaj-entry">{String(hasPontajEntry)}</div>
        <div data-testid="has-overtime-entry">{String(hasOvertimeEntry)}</div>
        <div data-testid="has-manual-entry">{String(hasManualEntry)}</div>
      </section>

      <section aria-label="Reconciliere" style={{ marginTop: 24 }}>
        <h2>Reconciliere overtime</h2>
        <select data-testid="reconciliation-filter" value={filter} onChange={(event) => setFilter(event.target.value as any)}>
          <option value="all">Toate</option>
          <option value="problems">Doar probleme</option>
        </select>
        <div data-testid="reconciliation-visible">{String(showRow)}</div>
        <div data-testid="reconciliation-status">{reconciliation?.status ?? "none"}</div>
        <div data-testid="reconciliation-found">{reconciliation?.foundMinutes ?? 0}</div>
        <div data-testid="reconciliation-diff">{reconciliation?.diffMinutes ?? 0}</div>
      </section>

      <section aria-label="Kiosk" style={{ marginTop: 24 }}>
        <h2>Kiosk</h2>
        <button data-testid="kiosk-start" onClick={startKiosk} disabled={kioskSession?.status === "active"}>
          Kiosk Play
        </button>
        <button data-testid="kiosk-stop" onClick={stopKiosk} disabled={kioskSession?.status !== "active"}>
          Kiosk Stop
        </button>
        <div data-testid="kiosk-state">{kioskSession?.status ?? "idle"}</div>
      </section>
    </main>
  )
}
