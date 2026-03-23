import test from "node:test"
import assert from "node:assert/strict"
import { parseRawInboxMessage, resolveCrmInboxFetchPlan } from "./inbox-imap.server"

test("resolveCrmInboxFetchPlan bootstraps from recent window on first run", () => {
  const plan = resolveCrmInboxFetchPlan(
    { uidValidity: 321, uidNext: 120, messages: 119 },
    null,
    25,
  )

  assert.deepEqual(plan, {
    searchStartUid: 95,
    bootstrap: true,
    reset: false,
  })
})

test("resolveCrmInboxFetchPlan resets on uid validity change", () => {
  const plan = resolveCrmInboxFetchPlan(
    { uidValidity: 999, uidNext: 80, messages: 79 },
    { uidValidity: 111, lastUid: 70 },
    10,
  )

  assert.deepEqual(plan, {
    searchStartUid: 70,
    bootstrap: true,
    reset: true,
  })
})

test("parseRawInboxMessage extracts plain text snippet", () => {
  const raw = Buffer.from(
    [
      "Message-ID: <abc@example.com>",
      "Date: Mon, 23 Mar 2026 10:00:00 +0200",
      "From: Client <client@example.com>",
      "To: fom@nrg-acces.ro",
      "Cc: sales@example.com",
      "Subject: OP.123 Test",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Salut echipa,",
      "",
      "Acesta este un mesaj nou.",
    ].join("\r\n"),
    "utf8",
  )

  const message = parseRawInboxMessage({ uid: 55, uidValidity: 789, raw })

  assert.equal(message.messageId, "<abc@example.com>")
  assert.equal(message.providerMessageId, "imap:789:55")
  assert.equal(message.from, "Client <client@example.com>")
  assert.deepEqual(message.to, ["fom@nrg-acces.ro"])
  assert.deepEqual(message.cc, ["sales@example.com"])
  assert.equal(message.subject, "OP.123 Test")
  assert.equal(message.bodySnippet, "Salut echipa, Acesta este un mesaj nou.")
})

test("parseRawInboxMessage falls back to stripped html when plain text is missing", () => {
  const raw = Buffer.from(
    [
      "Subject: HTML only",
      "From: client@example.com",
      "To: fom@nrg-acces.ro",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<div><p>Buna <strong>ziua</strong></p><p>Mesaj <br>HTML</p></div>",
    ].join("\r\n"),
    "utf8",
  )

  const message = parseRawInboxMessage({ uid: 3, uidValidity: 999, raw, internalDate: "23-Mar-2026 08:00:00 +0000" })

  assert.equal(message.bodySnippet, "Buna ziua Mesaj HTML")
  assert.equal(message.receivedAt, "2026-03-23T08:00:00.000Z")
})
