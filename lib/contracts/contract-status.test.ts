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
