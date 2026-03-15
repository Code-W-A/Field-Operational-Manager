import test from "node:test"
import assert from "node:assert/strict"
import { categorizeCrmInboxMessage, normalizeInboxText } from "./inbox-categorization.ts"

test("normalizeInboxText removes diacritics and lowercases", () => {
  assert.equal(normalizeInboxText(" Ofertă "), "oferta")
})

test("categorizeCrmInboxMessage matches OFERTA keywords", () => {
  assert.equal(categorizeCrmInboxMessage("Cerere oferta", "Avem nevoie de pret"), "OFERTA")
})

test("categorizeCrmInboxMessage matches FACTURARE keywords", () => {
  assert.equal(categorizeCrmInboxMessage("Factura restanta", "payment reminder"), "FACTURARE")
})

test("categorizeCrmInboxMessage matches SUPORT keywords", () => {
  assert.equal(categorizeCrmInboxMessage("Problema tehnica", "incident deschis"), "SUPORT")
})

test("categorizeCrmInboxMessage matches INSTALARE keywords", () => {
  assert.equal(categorizeCrmInboxMessage("Montaj programat", "punere in functiune"), "INSTALARE")
})

test("categorizeCrmInboxMessage matches ADMIN keywords", () => {
  assert.equal(categorizeCrmInboxMessage("Contract nou", "anexa atasata"), "ADMIN")
})

test("categorizeCrmInboxMessage matches SPAM keywords", () => {
  assert.equal(categorizeCrmInboxMessage("Free money", "crypto casino"), "SPAM")
})

test("categorizeCrmInboxMessage falls back to UNCLASSIFIED", () => {
  assert.equal(categorizeCrmInboxMessage("Salut", "Doar un mesaj informativ"), "UNCLASSIFIED")
})
