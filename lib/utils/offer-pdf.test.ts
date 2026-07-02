import test from "node:test"
import assert from "node:assert/strict"
import { formatOfferResponseProofText } from "@/lib/utils/offer-pdf"

test("formatOfferResponseProofText formats accepted offer proof", () => {
  const text = formatOfferResponseProofText({
    action: "accept",
    actedAt: new Date("2026-07-02T09:05:00"),
    verifiedEmail: "client@example.com",
  })

  assert.equal(text, "Oferta acceptata la data de 02.07.2026 ora 09:05 de pe email client@example.com")
})

test("formatOfferResponseProofText formats rejected offer proof", () => {
  const text = formatOfferResponseProofText({
    action: "reject",
    actedAt: new Date("2026-07-02T18:45:00"),
    verifiedEmail: "client@example.com",
  })

  assert.equal(text, "Oferta refuzata la data de 02.07.2026 ora 18:45 de pe email client@example.com")
})
