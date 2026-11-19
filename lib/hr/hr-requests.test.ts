import test from "node:test"
import assert from "node:assert/strict"

import { formatHrRequestSerial, hrRequestDateLabel, nextHrRequestSerial } from "@/lib/hr/hr-requests"
import type { HrRequest } from "@/lib/hr/types"

function overtimeRequest(overtimeHours: number): HrRequest {
  return {
    id: "req-1",
    employeeId: "emp-1",
    requesterUid: "user-1",
    sectorId: "sec-1",
    managerUid: "mgr-1",
    kind: "ADD_OVERTIME",
    status: "pending",
    payload: { kind: "ADD_OVERTIME", date: "2026-06-18", overtimeHours },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

test("hrRequestDateLabel — ADD_OVERTIME include durata în listă", () => {
  assert.match(hrRequestDateLabel(overtimeRequest(0.5)), /2026.*30 min/)
  assert.match(hrRequestDateLabel(overtimeRequest(1.5)), /2026.*1,5 h/)
})

test("numărul de delegație este seria automată, nu prefixul id-ului", () => {
  assert.equal(formatHrRequestSerial(42), "0042")
  assert.equal(formatHrRequestSerial(undefined), "—")
  assert.equal(nextHrRequestSerial(41, 40), 42)
  assert.equal(nextHrRequestSerial(10, 57), 58)
  assert.equal(nextHrRequestSerial(undefined, undefined), 1)
  assert.notEqual(formatHrRequestSerial(42), "HR-MOBILE_G")
})
