import test from "node:test"
import assert from "node:assert/strict"

import {
  buildEditDialogCalendarEvents,
  computeRevisionSchedulePreview,
  getDefaultCalendarRange,
} from "@/lib/contracts/revision-calendar"

test("smoke — flux edit dialog → evenimente calendar", () => {
  const { start, end } = getDefaultCalendarRange(new Date(2026, 4, 31))
  const events = buildEditDialogCalendarEvents(
    {
      startDate: "2026-01-15",
      recurrenceInterval: 3,
      recurrenceUnit: "luni",
      daysBeforeWork: 10,
      locationIds: ["Sediu", "Depozit"],
      locationNames: ["Sediu", "Depozit"],
    },
    { id: "sm-1", name: "Mentenanță centrală Acme", number: "MNT-2026-001" },
    computeRevisionSchedulePreview({
      startDate: "2025-01-15",
      recurrenceInterval: 3,
      recurrenceUnit: "luni",
    }),
    start,
    end,
  )

  assert.ok(events.length >= 2)
  assert.equal(events[0].contractNumber, "MNT-2026-001")
})
