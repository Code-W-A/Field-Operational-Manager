import test from "node:test"
import assert from "node:assert/strict"

import {
  buildOfferPdfInput,
  buildOfferVersionPdfInput,
  inferOfferVersionAdjustmentPercent,
  offerPdfAttachmentFileName,
  offerPdfPreviewFileName,
  offerPdfVersionFileName,
  resolveOfferPreparedBy,
} from "@/lib/work-documents/offer-pdf-input"

const sampleWork = {
  numarRaport: "001542",
  offerSendCount: 2,
  client: "Client Test SRL",
  persoanaContact: "Ion Pop",
  echipament: "Ușă X",
  locatie: "Sediu",
  preluatDe: "Dispecer Ana",
  conditiiOferta: ["Plata: 100% în avans"],
  clientInfo: {
    nume: "Client Test SRL",
    cui: "RO123",
    rc: "J40/1",
    adresa: "Str. Test 1",
  },
}

test("buildOfferPdfInput maps products and offer number", () => {
  const input = buildOfferPdfInput({
    lucrareId: "abc123",
    work: sampleWork,
    products: [{ name: "Motor", quantity: 2, price: 150.5 }],
    vatPercent: 19,
    adjustmentPercent: 5,
    preparedAtDate: new Date(2026, 2, 3, 14, 0, 0),
  })

  assert.equal(input.id, "abc123")
  assert.equal(input.numarRaport, "001542")
  assert.equal(input.offerNumber, 3)
  assert.equal(input.products.length, 1)
  assert.equal(input.products[0].name, "Motor")
  assert.equal(input.products[0].quantity, 2)
  assert.equal(input.products[0].price, 150.5)
  assert.equal(input.offerVAT, 19)
  assert.equal(input.adjustmentPercent, 5)
  assert.equal(input.damages?.length, 0)
  assert.deepEqual(input.conditions, sampleWork.conditiiOferta)
})

test("buildOfferPdfInput prefers the current offer author over the dispatcher", () => {
  const input = buildOfferPdfInput({
    lucrareId: "x",
    work: sampleWork,
    fallbackWork: { preluatDe: "Fallback" },
    products: [],
    vatPercent: 0,
    adjustmentPercent: 0,
    preparedByFallback: "User Curent",
    preparedAtDate: new Date(2026, 2, 3),
  })
  assert.equal(input.preparedBy, "User Curent")
})

test("buildOfferPdfInput prefers saved offer author and keeps dispatcher as legacy fallback", () => {
  const input = buildOfferPdfInput({
    lucrareId: "x",
    work: { offerPreparedBy: "Autor Ofertă" },
    fallbackWork: { preluatDe: "Fallback Dispecer", numarRaport: "99" },
    products: [],
    vatPercent: 21,
    adjustmentPercent: 0,
    preparedAtDate: new Date(2026, 2, 3),
  })
  assert.equal(input.preparedBy, "Autor Ofertă")
  assert.equal(input.preparedAt, "03.03.2026")
  assert.equal(input.numarRaport, "99")

  assert.equal(resolveOfferPreparedBy({ work: {}, fallbackWork: { preluatDe: "Fallback Dispecer" } }), "Fallback Dispecer")
})

test("resolveOfferPreparedBy applies the complete author priority", () => {
  const work = { offerPreparedBy: "Autor Salvat", preluatDe: "Dispecer" }
  assert.equal(resolveOfferPreparedBy({ work, preparedByFallback: "Utilizator Curent", preparedByOverride: "Autor Versiune" }), "Autor Versiune")
  assert.equal(resolveOfferPreparedBy({ work, preparedByFallback: "Utilizator Curent" }), "Utilizator Curent")
  assert.equal(resolveOfferPreparedBy({ work }), "Autor Salvat")
  assert.equal(resolveOfferPreparedBy({ work: { preluatDe: "Dispecer" } }), "Dispecer")
})

test("buildOfferPdfInput maps beneficiar from clientInfo", () => {
  const input = buildOfferPdfInput({
    lucrareId: "x",
    work: sampleWork,
    products: [],
    vatPercent: 0,
    adjustmentPercent: 0,
    preparedAtDate: new Date(2026, 0, 1),
  })
  assert.equal(input.beneficiar?.name, "Client Test SRL")
  assert.equal(input.beneficiar?.cui, "RO123")
})

test("offer PDF file names", () => {
  const work = { numarRaport: "001542", id: "id1" }
  assert.equal(offerPdfAttachmentFileName(work, "id1"), "oferta_001542.pdf")
  assert.equal(offerPdfPreviewFileName(work, "id1"), "oferta_001542_previzualizare.pdf")
  assert.equal(offerPdfAttachmentFileName({}, "fallback-id"), "oferta_fallback-id.pdf")
  assert.equal(offerPdfVersionFileName(work, "id1", 2), "oferta_001542_versiunea_2.pdf")
})

test("buildOfferVersionPdfInput preserves a new version snapshot", () => {
  const input = buildOfferVersionPdfInput({
    lucrareId: "abc123",
    work: sampleWork,
    versionNumber: 2,
    fallbackVatPercent: 21,
    version: {
      savedAt: "2026-07-18T07:01:41.000Z",
      savedBy: "Alin Ionescu",
      total: 285,
      products: [{ name: "Motor", quantity: 2, price: 150, total: 300 }],
      vatPercent: 19,
      adjustmentPercent: 5,
      conditions: ["Plata: 30 zile"],
    },
  })

  assert.equal(input.offerNumber, 2)
  assert.equal(input.products[0].name, "Motor")
  assert.equal(input.offerVAT, 19)
  assert.equal(input.adjustmentPercent, 5)
  assert.deepEqual(input.conditions, ["Plata: 30 zile"])
  assert.equal(input.preparedBy, "Alin Ionescu")
  assert.equal(input.preparedAt, "18.07.2026")
})

test("legacy offer version infers discount and uses current ticket metadata", () => {
  const legacyVersion = {
    savedAt: "2026-07-20T07:31:20.000Z",
    total: 270,
    products: [{ name: "Motor vechi", quantity: 2, price: 150, total: 300 }],
  }
  assert.equal(inferOfferVersionAdjustmentPercent(legacyVersion), 10)

  const input = buildOfferVersionPdfInput({
    lucrareId: "abc123",
    work: { ...sampleWork, offerVAT: 20, conditiiOferta: ["Livrare: 5 zile"] },
    version: legacyVersion,
    versionNumber: 1,
    fallbackVatPercent: 21,
  })
  assert.equal(input.products[0].name, "Motor vechi")
  assert.equal(input.offerVAT, 20)
  assert.equal(input.adjustmentPercent, 10)
  assert.deepEqual(input.conditions, ["Livrare: 5 zile"])
})
