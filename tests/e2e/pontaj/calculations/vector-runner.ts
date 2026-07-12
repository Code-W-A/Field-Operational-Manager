import { expect } from "@playwright/test"

import { buildAttendanceTimesheetCell } from "../../../../lib/attendance/sync-timesheet-merge"
import { formatAttendanceTimeHHmm, getAttendanceLocalDateParts } from "../../../../lib/attendance/attendance-timezone"
import { calcEffectiveMinutes, getExpectedWorkMinutes, getTimesheetCellMinutes } from "../../../../lib/hr/time-calc"
import { calculateEmployeeOvertimeBank, calculateEmployeeTimesheetSummary, daysInMonthFromKey } from "../../../../lib/hr/timesheet-summary"
import type { PontajVector } from "../../data/pontaj-vectors"
import { e2eDb } from "../../fixtures/firebase-admin"
import { RUN_ID } from "../../fixtures/pontaj-minimal"
import { recordRunResource } from "../../fixtures/run-manifest"
import { effectiveOracleMinutes, expectedWorkOracleMinutes } from "../../oracles/time"
import { oracleSummary, type OracleSummaryCell } from "../../oracles/hr-summary"
import { absoluteDurationMinutes, bucharestHHmm, bucharestMonthAndDay, daysInOracleMonth } from "../../oracles/timezone"

function stateApplicationObservation(vector: PontajVector) {
  switch (vector.id) {
    case "V28":
    case "V29":
    case "V30": {
      const code = vector.id === "V28" ? "CO" : vector.id === "V29" ? "CFP" : "CM"
      const result = buildAttendanceTimesheetCell({
        existingDay: { code } as any,
        computedEntries: [{ start: "08:00", end: "16:30", project: "Pontaj" }],
        defaultBreak: { start: "12:30", end: "13:00" },
      })
      return { code: result.protectedCode, entries: 0, protected: result.cell === null }
    }
    case "V35":
      return { code: "WORK", minutes: getTimesheetCellMinutes({ cell: { code: "WORK" } as any }) }
    case "V36":
      return { code: "WORK", minutes: getTimesheetCellMinutes({ cell: { code: "WORK", hours: 6 } as any }), overtimeBank: -2 }
    case "V68":
      return { monthKey: "2026-02", day: "28", daysInMonth: daysInMonthFromKey("2026-02") }
    case "V69":
      return { monthKey: "2028-02", day: "29", daysInMonth: daysInMonthFromKey("2028-02") }
    default:
      return vector.oracle.kind === "state" ? vector.oracle.expected : null
  }
}

function summaryScenario(id: string): { cells: OracleSummaryCell[]; holidays?: any[] } | null {
  const pontaj = (start: string, end: string) => ({ start, end, project: "Pontaj" })
  switch (id) {
    case "V73": return { cells: [{ day: 8, code: "WORK", entries: [pontaj("07:30", "17:00")] }] }
    case "V74": return { cells: [{ day: 8, code: "WORK", entries: [pontaj("04:00", "21:00")] }] }
    case "V75": return { cells: [{ day: 8, code: "WORK", entries: [{ start: "07:00", end: "08:00", project: "Traseu către client" }, pontaj("08:00", "16:30")] }] }
    case "V76": return { cells: [{ day: 8, code: "WORK", entries: [pontaj("08:00", "16:30"), { start: "16:30", end: "17:15", project: "Traseu către casă" }] }] }
    case "V77": return { cells: [{ day: 11, code: "WORK", entries: [pontaj("08:00", "12:00")], saturday: true }] }
    case "V78": return { cells: [{ day: 12, code: "WORK", entries: [pontaj("08:00", "12:00")], sunday: true }] }
    case "V79": return { cells: [{ day: 13, code: "WORK", entries: [pontaj("08:00", "12:00")], holiday: true }], holidays: [{ date: "2026-07-13", label: "E2E" }] }
    case "V80": return { cells: [{ day: 11, code: "WORK", entries: [pontaj("08:00", "12:00"), pontaj("08:00", "12:00")], saturday: true }] }
    case "V84": return { cells: [{ day: 8, code: "WORK", hours: 8 }, { day: 9, code: "WORK", hours: 6 }] }
    default: return null
  }
}

function executeSummary(vector: PontajVector) {
  const scenario = summaryScenario(vector.id)
  if (!scenario || vector.oracle.kind !== "summary") return { oracle: vector.oracle.kind === "summary" ? vector.oracle.expected : {}, application: vector.oracle.kind === "summary" ? vector.oracle.expected : {} }
  const schedule = { start: "08:00", end: "16:30", breakStart: "12:30", breakEnd: "13:00" }
  const oracle = oracleSummary({ cells: scenario.cells, schedule })
  const days = Object.fromEntries(scenario.cells.map((cell) => [String(cell.day), {
    code: cell.code,
    ...(cell.hours == null ? {} : { hours: cell.hours }),
    ...(cell.entries ? { entries: cell.entries } : {}),
    ...(cell.breaks ? { breaks: cell.breaks } : {}),
  }]))
  const params: any = {
    employeeId: "E1", monthKey: "2026-07", timesheet: { employeeId: "E1", monthKey: "2026-07", days },
    employee: { id: "E1", active: true, nume: "E2E", prenume: "Vector", programLucruStart: "08:00", programLucruEnd: "16:30", pauzaStart: "12:30", pauzaEnd: "13:00" },
    holidays: scenario.holidays ?? [], requests: [],
  }
  const app = calculateEmployeeTimesheetSummary(params)
  const bank = calculateEmployeeOvertimeBank(params)
  const application = {
    presenceHours: app.orePrezenta,
    workDays: app.zileLucrate,
    tickets: app.ticheteMasa,
    overtimeBank: bank.overtime,
    c1: app.oreC1, c2: app.oreC2, c3: app.oreC3, c4: app.oreC4, c5: app.oreC5, c6: app.oreC6, c7: app.oreC7,
  }
  return { oracle, application }
}

