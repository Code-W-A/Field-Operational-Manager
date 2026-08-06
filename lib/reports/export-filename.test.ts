import assert from "node:assert/strict"
import test from "node:test"
import { uninvoicedExportBasename } from "./export-filename"

test("basename export nefacturate include stamp Bucharest cu oră de emisie", () => {
  // 2026-08-05 17:04:29 EEST = 2026-08-05 14:04:29 UTC
  assert.equal(
    uninvoicedExportBasename(new Date("2026-08-05T14:04:29.000Z")),
    "tichete-nefacturate_2026-08-05_17-04-29",
  )
})

test("basename acceptă și string ISO", () => {
  assert.equal(
    uninvoicedExportBasename("2026-01-15T10:00:00.000Z"),
    "tichete-nefacturate_2026-01-15_12-00-00",
  )
})
