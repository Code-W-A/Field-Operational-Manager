import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_OFFER_VAT_PERCENT, normalizeVatPercent } from "./offer-vat"

test("normalizeVatPercent acceptă număr valid", () => {
  assert.equal(normalizeVatPercent(21), 21)
  assert.equal(normalizeVatPercent(19), 19)
  assert.equal(normalizeVatPercent(0), 0)
})

test("normalizeVatPercent parsează string și virgulă", () => {
  assert.equal(normalizeVatPercent("21"), 21)
  assert.equal(normalizeVatPercent("19,5"), 19.5)
})

test("normalizeVatPercent folosește fallback pentru invalid", () => {
  assert.equal(normalizeVatPercent(undefined), DEFAULT_OFFER_VAT_PERCENT)
  assert.equal(normalizeVatPercent("abc"), DEFAULT_OFFER_VAT_PERCENT)
  assert.equal(normalizeVatPercent(-1), DEFAULT_OFFER_VAT_PERCENT)
  assert.equal(normalizeVatPercent(NaN, 19), 19)
})
