import test from "node:test"
import assert from "node:assert/strict"
import { normalizeProductDecimalInput, parseProductDecimalInput } from "./product-table-form"

test("ProductTableForm: accepts comma as decimal separator", () => {
  assert.equal(normalizeProductDecimalInput("12,50"), "12.50")
  assert.equal(parseProductDecimalInput("12,50"), 12.5)
})

test("ProductTableForm: keeps decimal input stable while typing", () => {
  assert.equal(normalizeProductDecimalInput("1,2 lei"), "1.2")
  assert.equal(normalizeProductDecimalInput("1.2.3"), "1.23")
  assert.equal(parseProductDecimalInput(""), undefined)
})

