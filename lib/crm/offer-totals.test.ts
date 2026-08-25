import assert from "node:assert/strict"
import test from "node:test"
import { applyAdjustment, computeOfferSubtotal, parseAdjustmentPercent } from "./offer-totals"

test("subtotalul folosește totalul liniei când există", () => {
  const subtotal = computeOfferSubtotal([
    { quantity: 1, price: 4200, total: 4200 },
    { quantity: 2, price: 400, total: 800 },
  ])
  assert.equal(subtotal, 5000)
})

test("subtotalul cade pe cantitate × preț când totalul lipsește sau e 0", () => {
  assert.equal(computeOfferSubtotal([{ quantity: 3, price: 120 }]), 360)
  assert.equal(computeOfferSubtotal([{ quantity: 3, price: 120, total: 0 }]), 360)
})

test("subtotalul tratează listele goale și valorile invalide fără NaN", () => {
  assert.equal(computeOfferSubtotal([]), 0)
  assert.equal(computeOfferSubtotal([{ quantity: "abc", price: null }]), 0)
  assert.equal(computeOfferSubtotal(undefined as never), 0)
})

test("discountul acceptă virgulă zecimală și valori invalide", () => {
  assert.equal(parseAdjustmentPercent("7,5"), 7.5)
  assert.equal(parseAdjustmentPercent("10"), 10)
  assert.equal(parseAdjustmentPercent(""), 0)
  assert.equal(parseAdjustmentPercent("abc"), 0)
  assert.equal(parseAdjustmentPercent(null), 0)
  assert.equal(parseAdjustmentPercent(undefined), 0)
})

test("totalul ajustat aplică discountul procentual", () => {
  assert.equal(applyAdjustment(5000, 0), 5000)
  assert.equal(applyAdjustment(5000, 5), 4750)
  assert.equal(applyAdjustment(0, 20), 0)
})

test("opționalele nu pot intra în subtotal: funcția primește doar pozițiile facturabile", () => {
  const products = [{ quantity: 1, price: 4200, total: 4200 }]
  const optionals = [{ quantity: 1, price: 465, total: 465 }]

  const subtotalWithoutOptionals = computeOfferSubtotal(products)
  assert.equal(subtotalWithoutOptionals, 4200)
  // Dacă cineva ar concatena listele, testul de mai jos ar semnala regresia.
  assert.notEqual(computeOfferSubtotal([...products, ...optionals]), subtotalWithoutOptionals)
})
