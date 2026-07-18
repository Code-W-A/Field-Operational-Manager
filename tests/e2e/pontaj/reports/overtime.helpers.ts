import { e2eDb, FieldValue } from "../../fixtures/firebase-admin"
import { HR_EMPLOYEE_ID, resetHrFixture } from "../salariati/hr.helpers"
import { RUN_ID } from "../../fixtures/pontaj-minimal"

export const REPORT_YEAR = "2026"

export async function resetReportsFixture() {
  await resetHrFixture()
}

export async function seedOvertimeRequest(params: {
  id: string
  employeeId?: string
  employeeName?: string
  date: string
  overtimeHours: number
  status?: "approved" | "pending" | "rejected"
  reason?: string
}) {
  await e2eDb.collection("hrRequests").doc(params.id).set({
    employeeId: params.employeeId ?? HR_EMPLOYEE_ID,
    employeeName: params.employeeName ?? `Tehnician ${RUN_ID}`,
    requesterUid: "requester-e2e",
    sectorId: "sector-e2e",
    managerUid: "admin_e2e",
    kind: "ADD_OVERTIME",
    status: params.status ?? "approved",
    payload: {
      kind: "ADD_OVERTIME",
      date: params.date,
      overtimeHours: params.overtimeHours,
      ...(params.reason ? { reason: params.reason } : {}),
    },
    ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function seedReportTimesheet(days: Record<string, unknown>, monthKey = "2026-07", employeeId = HR_EMPLOYEE_ID) {
  await e2eDb.collection("hrTimesheets").doc(`${employeeId}_${monthKey}`).set({
    employeeId,
    monthKey,
    days,
    ownerRunId: RUN_ID,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })
}

export async function reportDocumentCounts() {
  const names = ["attendance", "attendanceActiveSessions", "hrEmployees", "hrRequests", "hrTimesheets", "logs"]
  const entries = await Promise.all(names.map(async (name) => [name, (await e2eDb.collection(name).get()).size] as const))
  return Object.fromEntries(entries)
}
