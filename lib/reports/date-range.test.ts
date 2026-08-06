import assert from "node:assert/strict"
import test from "node:test"
import { formatBucharestFileStamp, parseActivityDateRange } from "./date-range"

test("intervalul folosește miezul nopții Europe/Bucharest vara", () => {
  const range = parseActivityDateRange("2026-07-30", "2026-08-01")
  assert.equal(range.from.toISOString(), "2026-07-29T21:00:00.000Z")
  assert.equal(range.toExclusive.toISOString(), "2026-08-01T21:00:00.000Z")
})

test("intervalul respectă schimbarea la ora de iarnă", () => {
  const range = parseActivityDateRange("2026-10-24", "2026-10-26")
  assert.equal(range.from.toISOString(), "2026-10-23T21:00:00.000Z")
  assert.equal(range.toExclusive.toISOString(), "2026-10-26T22:00:00.000Z")
})

test("respinge intervalele mai lungi de 31 de zile", () => {
  assert.throws(() => parseActivityDateRange("2026-01-01", "2026-02-01"), /maximum 31/)
})

test("formatBucharestFileStamp produce YYYY-MM-DD_HH-mm-ss în Bucharest", () => {
  // 2026-08-05 17:04:29 EEST = 2026-08-05 14:04:29 UTC
  assert.equal(formatBucharestFileStamp(new Date("2026-08-05T14:04:29.000Z")), "2026-08-05_17-04-29")
})

test("formatBucharestFileStamp respectă ora de iarnă", () => {
  // 2026-11-05 10:15:30 EET = 2026-11-05 08:15:30 UTC
  assert.equal(formatBucharestFileStamp(new Date("2026-11-05T08:15:30.000Z")), "2026-11-05_10-15-30")
})

test("formatBucharestFileStamp acceptă string ISO și respinge invalid", () => {
  assert.equal(formatBucharestFileStamp("2026-08-05T14:04:29.000Z"), "2026-08-05_17-04-29")
  assert.equal(formatBucharestFileStamp("not-a-date"), "invalid-date")
})
