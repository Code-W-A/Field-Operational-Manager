import assert from "node:assert/strict"
import test from "node:test"
import { parseActivityDateRange } from "./date-range"

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
