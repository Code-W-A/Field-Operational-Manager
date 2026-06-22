import test from "node:test"
import assert from "node:assert/strict"

import { getTicketEmitent } from "./ticket-emitent"

test("getTicketEmitent returns createdByName when present", () => {
  assert.equal(getTicketEmitent({ createdByName: "Ion Popescu" }), "Ion Popescu")
})

test("getTicketEmitent trims surrounding whitespace", () => {
  assert.equal(getTicketEmitent({ createdByName: "  Maria Ionescu  " }), "Maria Ionescu")
})

test("getTicketEmitent falls back to 'Necunoscut' when missing or empty", () => {
  assert.equal(getTicketEmitent({}), "Necunoscut")
  assert.equal(getTicketEmitent({ createdByName: "" }), "Necunoscut")
  assert.equal(getTicketEmitent({ createdByName: "   " }), "Necunoscut")
  assert.equal(getTicketEmitent(null), "Necunoscut")
  assert.equal(getTicketEmitent(undefined), "Necunoscut")
})

test("getTicketEmitent honors a custom fallback", () => {
  assert.equal(getTicketEmitent(null, "-"), "-")
})
