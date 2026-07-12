import assert from "node:assert/strict"
import test from "node:test"

import { getLockedAttendanceSessionId } from "./attendance-lock"

test("reads the current activeSessionId lock schema", () => {
  assert.equal(getLockedAttendanceSessionId({ activeSessionId: "S-current" }), "S-current")
})

test("keeps compatibility with the legacy sessionId lock schema", () => {
  assert.equal(getLockedAttendanceSessionId({ sessionId: "S-legacy" }), "S-legacy")
})

test("prefers the current schema when both fields exist", () => {
  assert.equal(getLockedAttendanceSessionId({ activeSessionId: "S-current", sessionId: "S-legacy" }), "S-current")
})
