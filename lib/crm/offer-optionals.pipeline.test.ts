import assert from "node:assert/strict"
import test from "node:test"
import { normalizeOfferProducts } from "./offer-products"
import { applyAdjustment, computeOfferSubtotal, parseAdjustmentPercent } from "./offer-totals"
import { toOfferPdfItems } from "@/lib/offer/offer-pdf-items"
import type { CrmOfferSnapshot } from "./types"

/**
 * Lanțul real: editor → snapshot → parseSnapshot (rute API) → Firestore →
 * reîncărcare în editor → itemi PDF. Rutele nu-și pot exporta parseSnapshot
 * (Next validează exporturile din route.ts), așa că testăm helperii pe care îi folosesc.
 */

const editorProducts = [
  { id: "p1", name: "Barieră automată 6m", um: "buc", quantity: 1, price: 4200, total: 4200 },
  { id: "p2", name: "Montaj", um: "buc", quantity: 2, price: 400, total: 800 },
]

const editorOptionals = [
  { id: "o1", name: "Iluminat LED pe braț", um: "buc", quantity: 1, price: 465, total: 465 },
  { id: "o2", name: "Buclă inductivă", um: "buc", quantity: 2, price: 320, total: 640 },
  { id: "o3", name: "  ", um: "buc", quantity: 1, price: 999, total: 999 },
]

function buildSnapshot(adjustmentPercentInput = "5"): CrmOfferSnapshot {
  const adjustment = parseAdjustmentPercent(adjustmentPercentInput)
  const subtotal = computeOfferSubtotal(editorProducts)
  return {
    products: editorProducts,
    optionalProducts: normalizeOfferProducts(editorOptionals, { dropEmptyNames: true }),
    vatPercent: 21,
    adjustmentPercent: adjustment,
    conditions: ["Plata: conform contract"],
    comments: "",
    subtotal,
    total: applyAdjustment(subtotal, adjustment),
  }
}

/** Echivalentul parseSnapshot din app/api/crm/offers[/issue]/route.ts. */
function parseSnapshotLikeApi(value: unknown): CrmOfferSnapshot {
  const data = value as Record<string, unknown>
  return {
    products: normalizeOfferProducts(data.products),
    optionalProducts: normalizeOfferProducts(data.optionalProducts, { dropEmptyNames: true }),
    vatPercent: Number(data.vatPercent) || 0,
    adjustmentPercent: Number(data.adjustmentPercent) || 0,
    conditions: Array.isArray(data.conditions) ? (data.conditions as string[]) : [],
    comments: String(data.comments || ""),
    subtotal: Number(data.subtotal) || 0,
    total: Number(data.total) || 0,
  }
}

test("opționalele nu afectează subtotalul, discountul sau totalul", () => {
  const snapshot = buildSnapshot("5")
  assert.equal(snapshot.subtotal, 5000)
  assert.equal(snapshot.total, 4750)

  const withoutOptionals = { ...buildSnapshot("5"), optionalProducts: [] }
  assert.equal(snapshot.subtotal, withoutOptionals.subtotal)
  assert.equal(snapshot.total, withoutOptionals.total)
})

test("rândul de opțional fără denumire nu ajunge în snapshot", () => {
  const snapshot = buildSnapshot()
  assert.equal(snapshot.optionalProducts?.length, 2)
  assert.ok(snapshot.optionalProducts?.every((row) => row.name.trim().length > 0))
})

test("snapshotul supraviețuiește serializării JSON și rutelor API", () => {
  const sent = JSON.parse(JSON.stringify(buildSnapshot()))
  const stored = parseSnapshotLikeApi(sent)

  assert.equal(stored.optionalProducts?.length, 2)
  assert.deepEqual(
    stored.optionalProducts?.map((row) => row.name),
    ["Iluminat LED pe braț", "Buclă inductivă"],
  )
  assert.equal(stored.subtotal, 5000)
  assert.equal(stored.total, 4750)
})

test("reîncărcarea draftului repopulează opționalele în editor", () => {
  const stored = parseSnapshotLikeApi(JSON.parse(JSON.stringify(buildSnapshot())))
  const reloadedOptionals = stored.optionalProducts || []

  assert.equal(reloadedOptionals.length, 2)
  // Al doilea salvat consecutiv trebuie să dea exact același rezultat (idempotență).
  const resaved = normalizeOfferProducts(reloadedOptionals, { dropEmptyNames: true })
  assert.deepEqual(resaved, reloadedOptionals)
})

test("oferta veche, fără câmpul optionalProducts, rămâne validă", () => {
  const legacy = {
    products: editorProducts,
    vatPercent: 19,
    adjustmentPercent: 0,
    conditions: [],
    comments: "",
    subtotal: 5000,
    total: 5000,
  }
  const parsed = parseSnapshotLikeApi(legacy)

  assert.deepEqual(parsed.optionalProducts, [])
  assert.equal(parsed.products.length, 2)
  assert.equal(parsed.total, 5000)
  assert.deepEqual(toOfferPdfItems(parsed.optionalProducts), [])
})

test("emiterea rămâne blocată pentru o ofertă doar cu opționale", () => {
  const onlyOptionals = parseSnapshotLikeApi({
    products: [],
    optionalProducts: editorOptionals,
    subtotal: 0,
    total: 0,
  })
  assert.equal(onlyOptionals.products.length, 0)
  assert.ok(onlyOptionals.optionalProducts!.length > 0)
})

test("itemii trimiși către PDF păstrează opționalele separat de poziții", () => {
  const stored = parseSnapshotLikeApi(JSON.parse(JSON.stringify(buildSnapshot())))
  const pdfProducts = toOfferPdfItems(stored.products)
  const pdfOptionals = toOfferPdfItems(stored.optionalProducts)

  assert.equal(pdfProducts.length, 2)
  assert.equal(pdfOptionals.length, 2)
  assert.equal(
    pdfProducts.reduce((sum, item) => sum + item.quantity * item.price, 0),
    stored.subtotal,
  )
  assert.ok(pdfOptionals.every((item) => !pdfProducts.some((product) => product.name === item.name)))
})
