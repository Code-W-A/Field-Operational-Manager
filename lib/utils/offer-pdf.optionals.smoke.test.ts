import test from "node:test"
import assert from "node:assert/strict"
import { generateOfferPdf, type OfferPdfInput } from "@/lib/utils/offer-pdf"

const baseInput: OfferPdfInput = {
  id: "op-1",
  numarRaport: "OP.25",
  client: "Client Test SRL",
  products: [
    { name: "Bariera automata", quantity: 1, price: 4200, um: "buc" },
    { name: "Montaj", quantity: 1, price: 800, um: "buc" },
  ],
  offerVAT: 21,
  adjustmentPercent: 0,
}

test("oferta cu opționale generează PDF valid și mai mare decât cea fără", async () => {
  const withoutOptionals = await generateOfferPdf(baseInput)
  const withOptionals = await generateOfferPdf({
    ...baseInput,
    optionalProducts: [
      { name: "Iluminat LED pe braț", quantity: 1, price: 465, um: "buc" },
      { name: "   ", quantity: 1, price: 100, um: "buc" },
    ],
  })

  const head = Buffer.from(await withOptionals.arrayBuffer()).subarray(0, 4).toString()
  assert.equal(head, "%PDF")
  assert.ok(withOptionals.size > withoutOptionals.size)
})

test("optionalProducts gol nu modifică documentul", async () => {
  const withoutField = await generateOfferPdf(baseInput)
  const withEmptyField = await generateOfferPdf({ ...baseInput, optionalProducts: [] })
  assert.equal(withEmptyField.size, withoutField.size)
})
