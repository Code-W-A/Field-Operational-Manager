import assert from "node:assert/strict"
import test from "node:test"
import { buildOfferEventDocument, hashOfferEmailBody, hashOfferSnapshot } from "./offer-event-integrity"

test("offer event integrity: hashes snapshot and email body", async () => {
  const snapshot = { total: 120, products: [{ name: "Pompă", quantity: 2, price: 60 }] }
  const html = "<p>Oferta trimisă</p>"

  const doc = await buildOfferEventDocument(
    {
      type: "OFFER_EMAIL_SENT",
      source: "lucrari",
      lucrareId: "lucrare-1",
      actorType: "staff",
      email: "CLIENT@EXAMPLE.COM",
      token: "secret-token",
      snapshot,
      emailBodyHtml: html,
      messageId: "msg-1",
      payload: { subject: "Ofertă" },
    },
    { ip: "127.0.0.1", userAgent: "test-agent", referer: "https://example.test" },
    null,
    "2026-06-27T10:00:00.000Z",
  )

  assert.equal(doc.snapshotHash, await hashOfferSnapshot(snapshot))
  assert.equal(doc.emailBodyHash, await hashOfferEmailBody(html))
  assert.equal(doc.email, "client@example.com")
  assert.equal(typeof doc.eventHash, "string")
  assert.equal(doc.eventHash.length, 64)
})

test("offer event integrity: links previous event hash and never stores raw token", async () => {
  const first = await buildOfferEventDocument(
    {
      type: "OFFER_LINK_OPENED",
      source: "lucrari",
      lucrareId: "lucrare-1",
      actorType: "portal_client",
      token: "raw-token-value",
    },
    { ip: null, userAgent: null, referer: null },
    null,
    "2026-06-27T10:00:00.000Z",
  )

  const second = await buildOfferEventDocument(
    {
      type: "OFFER_CODE_VERIFIED",
      source: "lucrari",
      lucrareId: "lucrare-1",
      actorType: "portal_client",
      token: "raw-token-value",
      email: "client@example.com",
    },
    { ip: null, userAgent: null, referer: null },
    first.eventHash,
    "2026-06-27T10:01:00.000Z",
  )

  assert.equal(second.prevEventHash, first.eventHash)
  assert.notEqual(first.tokenHash, "raw-token-value")
  assert.equal(JSON.stringify(first).includes("raw-token-value"), false)
  assert.equal(JSON.stringify(second).includes("raw-token-value"), false)
})
