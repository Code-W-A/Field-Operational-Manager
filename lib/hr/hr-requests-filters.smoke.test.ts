import test from "node:test"
import assert from "node:assert/strict"

import {
  E2E_HR_EMPLOYEE_DANIEL_ID,
  E2E_HR_EMPLOYEE_MIHAI_ID,
  E2E_HR_REQUESTS,
} from "@/lib/hr/e2e-fixtures"
import { filterHrApprovalRequests, HR_APPROVAL_FILTER_ALL } from "@/lib/hr/hr-requests"

const inbox = E2E_HR_REQUESTS
const defaultInboxFilters = {
  kind: HR_APPROVAL_FILTER_ALL,
  employeeId: HR_APPROVAL_FILTER_ALL,
  status: "pending" as const,
}

test("smoke: inbox dispecer — default pending arată 3 din 6", () => {
  const filtered = filterHrApprovalRequests(inbox, defaultInboxFilters)
  assert.equal(inbox.length, 6)
  assert.equal(filtered.length, 3)
  assert.deepEqual(
    filtered.map((row) => row.id),
    ["hr-e2e-1", "hr-e2e-2", "hr-e2e-3"],
  )
})

test("smoke: Status → Toate statusurile arată toate cele 6 cereri", () => {
  const filtered = filterHrApprovalRequests(inbox, {
    ...defaultInboxFilters,
    status: HR_APPROVAL_FILTER_ALL,
  })
  assert.equal(filtered.length, 6)
  assert.deepEqual(
    filtered.map((row) => row.id),
    inbox.map((row) => row.id),
  )
})

test("smoke: overtime + un angajat + pending → 1 rând", () => {
  const filtered = filterHrApprovalRequests(inbox, {
    kind: "ADD_OVERTIME",
    employeeId: E2E_HR_EMPLOYEE_MIHAI_ID,
    status: "pending",
  })
  assert.deepEqual(filtered.map((row) => row.id), ["hr-e2e-1"])
})

test("smoke: combinație imposibilă → listă goală", () => {
  const filtered = filterHrApprovalRequests(inbox, {
    kind: "IN",
    employeeId: E2E_HR_EMPLOYEE_DANIEL_ID,
    status: "pending",
  })
  assert.deepEqual(filtered, [])
})
