import test from "node:test"
import assert from "node:assert/strict"
import { getArchiveValidationDetails, validateArchiveRules } from "./archive-validation"

const DAY = 86400000
const now = Date.parse("2026-11-08T10:00:00Z")
const ago = (days: number) => new Date(now - days * DAY)
const work = {
  statusLucrare: "Finalizat",
  preluatDispecer: true,
  facturaDocument: "invoice.pdf",
  offerSendCount: 1,
}

test("unanswered offers unlock at exactly ten days from successful sending", (t) => {
  t.mock.method(Date, "now", () => now)
  for (const days of [0, 9, 10, 11]) {
    const ticket = { ...work, lastOfferEmail: { status: "sent", sentAt: ago(days).toISOString() } }
    assert.equal(getArchiveValidationDetails(ticket).canArchive, days >= 10)
    assert.equal(validateArchiveRules(ticket).canArchive, days >= 10)
  }
  const beforeDeadline = { ...work, lastOfferEmail: { sentAt: new Date(now - 10 * DAY + 1) } }
  assert.equal(getArchiveValidationDetails(beforeDeadline).canArchive, false)
})

test("legacy thirty-day expirations unlock after ten days without rewriting stored offers", (t) => {
  t.mock.method(Date, "now", () => now)
  for (const days of [9, 10, 20]) {
    const ticket = { ...work, offerActionExpiresAt: new Date(ago(days).getTime() + 30 * DAY) }
    assert.equal(getArchiveValidationDetails(ticket).canArchive, days >= 10)
  }
})

test("regenerating a link does not postpone archiving an existing offer", (t) => {
  t.mock.method(Date, "now", () => now)
  assert.equal(getArchiveValidationDetails({
    ...work,
    lastOfferEmail: { status: "sent", sentAt: { seconds: ago(11).getTime() / 1000 } },
    offerActionReissuedAt: new Date(now),
    offerActionExpiresAt: new Date(now + 30 * DAY),
  }).canArchive, true)
})

test("a failed resend preserves the last successful send deadline; a successful resend resets it", (t) => {
  t.mock.method(Date, "now", () => now)
  const ticket = {
    ...work,
    offerArchiveSentAt: { toDate: () => ago(11) },
    lastOfferEmail: { status: "failed", sentAt: new Date(now).toISOString() },
  }
  assert.equal(getArchiveValidationDetails(ticket).canArchive, true)
  assert.equal(getArchiveValidationDetails({ ...ticket, offerArchiveSentAt: new Date(now) }).canArchive, false)
})

test("missing or invalid sending dates block safely, including regenerated legacy tokens", (t) => {
  t.mock.method(Date, "now", () => now)
  for (const fields of [
    {},
    { lastOfferEmail: { sentAt: "invalid" } },
    { offerActionExpiresAt: { toDate: () => new Date("invalid") } },
    { offerActionExpiresAt: ago(1), offerActionReissuedAt: ago(31) },
  ]) {
    assert.match(getArchiveValidationDetails({ ...work, ...fields }).blockingReasons[0], /nu există data trimiterii/)
    assert.equal(validateArchiveRules({ ...work, ...fields }).canArchive, false)
  }
})

test("responses, the disabled waiting rule and other archive conditions retain their behavior", (t) => {
  t.mock.method(Date, "now", () => now)
  assert.equal(getArchiveValidationDetails({ ...work, offerResponse: { status: "reject" } }).canArchive, true)
  assert.equal(getArchiveValidationDetails({ ...work, offerResponse: { status: "accept" } }).canArchive, false)
  assert.equal(getArchiveValidationDetails({ ...work, offerResponse: { status: "accept" }, reinterventieLansata: true }).canArchive, true)
  assert.equal(getArchiveValidationDetails(work, { offerWait30DaysWhenNoResponse: false }).canArchive, true)
  const overdue = { ...work, lastOfferEmail: { sentAt: ago(11) } }
  assert.equal(getArchiveValidationDetails({ ...overdue, preluatDispecer: false }).canArchive, false)
  assert.equal(getArchiveValidationDetails({ ...overdue, facturaDocument: null }).canArchive, false)
  assert.equal(getArchiveValidationDetails({ ...overdue, statusLucrare: "În lucru" }).canArchive, false)
})
