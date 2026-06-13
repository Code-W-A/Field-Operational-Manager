import test from "node:test"
import assert from "node:assert/strict"
import {
  SUSPENDED_CONTRACT_MESSAGE,
  canCreateContractWork,
  isContractSuspended,
  normalizeContractStatus,
} from "./contract-status"

test("legacy contracts without status remain active", () => {
  assert.equal(normalizeContractStatus(undefined), "active")
  assert.equal(canCreateContractWork({}), true)
})

test("only suspended status blocks new contract work", () => {
  assert.equal(isContractSuspended({ status: "suspended" }), true)
  assert.equal(canCreateContractWork({ status: "suspended" }), false)
  assert.equal(canCreateContractWork({ status: "active" }), true)
  assert.match(SUSPENDED_CONTRACT_MESSAGE, /Nu se pot emite tichete noi/)
})

test("normalizeContractStatus accepts uppercase, padded and mixed-case values", () => {
  assert.equal(normalizeContractStatus("SUSPENDED"), "suspended")
  assert.equal(normalizeContractStatus("Suspended"), "suspended")
  assert.equal(normalizeContractStatus("  suspended  "), "suspended")
  assert.equal(normalizeContractStatus("sUsPeNdEd"), "suspended")
})

test("normalizeContractStatus defaults unknown / empty / null values to active", () => {
  assert.equal(normalizeContractStatus(null), "active")
  assert.equal(normalizeContractStatus(""), "active")
  assert.equal(normalizeContractStatus("   "), "active")
  assert.equal(normalizeContractStatus("paused"), "active")
  assert.equal(normalizeContractStatus("inactive"), "active")
  assert.equal(normalizeContractStatus(123 as any), "active")
})

test("isContractSuspended is null-safe", () => {
  assert.equal(isContractSuspended(null), false)
  assert.equal(isContractSuspended(undefined), false)
  assert.equal(isContractSuspended({}), false)
  assert.equal(isContractSuspended({ status: "Suspended" }), true)
})

test("canCreateContractWork mirrors isContractSuspended", () => {
  for (const contract of [null, undefined, {}, { status: "active" }, { status: "ACTIVE" }]) {
    assert.equal(canCreateContractWork(contract as any), true)
  }
  for (const contract of [{ status: "suspended" }, { status: "SUSPENDED" }, { status: "  suspended" }]) {
    assert.equal(canCreateContractWork(contract), false)
  }
})
