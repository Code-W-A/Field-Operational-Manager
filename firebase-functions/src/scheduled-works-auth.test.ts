import assert from "node:assert/strict"
import test from "node:test"
import {
  ScheduledWorksAuthorizationError,
  parseScheduledWorksInput,
  requireScheduledWorksAdmin,
} from "./scheduled-works-auth"

test("scheduled works requires a verified admin", () => {
  assert.throws(
    () => requireScheduledWorksAdmin(undefined, undefined),
    (error) => error instanceof ScheduledWorksAuthorizationError && error.code === "unauthenticated",
  )
  for (const role of ["tehnician", "dispecer", "client", undefined]) {
    assert.throws(
      () => requireScheduledWorksAdmin("uid", role ? { role } : {}),
      (error) => error instanceof ScheduledWorksAuthorizationError && error.code === "permission-denied",
    )
  }
  assert.doesNotThrow(() => requireScheduledWorksAdmin("admin-uid", { role: "admin" }))
})

test("scheduled works accepts only a strict contractId payload", () => {
  assert.deepEqual(parseScheduledWorksInput({ contractId: "contract_123-A" }), { contractId: "contract_123-A" })
  for (const value of [
    null,
    {},
    { contractId: "" },
    { contractId: "a/b" },
    { contractId: "ok", role: "admin" },
    { contractId: "ok", uid: "admin-uid" },
  ]) {
    assert.throws(
      () => parseScheduledWorksInput(value),
      (error) => error instanceof ScheduledWorksAuthorizationError && error.code === "invalid-argument",
    )
  }
})
