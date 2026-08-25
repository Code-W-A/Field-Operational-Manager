import type { Department, HrRequest } from "@/lib/hr/types"

/**
 * Fixture HR pentru Playwright (NEXT_PUBLIC_E2E_TEST_MODE=true).
 * `user1` este adminul mock din MockDataContext, deci cererile trebuie să aibă
 * `managerUid: "user1"` ca `subscribeHrRequestsForManager` să le livreze inbox-ului.
 */

export const E2E_HR_MANAGER_UID = "user1"
export const E2E_HR_DEPARTMENT_ID = "dept-operational"
export const E2E_HR_EMPLOYEE_MIHAI_ID = "emp-mihai"
export const E2E_HR_EMPLOYEE_DANIEL_ID = "emp-daniel"
export const E2E_HR_EMPLOYEE_MIHAI_NAME = "Mihai Codrut Sima"
export const E2E_HR_EMPLOYEE_DANIEL_NAME = "Daniel Ionut Stratulat"

export const E2E_HR_DEPARTMENTS: Department[] = [
  {
    id: E2E_HR_DEPARTMENT_ID,
    name: "Operational",
    active: true,
    createdAt: 1,
    updatedAt: 1,
  },
]

function request(overrides: Partial<HrRequest> & Pick<HrRequest, "id" | "kind" | "status" | "employeeId" | "employeeName" | "payload" | "createdAt">): HrRequest {
  return {
    requesterUid: "tech-1",
    sectorId: E2E_HR_DEPARTMENT_ID,
    managerUid: E2E_HR_MANAGER_UID,
    updatedAt: overrides.createdAt,
    ...overrides,
  }
}

/** Inbox dispecer: 6 cereri, 2 angajați, 3 pending (default). */
export const E2E_HR_REQUESTS: HrRequest[] = [
  request({
    id: "hr-e2e-1",
    employeeId: E2E_HR_EMPLOYEE_MIHAI_ID,
    employeeName: E2E_HR_EMPLOYEE_MIHAI_NAME,
    kind: "ADD_OVERTIME",
    status: "pending",
    documentSerial: 40,
    createdAt: 6,
    payload: { kind: "ADD_OVERTIME", date: "2026-08-21", overtimeHours: 2 },
  }),
  request({
    id: "hr-e2e-2",
    employeeId: E2E_HR_EMPLOYEE_DANIEL_ID,
    employeeName: E2E_HR_EMPLOYEE_DANIEL_NAME,
    kind: "ADD_OVERTIME",
    status: "pending",
    documentSerial: 39,
    createdAt: 5,
    payload: { kind: "ADD_OVERTIME", date: "2026-08-20", overtimeHours: 1.5 },
  }),
  request({
    id: "hr-e2e-3",
    employeeId: E2E_HR_EMPLOYEE_MIHAI_ID,
    employeeName: E2E_HR_EMPLOYEE_MIHAI_NAME,
    kind: "IN",
    status: "pending",
    documentSerial: 38,
    createdAt: 4,
    payload: { kind: "IN", date: "2026-08-19", startTime: "09:00", endTime: "11:00" },
  }),
  request({
    id: "hr-e2e-4",
    employeeId: E2E_HR_EMPLOYEE_DANIEL_ID,
    employeeName: E2E_HR_EMPLOYEE_DANIEL_NAME,
    kind: "ADD_OVERTIME",
    status: "approved",
    documentSerial: 37,
    createdAt: 3,
    payload: { kind: "ADD_OVERTIME", date: "2026-08-18", overtimeHours: 3 },
  }),
  request({
    id: "hr-e2e-5",
    employeeId: E2E_HR_EMPLOYEE_MIHAI_ID,
    employeeName: E2E_HR_EMPLOYEE_MIHAI_NAME,
    kind: "CO",
    status: "rejected",
    documentSerial: 36,
    createdAt: 2,
    payload: { kind: "CO", startDate: "2026-08-10", endDate: "2026-08-12" },
  }),
  request({
    id: "hr-e2e-6",
    employeeId: E2E_HR_EMPLOYEE_DANIEL_ID,
    employeeName: E2E_HR_EMPLOYEE_DANIEL_NAME,
    kind: "CFP",
    status: "approved",
    documentSerial: 35,
    createdAt: 1,
    payload: { kind: "CFP", startDate: "2026-08-04", endDate: "2026-08-05" },
  }),
]
