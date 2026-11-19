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

test("unanswered offers unlock at exactly thirty days from successful sending", (t) => {
  t.mock.method(Date, "now", () => now)
  for (const days of [0, 29, 30, 31]) {
    const ticket = { ...work, lastOfferEmail: { status: "sent", sentAt: ago(days).toISOString() } }
    assert.equal(getArchiveValidationDetails(ticket).canArchive, days >= 30)
    assert.equal(validateArchiveRules(ticket).canArchive, days >= 30)
  }
  const beforeDeadline = { ...work, lastOfferEmail: { sentAt: new Date(now - 30 * DAY + 1) } }
  assert.equal(getArchiveValidationDetails(beforeDeadline).canArchive, false)
})

test("legacy thirty-day expirations unlock when the original token expires", (t) => {
  t.mock.method(Date, "now", () => now)
  for (const days of [29, 30, 40]) {
    const ticket = { ...work, offerActionExpiresAt: new Date(ago(days).getTime() + 30 * DAY) }
    assert.equal(getArchiveValidationDetails(ticket).canArchive, days >= 30)
  }
})

test("regenerating a link does not postpone archiving an existing offer", (t) => {
  t.mock.method(Date, "now", () => now)
  assert.equal(getArchiveValidationDetails({
    ...work,
    lastOfferEmail: { status: "sent", sentAt: { seconds: ago(31).getTime() / 1000 } },
    offerActionReissuedAt: new Date(now),
    offerActionExpiresAt: new Date(now + 30 * DAY),
  }).canArchive, true)
})

test("a failed resend preserves the last successful send deadline; a successful resend resets it", (t) => {
  t.mock.method(Date, "now", () => now)
  const ticket = {
    ...work,
    offerArchiveSentAt: { toDate: () => ago(31) },
    lastOfferEmail: { status: "failed", sentAt: new Date(now).toISOString() },
  }
  assert.equal(getArchiveValidationDetails(ticket).canArchive, true)
  assert.equal(getArchiveValidationDetails({ ...ticket, offerArchiveSentAt: new Date(now) }).canArchive, false)
})

test("ticket #001664 archives after thirty days even when the link was regenerated and the date is Romanian", (t) => {
  t.mock.method(Date, "now", () => now)
  const ticket = {
    ...work,
    nrLucrare: "#001664",
    necesitaOferta: true,
    offerVersions: [{ savedAt: "06.07.2026 09:00" }],
    offerActionReissuedAt: "2026-11-01T10:00:00.000Z",
    offerActionExpiresAt: new Date(now + 30 * DAY).toISOString(),
    lastOfferEmail: { status: "failed", sentAt: new Date(now).toISOString() },
  }
  assert.equal(getArchiveValidationDetails(ticket).canArchive, true)
  assert.equal(validateArchiveRules(ticket).canArchive, true)
  assert.equal(getArchiveValidationDetails({
    ...work,
    offerVersions: [{ savedAt: ago(2).toISOString() }],
    offerActionReissuedAt: new Date(now),
    offerActionExpiresAt: new Date(now + 30 * DAY),
    lastOfferEmail: { status: "failed", sentAt: new Date(now).toISOString() },
  }).canArchive, false)
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
  const overdue = { ...work, lastOfferEmail: { sentAt: ago(31) } }
  assert.equal(getArchiveValidationDetails({ ...overdue, preluatDispecer: false }).canArchive, false)
  assert.equal(getArchiveValidationDetails({ ...overdue, facturaDocument: null }).canArchive, false)
  assert.equal(getArchiveValidationDetails({ ...overdue, statusLucrare: "În lucru" }).canArchive, false)
})
