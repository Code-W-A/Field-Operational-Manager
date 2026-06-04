import test from "node:test"
import assert from "node:assert/strict"

import {
  buildOfferPdfInput,
  offerPdfAttachmentFileName,
  offerPdfPreviewFileName,
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

test("buildOfferPdfInput prefers preluatDe for preparedBy", () => {
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
  assert.equal(input.preparedBy, "Dispecer Ana")
})

test("buildOfferPdfInput uses fallback preluatDe and preparedAt DD.MM", () => {
  const input = buildOfferPdfInput({
    lucrareId: "x",
    work: {},
    fallbackWork: { preluatDe: "Fallback Dispecer", numarRaport: "99" },
    products: [],
    vatPercent: 21,
    adjustmentPercent: 0,
    preparedByFallback: "Tehnician",
    preparedAtDate: new Date(2026, 2, 3),
  })
  assert.equal(input.preparedBy, "Fallback Dispecer")
  assert.equal(input.preparedAt, "03.03.2026")
  assert.equal(input.numarRaport, "99")
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
})
