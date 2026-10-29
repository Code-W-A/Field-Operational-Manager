import assert from "node:assert/strict"
import test from "node:test"
import { validateCrmOfferForIssue } from "./offer-validation"
import { normalizeOfferProducts } from "./offer-products"

import { completeOffer } from "./offer-test-fixture"

test("valid offer, explicit zero, no optionals and blank lines between conditions are accepted", () => {
  const input = completeOffer()
  input.snapshot.products[0].price = 0
  input.snapshot.conditions.push("", "   ")
  assert.deepEqual(validateCrmOfferForIssue(input), {})
})

test("every text field rejects missing, whitespace and non-text values", () => {
  for (const path of ["subject", "message", "snapshot.validityText", "snapshot.comments", "snapshot.conditions"]) {
    for (const value of [undefined, "", "  \n ", 123, null]) {
      const input: any = completeOffer()
      const [root, key] = path.split(".")
      if (key) input[root][key] = path.endsWith("conditions") ? [value] : value
      else input[root] = value
      assert.ok(validateCrmOfferForIssue(input)[path], path)
    }
  }
})

test("every added product/optional is validated before empty names or units can be normalized", () => {
  for (const group of ["products", "optionalProducts"]) {
    for (const field of ["name", "um", "quantity", "price"]) {
      for (const value of [undefined, null, "", "   ", ...(field === "name" || field === "um" ? [12] : [Number.NaN, Infinity, -1])]) {
        const input: any = completeOffer()
        input.snapshot[group] = [{ ...input.snapshot.products[0], [field]: value }]
        assert.ok(validateCrmOfferForIssue(input)[`snapshot.${group}.0.${field}`], `${group}.${field}=${value}`)
      }
    }
  }
  const input: any = completeOffer()
  input.snapshot.products = []
  assert.ok(validateCrmOfferForIssue(input)["snapshot.products"])
  input.snapshot.products = [null]
  assert.ok(validateCrmOfferForIssue(input)["snapshot.products.0.name"])
})

test("missing numeric settings are not defaulted to zero at issue time", () => {
  const input: any = completeOffer()
  input.snapshot.adjustmentPercent = ""
  assert.ok(validateCrmOfferForIssue(input)["snapshot.adjustmentPercent"])
})

test("draft normalization preserves missing numbers through JSON round trips", () => {
  const rows = normalizeOfferProducts([{ id: "p", name: "Montaj", um: "buc", quantity: 1 }], { preserveIncompleteFields: true })
  const reloaded = normalizeOfferProducts(JSON.parse(JSON.stringify(rows)), { preserveIncompleteFields: true })
  assert.ok(Number.isNaN(reloaded[0].price))
  assert.equal(normalizeOfferProducts([{ quantity: 1 }])[0].price, 0, "legacy callers retain normalization defaults")
})
