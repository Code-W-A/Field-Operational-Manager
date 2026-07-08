import test from "node:test"
import assert from "node:assert/strict"

import {
  ATTENDANCE_TIME_ZONE,
  formatAttendanceTimeHHmm,
  getAttendanceLocalDateParts,
} from "@/lib/attendance/attendance-timezone"
import { buildAttendanceEntriesFromSessions } from "@/lib/attendance/sync-timesheet-entries"
import type { AttendanceSession } from "@/types/attendance"

test("formatAttendanceTimeHHmm uses Europe/Bucharest summer time", () => {
  assert.equal(ATTENDANCE_TIME_ZONE, "Europe/Bucharest")
  assert.equal(formatAttendanceTimeHHmm(Date.parse("2026-07-08T09:52:00.000Z")), "12:52")
})

test("formatAttendanceTimeHHmm uses Europe/Bucharest winter time", () => {
  assert.equal(formatAttendanceTimeHHmm(Date.parse("2026-01-08T10:52:00.000Z")), "12:52")
})

test("formatAttendanceTimeHHmm keeps zero-padded minutes", () => {
  assert.equal(formatAttendanceTimeHHmm(Date.parse("2026-07-08T02:05:00.000Z")), "05:05")
})

test("getAttendanceLocalDateParts returns Bucharest calendar parts", () => {
  assert.deepEqual(getAttendanceLocalDateParts(Date.parse("2026-07-08T21:30:00.000Z")), {
    year: 2026,
    month: 7,
    day: 9,
    hour: 0,
    minute: 30,
  })
})

test("buildAttendanceEntriesFromSessions formats pontaj and extra logs in Bucharest time", () => {
  const session: AttendanceSession = {
    id: "att-test",
    userId: "user-test",
    userName: "Technician Test",
    sessionStart: Date.parse("2026-07-08T09:52:00.000Z"),
    sessionEnd: Date.parse("2026-07-08T10:27:00.000Z"),
    mode: "field",
    status: "completed",
    location: { lat: 44.4, lng: 26.1 },
    createdAt: Date.parse("2026-07-08T09:52:00.000Z"),
    updatedAt: Date.parse("2026-07-08T10:27:00.000Z"),
    extraTimeLogs: [
      {
        type: "to_client",
        startTime: Date.parse("2026-07-08T04:30:00.000Z"),
        endTime: Date.parse("2026-07-08T05:00:00.000Z"),
        minutesEligible: 30,
      },
    ],
  } as AttendanceSession

  const entries = buildAttendanceEntriesFromSessions([session])

  assert.equal(entries[0].project, "Pontaj")
  assert.equal(entries[0].start, "12:52")
  assert.equal(entries[0].end, "13:27")
  assert.equal(entries[1].project, "Traseu către client")
  assert.equal(entries[1].start, "07:30")
  assert.equal(entries[1].end, "08:00")
})
