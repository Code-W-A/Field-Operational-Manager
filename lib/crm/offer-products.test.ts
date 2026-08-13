import assert from "node:assert/strict"
import test from "node:test"
import { normalizeOfferProducts } from "./offer-products"

test("normalizează liniile valide și completează UM implicit", () => {
  const rows = normalizeOfferProducts([
    { id: "a", name: "  Bariera  ", quantity: "2", price: "150.5", total: 301 },
    { id: "b", name: "Telecomanda", um: "set", quantity: 1, price: 90, total: 90 },
  ])
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { id: "a", name: "Bariera", um: "buc", quantity: 2, price: 150.5, total: 301 })
  assert.equal(rows[1].um, "set")
})

test("recalculează totalul când lipsește sau e invalid", () => {
  const rows = normalizeOfferProducts([{ name: "Bucla inductiva", quantity: 3, price: 120 }])
  assert.equal(rows[0].total, 360)
})

test("dropEmptyNames elimină rândurile necompletate", () => {
  const raw = [{ name: "Iluminat pe brat", quantity: 1, price: 465 }, { name: "   ", quantity: 1, price: 0 }]
  assert.equal(normalizeOfferProducts(raw).length, 2)
  assert.equal(normalizeOfferProducts(raw, { dropEmptyNames: true }).length, 1)
})

test("ignoră inputul care nu este listă de obiecte", () => {
  assert.deepEqual(normalizeOfferProducts(undefined), [])
  assert.deepEqual(normalizeOfferProducts("x"), [])
  assert.deepEqual(normalizeOfferProducts([null, 5, "y"]), [])
})
