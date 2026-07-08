import test from "node:test"
import assert from "node:assert/strict"

import {
  selectLatestActiveSession,
  shouldBlockCheckInForLock,
  shouldBlockCheckoutForLock,
  type LockSessionSnapshot,
} from "@/lib/attendance/active-session-lock"

test("check-in is blocked when lock points to an active session", () => {
  assert.equal(
    shouldBlockCheckInForLock({ id: "att-user-1", userId: "user-1", status: "active", sessionStart: 1000 }),
    true,
  )
})

test("check-in is allowed when lock is missing or stale", () => {
  assert.equal(shouldBlockCheckInForLock(null), false)
  assert.equal(
    shouldBlockCheckInForLock({ id: "att-user-1", userId: "user-1", status: "completed", sessionStart: 1000 }),
    false,
  )
})

test("checkout is blocked when lock points to another active session", () => {
  assert.equal(
    shouldBlockCheckoutForLock({
      requestedSessionId: "att-requested",
      lockedSession: { id: "att-other", userId: "user-1", status: "active", sessionStart: 2000 },
    }),
    true,
  )
})

test("checkout is allowed for matching session or legacy missing lock", () => {
  assert.equal(
    shouldBlockCheckoutForLock({
      requestedSessionId: "att-requested",
      lockedSession: { id: "att-requested", userId: "user-1", status: "active", sessionStart: 1000 },
    }),
    false,
  )
  assert.equal(
    shouldBlockCheckoutForLock({
      requestedSessionId: "att-requested",
      lockedSession: null,
    }),
    false,
  )
})

test("checkout is allowed when stale lock points to a completed session", () => {
  assert.equal(
    shouldBlockCheckoutForLock({
      requestedSessionId: "att-requested",
      lockedSession: { id: "att-other", userId: "user-1", status: "completed", sessionStart: 1000 },
    }),
    false,
  )
})

test("fallback active session selection is deterministic by latest sessionStart", () => {
  const sessions: LockSessionSnapshot[] = [
    { id: "att-old", userId: "user-1", status: "active", sessionStart: 1000 },
    { id: "att-completed", userId: "user-1", status: "completed", sessionStart: 5000 },
    { id: "att-new", userId: "user-1", status: "active", sessionStart: 3000 },
  ]

  assert.equal(selectLatestActiveSession(sessions)?.id, "att-new")
})
