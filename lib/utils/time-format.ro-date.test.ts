import test from "node:test"
import assert from "node:assert/strict"

import { formatDate, formatUiDate, toDateSafe } from "@/lib/utils/time-format"
import { formatPreparedDate } from "@/lib/work-documents/shared"

test("V8 new Date() mis-parses DD.MM.YYYY with dots as MM.DD (bug Alin)", () => {
  const naive = new Date("03.06.2026")
  assert.equal(naive.getMonth(), 2)
  assert.equal(naive.getDate(), 6)
  const safe = toDateSafe("03.06.2026")
  assert.equal(safe?.getMonth(), 5)
  assert.equal(safe?.getDate(), 3)
})

test("formatUiDate: 03.03.2026 => 3 martie", () => {
  assert.equal(formatUiDate("03.03.2026"), "03 mar 2026")
})

test("formatUiDate: 03.06.2026 => 3 iunie (not 6 martie)", () => {
  assert.equal(formatUiDate("03.06.2026"), "03 iun 2026")
})

test("formatUiDate: 06.03.2026 => 6 martie", () => {
  assert.equal(formatUiDate("06.03.2026"), "06 mar 2026")
})

test("formatUiDate: ISO 2026-03-03 => 3 martie", () => {
  assert.equal(formatUiDate("2026-03-03"), "03 mar 2026")
  assert.equal(formatUiDate("2026-03-03T15:00:00.000Z"), "03 mar 2026")
})

test("formatPreparedDate keeps DD.MM.YYYY for offer PDF pipeline", () => {
  assert.equal(formatPreparedDate("03.03.2026"), "03.03.2026")
  assert.equal(formatPreparedDate("06.03.2026"), "06.03.2026")
  assert.equal(formatPreparedDate(new Date(2026, 2, 3)), "03.03.2026")
})

test("offer PDF line: preparedAt DD.MM then formatUiDate (regression)", () => {
  const preparedAt = formatPreparedDate(new Date(2026, 2, 3))
  assert.equal(preparedAt, "03.03.2026")
  assert.equal(formatUiDate(preparedAt), "03 mar 2026")
})

test("offer PDF line: March 6 RO string stays 6 martie", () => {
  const preparedAt = "06.03.2026"
  assert.equal(formatUiDate(preparedAt), "06 mar 2026")
})

test("formatUiDate rejects swapping 3 March into 6 March via 03.06 string", () => {
  assert.notEqual(formatUiDate("03.06.2026"), "06 mar 2026")
})

test("toDateSafe: 04.06.2026 dataInterventie is 4 June not 6 April (dashboard întârziate)", () => {
  const d = toDateSafe("04.06.2026")
  assert.ok(d)
  assert.equal(d!.getDate(), 4)
  assert.equal(d!.getMonth(), 5)
  assert.equal(d!.getFullYear(), 2026)
})

test("naive new Date would misread 04.06.2026 as April 6", () => {
  const naive = new Date("04.06.2026")
  assert.equal(naive.getMonth(), 3)
  assert.equal(naive.getDate(), 6)
  const safe = toDateSafe("04.06.2026")
  assert.notEqual(safe?.getMonth(), naive.getMonth())
})

test("formatDate: 04.06.2026 => 04.06.2026 (not swapped to 06.04.2026)", () => {
  assert.equal(formatDate("04.06.2026"), "04.06.2026")
})
