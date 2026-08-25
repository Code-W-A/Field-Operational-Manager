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
  assert.equal(normalizeOfferProducts([{ name: "Bucla inductiva", quantity: 3, price: 120 }])[0].total, 360)
  assert.equal(normalizeOfferProducts([{ name: "X", quantity: 3, price: 120, total: "abc" }])[0].total, 360)
  assert.equal(normalizeOfferProducts([{ name: "X", quantity: 3, price: 120, total: null }])[0].total, 360)
})

test("un total 0 incoerent se recalculează, la fel ca în editor", () => {
  assert.equal(normalizeOfferProducts([{ name: "Consumabile", quantity: 2, price: 50, total: 0 }])[0].total, 100)
})

test("poziția cu preț 0 rămâne 0 (serviciu inclus)", () => {
  assert.equal(normalizeOfferProducts([{ name: "Transport inclus", quantity: 1, price: 0 }])[0].total, 0)
})

test("acceptă cantități și prețuri zecimale sau negative (storno)", () => {
  const rows = normalizeOfferProducts([
    { name: "Cablu", quantity: 12.5, price: 7.4 },
    { name: "Discount pozitie", quantity: 1, price: -200 },
  ])
  assert.equal(rows[0].total, 92.5)
  assert.equal(rows[1].total, -200)
})

test("id și UM lipsă primesc valori sigure, fără a arunca", () => {
  const rows = normalizeOfferProducts([{ name: "Fara id", quantity: 1, price: 10, um: "   " }])
  assert.equal(rows[0].id, "")
  assert.equal(rows[0].um, "buc")
})

test("valorile nenumerice devin 0, nu NaN", () => {
  const rows = normalizeOfferProducts([{ name: "Y", quantity: "abc", price: undefined }])
  assert.equal(rows[0].quantity, 0)
  assert.equal(rows[0].price, 0)
  assert.equal(rows[0].total, 0)
  assert.ok(!Number.isNaN(rows[0].total))
})

test("dropEmptyNames elimină rândurile necompletate", () => {
  const raw = [{ name: "Iluminat pe brat", quantity: 1, price: 465 }, { name: "   ", quantity: 1, price: 0 }]
  assert.equal(normalizeOfferProducts(raw).length, 2)
  assert.equal(normalizeOfferProducts(raw, { dropEmptyNames: true }).length, 1)
  assert.equal(normalizeOfferProducts(raw, { dropEmptyNames: true })[0].name, "Iluminat pe brat")
})

test("fără dropEmptyNames rândurile goale rămân (comportament draft neschimbat)", () => {
  const rows = normalizeOfferProducts([{ id: "row_1", name: "", quantity: 1, price: 0 }])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, "row_1")
})

test("ignoră inputul care nu este listă de obiecte", () => {
  assert.deepEqual(normalizeOfferProducts(undefined), [])
  assert.deepEqual(normalizeOfferProducts(null), [])
  assert.deepEqual(normalizeOfferProducts("x"), [])
  assert.deepEqual(normalizeOfferProducts({ name: "nu e listă" }), [])
  assert.deepEqual(normalizeOfferProducts([null, 5, "y", []]), [])
})

test("elimină cheile străine din snapshot (whitelist)", () => {
  const rows = normalizeOfferProducts([
    { name: "Z", quantity: 1, price: 10, total: 10, __proto__polluted: true, notes: "secret" } as Record<string, unknown>,
  ])
  assert.deepEqual(Object.keys(rows[0]).sort(), ["id", "name", "price", "quantity", "total", "um"])
})

test("nu mutează inputul primit", () => {
  const input = [{ name: " A ", quantity: 1, price: 10 }]
  const snapshot = JSON.stringify(input)
  normalizeOfferProducts(input, { dropEmptyNames: true })
  assert.equal(JSON.stringify(input), snapshot)
})
