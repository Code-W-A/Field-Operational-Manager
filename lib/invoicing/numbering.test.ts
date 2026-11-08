import assert from "node:assert/strict";
import test from "node:test";
import {
  candidateNumbering,
  formatInvoiceNumber,
  nextInvoiceNumber,
  parseLastNumber,
  parseNumberingInput,
  type NumberingConfig,
  type NumberingCounter,
} from "./numbering";
const input = {
  expectedRevision: 0,
  prefix: "NRG",
  lastVerifiedNumber: "000125",
  reason: "",
  exclusiveConfirmed: true,
  sagaVerified: true,
};
test("number arithmetic preserves padding and expands beyond its initial width", () => {
  assert.deepEqual(parseLastNumber("000125"), { number: "125", width: 6 });
  assert.equal(
    formatInvoiceNumber("NRG", nextInvoiceNumber("125"), 6),
    "NRG000126",
  );
  assert.equal(
    formatInvoiceNumber("AA-", nextInvoiceNumber("999"), 3),
    "AA-1000",
  );
  assert.equal(nextInvoiceNumber("9007199254740992"), "9007199254740993");
  assert.throws(() => nextInvoiceNumber("999999999999999999"));
});
test("input requires explicit confirmations and bounded decimal strings", () => {
  assert.equal(parseNumberingInput(input).lastVerifiedNumber, "000125");
  for (const patch of [
    { sagaVerified: false },
    { exclusiveConfirmed: false },
    { lastVerifiedNumber: "1e3" },
    { lastVerifiedNumber: "-1" },
    { lastVerifiedNumber: 123 },
    { lastVerifiedNumber: "1234567890123456789" },
    { prefix: "A\nB" },
    { expectedRevision: -1 },
  ])
    assert.throws(() => parseNumberingInput({ ...input, ...patch }));
});
test("used series and width are immutable and corrections cannot go backwards", () => {
  const config = {
    prefix: "NRG",
    revision: 2,
    hasAllocated: true,
  } as NumberingConfig;
  const counter = {
    lastNumber: "130",
    width: 6,
    allocationCount: 5,
  } as NumberingCounter;
  assert.equal(
    candidateNumbering(
      {
        ...input,
        expectedRevision: 2,
        lastVerifiedNumber: "200",
        reason: "Corecție",
      },
      config,
      counter,
    ).nextNumber,
    "NRG000201",
  );
  for (const patch of [
    { prefix: "OTHER" },
    { lastVerifiedNumber: "129" },
    { reason: "" },
    { expectedRevision: 1 },
  ])
    assert.throws(() =>
      candidateNumbering(
        {
          ...input,
          expectedRevision: 2,
          lastVerifiedNumber: "130",
          reason: "Corecție",
          ...patch,
        },
        config,
        counter,
      ),
    );
});
test("an unused seed can be corrected without consuming a number", () => {
  const config = {
    prefix: "NRG",
    revision: 1,
    hasAllocated: false,
  } as NumberingConfig;
  const counter = {
    lastNumber: "999",
    width: 3,
    allocationCount: 0,
  } as NumberingCounter;
  assert.equal(
    candidateNumbering(
      {
        ...input,
        expectedRevision: 1,
        lastVerifiedNumber: "000125",
        reason: "Corectare inițializare",
      },
      config,
      counter,
    ).nextNumber,
    "NRG000126",
  );
});