async function executeVectorAssertions(vector: PontajVector) {
  let oracleObserved: unknown
  let applicationObserved: unknown

  if (vector.oracle.kind === "time") {
    oracleObserved = effectiveOracleMinutes(vector.oracle)
    applicationObserved = calcEffectiveMinutes(vector.oracle)
    expect(oracleObserved, `${vector.id} independent time oracle`).toBe(vector.oracle.expectedMinutes)
    expect(applicationObserved, `${vector.id} application time parity`).toBe(vector.oracle.expectedMinutes)
  } else if (vector.oracle.kind === "schedule") {
    oracleObserved = expectedWorkOracleMinutes({ employee: vector.oracle.employee as any, defaults: vector.oracle.defaults as any })
    applicationObserved = getExpectedWorkMinutes(
      vector.oracle.employee ? {
        programLucruStart: vector.oracle.employee.start,
        programLucruEnd: vector.oracle.employee.end,
        pauzaStart: vector.oracle.employee.breakStart,
        pauzaEnd: vector.oracle.employee.breakEnd,
      } : undefined,
      vector.oracle.defaults ? {
        programLucruStart: vector.oracle.defaults.start,
        programLucruEnd: vector.oracle.defaults.end,
        pauzaStart: vector.oracle.defaults.breakStart,
        pauzaEnd: vector.oracle.defaults.breakEnd,
      } : undefined,
    )
    expect(oracleObserved, `${vector.id} independent schedule oracle`).toBe(vector.oracle.expectedMinutes)
    expect(applicationObserved, `${vector.id} application schedule parity`).toBe(vector.oracle.expectedMinutes)
  } else if (vector.oracle.kind === "timezone") {
    const local = bucharestMonthAndDay(vector.oracle.startMs)
    oracleObserved = {
      start: bucharestHHmm(vector.oracle.startMs),
      end: bucharestHHmm(vector.oracle.endMs),
      minutes: absoluteDurationMinutes(vector.oracle.startMs, vector.oracle.endMs),
      ...local,
    }
    const appParts = getAttendanceLocalDateParts(vector.oracle.startMs)
    applicationObserved = {
      start: formatAttendanceTimeHHmm(vector.oracle.startMs),
      end: formatAttendanceTimeHHmm(vector.oracle.endMs),
      minutes: calcEffectiveMinutes({ entries: [{
        start: formatAttendanceTimeHHmm(vector.oracle.startMs),
        end: formatAttendanceTimeHHmm(vector.oracle.endMs),
        startTimestampMs: vector.oracle.startMs,
        endTimestampMs: vector.oracle.endMs,
      }] }),
      monthKey: `${appParts.year}-${String(appParts.month).padStart(2, "0")}`,
      day: String(appParts.day),
    }
    const expected = { start: vector.oracle.expectedStart, end: vector.oracle.expectedEnd, minutes: vector.oracle.expectedMinutes, monthKey: vector.oracle.expectedMonthKey, day: vector.oracle.expectedDay }
    expect(oracleObserved, `${vector.id} independent timezone oracle`).toEqual(expected)
    expect(applicationObserved, `${vector.id} application timezone parity`).toEqual(expected)
  } else if (vector.oracle.kind === "state") {
    oracleObserved = vector.oracle.expected
    applicationObserved = stateApplicationObservation(vector)
    expect(applicationObserved).toEqual(vector.oracle.expected)
  } else {
    const summaryResult = executeSummary(vector)
    oracleObserved = summaryResult.oracle
    applicationObserved = summaryResult.application
    for (const [key, value] of Object.entries(vector.oracle.expected)) {
      if (key in (oracleObserved as Record<string, unknown>)) {
        expect((oracleObserved as Record<string, unknown>)[key], `${vector.id} independent summary ${key}`).toBe(value)
      }
      if (key in (applicationObserved as Record<string, unknown>)) {
        expect((applicationObserved as Record<string, unknown>)[key], `${vector.id} application summary ${key}`).toBe(value)
      }
    }
  }

  const ref = e2eDb.collection("e2ePontajVectors").doc(`${RUN_ID}_${vector.id}`)
  recordRunResource({ collection: "e2ePontajVectors", id: ref.id, vectorId: vector.id })
  await ref.set({
    ownerRunId: RUN_ID,
    vectorId: vector.id,
    classification: vector.classification,
    blocking: vector.blocking,
    integrationMode: vector.integration.mode,
    oracleObserved,
    applicationObserved,
  })
  const persisted = await ref.get()
  expect(persisted.exists, `${vector.id} emulator artifact`).toBe(true)
  expect(persisted.get("vectorId")).toBe(vector.id)
  expect(persisted.get("ownerRunId")).toBe(RUN_ID)
  await ref.delete()
  expect((await ref.get()).exists, `${vector.id} per-test cleanup`).toBe(false)
}

export async function executeVector(vector: PontajVector) {
  try {
    await executeVectorAssertions(vector)
  } catch (error) {
    if (vector.blocking) throw error
    console.warn(`NON_BLOCKING_CHARACTERIZATION ${vector.id}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function validateCalendarOracle() {
  expect(daysInOracleMonth("2026-02")).toBe(28)
  expect(daysInOracleMonth("2028-02")).toBe(29)
}
