import assert from "node:assert/strict"
import test from "node:test"
import { toOfferPdfItems } from "./offer-pdf-items"

test("mapează pozițiile CRM (name/quantity/price/um)", () => {
  const items = toOfferPdfItems([{ id: "a", name: "Bariera", quantity: 2, price: 150, total: 300, um: "buc" }])
  assert.deepEqual(items, [{ name: "Bariera", quantity: 2, price: 150, um: "buc" }])
})

test("acceptă denumirile vechi din lucrări", () => {
  const items = toOfferPdfItems([{ denumire: "Piesă veche", cantitate: 3, pretUnitar: 25 }])
  assert.deepEqual(items, [{ name: "Piesă veche", quantity: 3, price: 25, um: undefined }])
})

test("opționalele din snapshot ajung în PDF cu aceleași reguli ca pozițiile", () => {
  const snapshot = {
    products: [{ name: "Bariera", quantity: 1, price: 4200, total: 4200, um: "buc" }],
    optionalProducts: [{ name: "Iluminat LED", quantity: 1, price: 465, total: 465, um: "buc" }],
  }
  assert.deepEqual(toOfferPdfItems(snapshot.optionalProducts), [
    { name: "Iluminat LED", quantity: 1, price: 465, um: "buc" },
  ])
})

test("snapshot vechi fără optionalProducts produce listă goală, nu eroare", () => {
  const snapshot: Record<string, unknown> = { products: [] }
  assert.deepEqual(toOfferPdfItems(snapshot.optionalProducts), [])
  assert.deepEqual(toOfferPdfItems(undefined), [])
  assert.deepEqual(toOfferPdfItems(null), [])
  assert.deepEqual(toOfferPdfItems("nu e listă"), [])
})

test("valorile lipsă devin 0 / string gol, fără NaN în PDF", () => {
  const items = toOfferPdfItems([{}, { name: "X" }])
  assert.deepEqual(items[0], { name: "", quantity: 0, price: 0, um: undefined })
  assert.equal(items[1].quantity, 0)
  assert.ok(items.every((item) => !Number.isNaN(item.quantity) && !Number.isNaN(item.price)))
})
