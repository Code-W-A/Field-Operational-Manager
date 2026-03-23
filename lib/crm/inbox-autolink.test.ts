import test from "node:test"
import assert from "node:assert/strict"
import { extractOpportunityCodeFromSubject, shouldAutoLinkInboxMessage } from "./inbox-autolink"

test("extractOpportunityCodeFromSubject normalizes OP codes with leading zeroes", () => {
  assert.equal(extractOpportunityCodeFromSubject("Re: OP.000123 oferta actualizata"), "OP.123")
  assert.equal(extractOpportunityCodeFromSubject("op.45"), "OP.45")
})

test("extractOpportunityCodeFromSubject ignores invalid subjects", () => {
  assert.equal(extractOpportunityCodeFromSubject("Oferta fara cod"), undefined)
  assert.equal(extractOpportunityCodeFromSubject("OP.0000"), undefined)
})

test("shouldAutoLinkInboxMessage requires exact subject code and unlinked message", () => {
  assert.equal(shouldAutoLinkInboxMessage({ subject: "OP.12 salut" }), true)
  assert.equal(shouldAutoLinkInboxMessage({ subject: "OP.12 salut", opportunityId: "opp_1" }), false)
  assert.equal(shouldAutoLinkInboxMessage({ subject: "OP.12 salut", crmEmailId: "email_1" }), false)
  assert.equal(shouldAutoLinkInboxMessage({ subject: "fara cod" }), false)
})
