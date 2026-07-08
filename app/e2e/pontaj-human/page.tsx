"use client"

import { useMemo, useState } from "react"
import { isE2eTestMode } from "@/lib/utils/environment"
import { getAppNowMs, setE2eFakeNowMs } from "@/lib/utils/test-clock"
import { determineMode, getCurrentLocation } from "@/lib/attendance/location"
import { buildAttendanceTimesheetCell } from "@/lib/attendance/sync-timesheet-merge"
import { reconcileOvertimeWithTimesheets } from "@/lib/hr/overtime-report"
import type { AttendanceLocation, AttendanceMode, AttendanceSession } from "@/types/attendance"
import type { Employee, HrRequest, TimesheetCell, TimesheetMonth } from "@/lib/hr/types"

const OFFICE = { lat: 44.43, lng: 26.1, radius: 50, address: "Birou E2E" }

const EMPLOYEE: Employee = {
  id: "emp-human-e2e",
  nume: "Human",
  prenume: "Pontaj",
  active: true,
  userUid: "user-human-e2e",
  programLucruStart: "08:00",
  programLucruEnd: "16:30",
}

const OVERTIME_REQUEST: HrRequest = {
  id: "req-human-overtime",
  employeeId: EMPLOYEE.id,
  employeeName: "Pontaj Human",
  requesterUid: "user-human-e2e",
  sectorId: "sector-e2e",
  managerUid: "manager-e2e",
  kind: "ADD_OVERTIME",
  status: "approved",
  payload: {
    kind: "ADD_OVERTIME",
    date: "2026-03-15",
    overtimeHours: 1.5,
    reason: "Test E2E human",
  },
  createdAt: 0,
  updatedAt: 0,
}

type SelfieStatus = "idle" | "ok" | "missing" | "required_failed"
type FlowMessage = "idle" | "field_started" | "field_stopped" | "duplicate_active" | "no_active" | "location_error" | "kiosk_started" | "kiosk_stopped" | "kiosk_camera_required"

function localMs(h: number, m: number) {
  return new Date(2026, 2, 15, h, m, 0, 0).getTime()
}

async function captureSelfie(required: boolean): Promise<SelfieStatus> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    stream.getTracks().forEach((track) => track.stop())
    return "ok"
  } catch {
    return required ? "required_failed" : "missing"
  }
}

function timesheetsFor(cell: TimesheetCell): TimesheetMonth[] {
  return [
    {
      employeeId: EMPLOYEE.id,
      monthKey: "2026-03",
      days: { "15": cell },
      updatedAt: 0,
    },
  ]
}

function formatEntries(cell: TimesheetCell) {
  return (cell.entries ?? []).map((entry) => `${entry.project}:${entry.start}-${entry.end}`).join(" | ")
}

