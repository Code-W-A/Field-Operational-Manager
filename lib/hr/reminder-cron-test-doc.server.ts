/**
 * Document HR `pending` pentru testarea cron-ului `sendHrRequestPendingApprovalReminders`.
 * Structura este aliniată cu ce scrie `createHrRequest` în `lib/hr/storage.ts` (aceeași colecție `hrRequests`).
 * Nu trece prin `assertNoActiveRequestOverlap` — doar pentru test/manual admin.
 */

export const HR_REMINDER_CRON_TEST_TZ = "Europe/Bucharest"

export type HrReminderCronTestScenario = "weekly" | "day_before"

export function sanitizeHrReminderTestDocId(raw: string): string {
  const s = String(raw || "").trim().replace(/[/\s]/g, "_")
  return s || "seed_hr_reminder_test"
}

export function formatDateKeyInTimeZone(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms))
}

export function addDaysToDateKey(dateKey: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim())
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const shifted = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0))
  shifted.setUTCDate(shifted.getUTCDate() + days)
  const yy = shifted.getUTCFullYear()
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(shifted.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

export function msForBucharestCalendarDate(dateKey: string): number {
  const [y, mo, d] = dateKey.split("-")
  const isoDate = `${y}-${mo}-${d}`
  for (const offset of ["+02:00", "+03:00"]) {
    const ms = new Date(`${isoDate}T12:00:00${offset}`).getTime()
    if (Number.isFinite(ms) && formatDateKeyInTimeZone(ms, HR_REMINDER_CRON_TEST_TZ) === dateKey) {
      return ms
    }
  }
  return new Date(`${isoDate}T10:00:00Z`).getTime()
}

export type HrReminderCronTestDocBody = {
  employeeId: string
  employeeName: string
  requesterUid: string
  sectorId: string
  managerUid: string
  kind: "CO"
  status: "pending"
  payload: {
    kind: "CO"
    startDate: string
    endDate: string
    reason?: string
  }
  rejectionReason: null
  emailChannel: "nextjs"
}

export function buildHrReminderCronTestDoc(params: {
  scenario: HrReminderCronTestScenario
  nowMs: number
  managerUid: string
  requesterUid: string
  docId: string
  sectorId?: string
  employeeId?: string
}): {
  body: HrReminderCronTestDocBody
  createdAtMs: number
  summary: { todayKey: string; scenario: HrReminderCronTestScenario; scenarioNote: string }
} {
  const todayKey = formatDateKeyInTimeZone(params.nowMs, HR_REMINDER_CRON_TEST_TZ)
  const sectorId = String(params.sectorId || "seed").trim() || "seed"
  const safeDocId = sanitizeHrReminderTestDocId(params.docId)
  const employeeId =
    String(params.employeeId || "").trim() || `hr_cron_test_${safeDocId.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48)}`

  let payload: HrReminderCronTestDocBody["payload"]
  let createdAtMs: number
  let scenarioNote: string

  if (params.scenario === "day_before") {
    const startDateKey = addDaysToDateKey(todayKey, 1)
    if (!startDateKey) throw new Error("startDateKey invalid")
    createdAtMs = msForBucharestCalendarDate(todayKey)
    const endDate = addDaysToDateKey(startDateKey, 4) || startDateKey
    payload = { kind: "CO", startDate: startDateKey, endDate: endDate }
    scenarioNote = `Ziua dinainte: startDate=${startDateKey} (mâine față de azi ${todayKey}).`
  } else if (params.scenario === "weekly") {
    const createdDateKey = addDaysToDateKey(todayKey, -7)
    if (!createdDateKey) throw new Error("createdDateKey invalid")
    createdAtMs = msForBucharestCalendarDate(createdDateKey)
    const startDateKey = addDaysToDateKey(todayKey, 14) || todayKey
    const endDate = addDaysToDateKey(startDateKey, 5) || startDateKey
    payload = { kind: "CO", startDate: startDateKey, endDate: endDate }
    scenarioNote = `Săptămânal: createdAt ≈ ${createdDateKey} (București), 7 zile înainte de ${todayKey}. startDate=${startDateKey}.`
  } else {
    throw new Error('scenario trebuie să fie "weekly" sau "day_before"')
  }

  const body: HrReminderCronTestDocBody = {
    employeeId,
    employeeName: "Test reminder HR (șterge după test)",
    requesterUid: params.requesterUid,
    sectorId,
    managerUid: params.managerUid,
    kind: "CO",
    status: "pending",
    payload,
    rejectionReason: null,
    emailChannel: "nextjs",
  }

  return {
    body,
    createdAtMs,
    summary: { todayKey, scenario: params.scenario, scenarioNote },
  }
}
