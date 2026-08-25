import test from "node:test"
import assert from "node:assert/strict"

import { filterHrApprovalRequests, HR_APPROVAL_FILTER_ALL } from "@/lib/hr/hr-requests"
import type { HrRequest } from "@/lib/hr/types"

function request(overrides: Partial<HrRequest> & Pick<HrRequest, "id" | "kind" | "status" | "employeeId">): HrRequest {
  return {
    requesterUid: "user-1",
    sectorId: "sec-1",
    managerUid: "mgr-1",
    payload: { kind: "ADD_OVERTIME", date: "2026-08-21", overtimeHours: 1 },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

const rows: HrRequest[] = [
  request({ id: "1", employeeId: "emp-mihai", employeeName: "Mihai Codrut Sima", kind: "ADD_OVERTIME", status: "pending" }),
  request({ id: "2", employeeId: "emp-daniel", employeeName: "Daniel Ionut Stratulat", kind: "ADD_OVERTIME", status: "approved" }),
  request({
    id: "3",
    employeeId: "emp-mihai",
    employeeName: "Mihai Codrut Sima",
    kind: "CO",
    status: "rejected",
    payload: { kind: "CO", startDate: "2026-08-10", endDate: "2026-08-12" },
  }),
  request({ id: "4", employeeId: "emp-anon", kind: "IN", status: "pending", payload: { kind: "IN", date: "2026-08-11", startTime: "09:00", endTime: "11:00" } }),
]

test("ALL pe toate axele lasă lista neschimbată", () => {
  assert.equal(filterHrApprovalRequests(rows).length, 4)
  assert.equal(
    filterHrApprovalRequests(rows, {
      kind: HR_APPROVAL_FILTER_ALL,
      employeeId: HR_APPROVAL_FILTER_ALL,
      status: HR_APPROVAL_FILTER_ALL,
    }).length,
    4,
  )
})

test("filtrele se combină AND", () => {
  const filtered = filterHrApprovalRequests(rows, {
    kind: "ADD_OVERTIME",
    employeeId: "emp-mihai",
    status: "pending",
  })
  assert.deepEqual(filtered.map((row) => row.id), ["1"])
})

test("status pending e filtrul implicit de inbox", () => {
  const filtered = filterHrApprovalRequests(rows, { status: "pending" })
  assert.deepEqual(filtered.map((row) => row.id), ["1", "4"])
})

test("angajat fără nume rămâne filtrabil pe employeeId", () => {
  const filtered = filterHrApprovalRequests(rows, { employeeId: "emp-anon" })
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, "4")
})

test("listă goală și input invalid nu aruncă", () => {
  assert.deepEqual(filterHrApprovalRequests([]), [])
  assert.deepEqual(filterHrApprovalRequests(undefined as never), [])
})

test("status approved și rejected se izolează", () => {
  assert.deepEqual(filterHrApprovalRequests(rows, { status: "approved" }).map((row) => row.id), ["2"])
  assert.deepEqual(filterHrApprovalRequests(rows, { status: "rejected" }).map((row) => row.id), ["3"])
})

test("tip CO vs ADD_OVERTIME", () => {
  assert.deepEqual(filterHrApprovalRequests(rows, { kind: "CO" }).map((row) => row.id), ["3"])
  assert.deepEqual(filterHrApprovalRequests(rows, { kind: "ADD_OVERTIME" }).map((row) => row.id), ["1", "2"])
})

test("kind ALL + status pending reproduce inbox-ul implicit", () => {
  const filtered = filterHrApprovalRequests(rows, {
    kind: HR_APPROVAL_FILTER_ALL,
    status: "pending",
  })
  assert.deepEqual(filtered.map((row) => row.id), ["1", "4"])
})

test("combinație fără rezultat întoarce listă goală", () => {
  assert.deepEqual(
    filterHrApprovalRequests(rows, { kind: "IN", employeeId: "emp-mihai", status: "approved" }),
    [],
  )
})

test("nu mutează array-ul de input", () => {
  const snapshot = JSON.stringify(rows.map((row) => row.id))
  filterHrApprovalRequests(rows, { status: "pending" })
  assert.equal(JSON.stringify(rows.map((row) => row.id)), snapshot)
  assert.equal(rows.length, 4)
})