export default function PontajHumanE2ePage() {
  const enabled = isE2eTestMode()
  const [clockInput, setClockInput] = useState("2026-03-15T08:00:00+02:00")
  const [clockNow, setClockNow] = useState(() => getAppNowMs())
  const [activeSession, setActiveSession] = useState<AttendanceSession | null>(null)
  const [completedSession, setCompletedSession] = useState<AttendanceSession | null>(null)
  const [kioskSession, setKioskSession] = useState<AttendanceSession | null>(null)
  const [location, setLocation] = useState<AttendanceLocation | null>(null)
  const [mode, setMode] = useState<AttendanceMode | "none">("none")
  const [selfieStatus, setSelfieStatus] = useState<SelfieStatus>("idle")
  const [message, setMessage] = useState<FlowMessage>("idle")
  const [problemFilter, setProblemFilter] = useState(false)
  const [timesheetCell, setTimesheetCell] = useState<TimesheetCell>({
    code: "WORK",
    entries: [
      {
        start: "16:30",
        end: "18:00",
        project: "Ore suplimentare",
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

  const reconciliation = useMemo(() => {
    return reconcileOvertimeWithTimesheets({
      requests: [OVERTIME_REQUEST],
      employees: [EMPLOYEE],
      timesheets: timesheetsFor(timesheetCell),
    })[0]
  }, [timesheetCell])

  const rowVisible = !problemFilter || reconciliation?.status !== "confirmed"

  const applyClock = (value: string | number | Date | null) => {
    setE2eFakeNowMs(value)
    setClockNow(getAppNowMs())
  }

  const shiftClock = (minutes: number) => {
    const next = getAppNowMs() + minutes * 60 * 1000
    applyClock(next)
    setClockInput(new Date(next).toISOString())
  }

  const resolveBrowserLocation = async () => {
    const current = await getCurrentLocation()
    setLocation(current)
    const resolvedMode = determineMode(current, OFFICE)
    setMode(resolvedMode)
    return { current, resolvedMode }
  }

  const handleFieldStart = async () => {
    if (activeSession) {
      setMessage("duplicate_active")
      return
    }
    const selfie = await captureSelfie(false)
    setSelfieStatus(selfie)
    try {
      const { current, resolvedMode } = await resolveBrowserLocation()
      setActiveSession({
        id: "att-human-field",
        userId: "user-human-e2e",
        employeeId: EMPLOYEE.id,
        userName: "Pontaj Human",
        sessionStart: localMs(8, 0),
        mode: resolvedMode,
        location: current,
        status: "active",
        deviceInfo: { type: "field" },
        programLucruStart: "08:00",
        programLucruEnd: "16:30",
        checkInSelfieStatus: selfie === "ok" ? "ok" : "missing",
        createdAt: localMs(8, 0),
        updatedAt: localMs(8, 0),
      })
      setCompletedSession(null)
      setMessage("field_started")
    } catch {
      setMessage("location_error")
    }
  }

  const handleFieldStop = async () => {
    if (!activeSession) {
      setMessage("no_active")
      return
    }
    const selfie = await captureSelfie(false)
    setSelfieStatus(selfie)
    try {
      const { current, resolvedMode } = await resolveBrowserLocation()
      const completed: AttendanceSession = {
        ...activeSession,
        status: "completed",
        sessionEnd: localMs(18, 0),
        checkOutMode: resolvedMode,
        checkOutLocation: current,
        checkOutSelfieStatus: selfie === "ok" ? "ok" : "missing",
        updatedAt: localMs(18, 0),
      }
      setActiveSession(null)
      setCompletedSession(completed)
      setMessage("field_stopped")
    } catch {
      setMessage("location_error")
    }
  }

  const handleManualSync = () => {
    if (!completedSession) return
    const result = buildAttendanceTimesheetCell({
      existingDay: timesheetCell,
      computedEntries: [
        {
          start: "08:00",
          end: "18:00",
          project: "Pontaj",
          methodStart: "Play (field)",
          methodEnd: "Stop (field)",
          attendanceSessionId: completedSession.id,
          selfieStartUrl: completedSession.checkInSelfieUrl,
          selfieEndUrl: completedSession.checkOutSelfieUrl,
        },
      ],
    })
    if (result.cell) setTimesheetCell(result.cell)
  }

  const handleKioskStart = async () => {
    if (kioskSession?.status === "active") {
      setMessage("duplicate_active")
      return
    }
    const selfie = await captureSelfie(true)
    setSelfieStatus(selfie)
    if (selfie === "required_failed") {
      setMessage("kiosk_camera_required")
      return
    }
    let current: AttendanceLocation
    let resolvedMode: AttendanceMode
    try {
      const resolved = await resolveBrowserLocation()
      current = resolved.current
      resolvedMode = resolved.resolvedMode
    } catch {
      current = { lat: OFFICE.lat, lng: OFFICE.lng, address: OFFICE.address }
      resolvedMode = "office"
      setLocation(current)
      setMode(resolvedMode)
    }
    setKioskSession({
      id: "att-human-kiosk",
      userId: "user-human-e2e",
      employeeId: EMPLOYEE.id,
      userName: "Pontaj Human",
      sessionStart: localMs(9, 0),
      mode: resolvedMode,
      location: current,
      status: "active",
      deviceInfo: { type: "kiosk" },
      checkInSelfieStatus: "ok",
      createdAt: localMs(9, 0),
      updatedAt: localMs(9, 0),
    })
    setMessage("kiosk_started")
  }

  const handleKioskStop = async () => {
    if (kioskSession?.status !== "active") {
      setMessage("no_active")
      return
    }
    const selfie = await captureSelfie(true)
    setSelfieStatus(selfie)
    if (selfie === "required_failed") {
      setMessage("kiosk_camera_required")
      return
    }
    setKioskSession({
      ...kioskSession,
      status: "completed",
      sessionEnd: localMs(17, 0),
      checkOutSelfieStatus: "ok",
      updatedAt: localMs(17, 0),
    })
    setMessage("kiosk_stopped")
  }

  if (!enabled) {
    return <div data-testid="pontaj-human-disabled">Harness indisponibil în afara E2E.</div>
  }

  return (
    <main style={{ padding: 24, maxWidth: 1040, fontFamily: "sans-serif" }}>
      <h1 data-testid="pontaj-human-title">Pontaj human-like E2E</h1>

      <section aria-label="Ceas E2E" style={{ marginTop: 20 }}>
        <h2>Ceas E2E</h2>
        <input
          data-testid="e2e-clock-input"
          value={clockInput}
          onChange={(event) => setClockInput(event.currentTarget.value)}
          style={{ minWidth: 280, marginRight: 8 }}
        />
        <button data-testid="e2e-clock-apply" onClick={() => applyClock(clockInput)}>
          Aplică ora
        </button>
        <button data-testid="e2e-clock-0800" onClick={() => {
          const value = "2026-03-15T08:00:00+02:00"
          setClockInput(value)
          applyClock(value)
        }}>
          08:00
        </button>
        <button data-testid="e2e-clock-1630" onClick={() => {
          const value = "2026-03-15T16:30:00+02:00"
          setClockInput(value)
          applyClock(value)
        }}>
          16:30
        </button>
        <button data-testid="e2e-clock-1800" onClick={() => {
          const value = "2026-03-15T18:00:00+02:00"
          setClockInput(value)
          applyClock(value)
        }}>
          18:00
        </button>
        <button data-testid="e2e-clock-plus-8h" onClick={() => shiftClock(8 * 60)}>
          +8h
        </button>
        <button data-testid="e2e-clock-clear" onClick={() => applyClock(null)}>
          Clear
        </button>
        <div data-testid="e2e-clock-now-ms">{clockNow}</div>
        <div data-testid="e2e-clock-now-local">{new Date(clockNow).toISOString()}</div>
      </section>

      <section aria-label="Browser permissions" style={{ marginTop: 20 }}>
        <h2>Permisiuni browser</h2>
        <button data-testid="probe-location" onClick={() => void resolveBrowserLocation()}>
          Verifică locația
        </button>
        <button data-testid="probe-camera-optional" onClick={async () => setSelfieStatus(await captureSelfie(false))}>
          Verifică selfie opțional
        </button>
        <button data-testid="probe-camera-required" onClick={async () => setSelfieStatus(await captureSelfie(true))}>
          Verifică selfie obligatoriu
        </button>
        <div data-testid="location-lat">{location?.lat ?? "none"}</div>
        <div data-testid="location-lng">{location?.lng ?? "none"}</div>
        <div data-testid="attendance-mode">{mode}</div>
        <div data-testid="selfie-status">{selfieStatus}</div>
        <div data-testid="flow-message">{message}</div>
      </section>

      <section aria-label="Field flow" style={{ marginTop: 20 }}>
        <h2>Pontaj teren</h2>
        <button data-testid="human-field-start" onClick={handleFieldStart}>
          Mă pontez acum
        </button>
        <button data-testid="human-field-stop" onClick={handleFieldStop}>
          Mă opresc acum
        </button>
        <div data-testid="human-field-state">{activeSession ? "active" : completedSession ? "completed" : "idle"}</div>
      </section>

      <section aria-label="Condică și sync" style={{ marginTop: 20 }}>
        <h2>Condică</h2>
        <button data-testid="human-manual-sync" onClick={handleManualSync}>
          Sync manual
        </button>
        <div data-testid="human-timesheet-hours">{timesheetCell.hours ?? 0}</div>
        <div data-testid="human-timesheet-entries">{formatEntries(timesheetCell)}</div>
        <div data-testid="human-has-pontaj">
          {String(Boolean(timesheetCell.entries?.some((entry) => entry.project === "Pontaj" && entry.attendanceSessionId)))}
        </div>
        <div data-testid="human-has-overtime">
          {String(Boolean(timesheetCell.entries?.some((entry) => entry.sourceRequestId === OVERTIME_REQUEST.id)))}
        </div>
        <div data-testid="human-has-manual">
          {String(Boolean(timesheetCell.entries?.some((entry) => entry.project === "Pregătire manuală")))}
        </div>
      </section>

      <section aria-label="Reconciliere" style={{ marginTop: 20 }}>
        <h2>Reconciliere</h2>
        <label>
          <input
            data-testid="human-problems-only"
            type="checkbox"
            checked={problemFilter}
            onChange={(event) => setProblemFilter(event.currentTarget.checked)}
          />
          Doar probleme
        </label>
        <div data-testid="human-reconciliation-visible">{String(rowVisible)}</div>
        <div data-testid="human-reconciliation-status">{reconciliation?.status ?? "none"}</div>
        <div data-testid="human-reconciliation-found">{reconciliation?.foundMinutes ?? 0}</div>
        <div data-testid="human-reconciliation-diff">{reconciliation?.diffMinutes ?? 0}</div>
      </section>

      <section aria-label="Kiosk flow" style={{ marginTop: 20 }}>
        <h2>Kiosk</h2>
        <button data-testid="human-kiosk-start" onClick={handleKioskStart}>
          Start kiosk
        </button>
        <button data-testid="human-kiosk-stop" onClick={handleKioskStop}>
          Stop kiosk
        </button>
        <div data-testid="human-kiosk-state">{kioskSession?.status ?? "idle"}</div>
      </section>
    </main>
  )
}
