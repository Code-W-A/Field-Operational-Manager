import test from "node:test"
import assert from "node:assert/strict"

import { KIOSK_ELIGIBLE_ROLES, loadKioskEligibleRoster } from "./kiosk-roster-loader"

test("kiosk roster propagates an hrEmployees query error and the next explicit retry can recover", async () => {
  let shouldFail = true
  const load = () => loadKioskEligibleRoster({
    loadEmployees: async () => {
      if (shouldFail) throw new Error("hrEmployees unavailable")
      return [{ id: "emp-1", prenume: "Ana", nume: "E2E", fullName: "Ana E2E", active: true, userUid: "user-1" }]
    },
    loadUsersForRole: async (role) => {
      return role === "tehnician" ? [{ uid: "user-1", role, email: "ana@e2e.invalid" }] : []
    },
  })

  await assert.rejects(load(), /hrEmployees unavailable/)
  shouldFail = false
  const roster = await load()
  assert.deepEqual(roster.map((user) => user.uid), ["user-1"])
})

for (const failingRole of KIOSK_ELIGIBLE_ROLES) {
  test(`kiosk roster propagates users/${failingRole} query failure without emitting a partial roster`, async () => {
    let calls = 0
    await assert.rejects(
      loadKioskEligibleRoster({
        loadEmployees: async () => [{ id: "emp-1", prenume: "Ana", nume: "E2E", fullName: "Ana E2E", active: true, userUid: "user-1" }],
        loadUsersForRole: async (role) => {
          calls += 1
          if (role === failingRole) throw new Error(`users/${role} unavailable`)
          return role === "tehnician" ? [{ uid: "user-1", role, email: "ana@e2e.invalid" }] : []
        },
      }),
      new RegExp(`users/${failingRole} unavailable`),
    )
    assert.equal(calls, KIOSK_ELIGIBLE_ROLES.length)
  })
}
