import test from "node:test";
import assert from "node:assert/strict";
import {
  parseInvoiceSagaLink,
  stockInsufficient,
  stockKey,
  unitsMatch,
} from "./catalog";
import { parseInvoiceContent } from "../invoicing/draft";

test("stock comparison aggregates decimal quantities exactly, including negative stock", () => {
  assert.equal(stockInsufficient("0.3", ["0.1", "0,2"]), false);
  assert.equal(stockInsufficient("0.2999999999", ["0.1", "0.2"]), true);
  assert.equal(stockInsufficient("0", ["1"]), true);
  assert.equal(stockInsufficient("-1.25", ["0.1"]), true);
  assert.equal(stockInsufficient("1", [""]), null);
  assert.equal(stockInsufficient("error", ["1"]), null);
});
test("association parser preserves codes and strips browser snapshots", () => {
  const link = {
    fiscalCode: "001234",
    productId: "0001",
    revision: 2,
    warehouseId: "0005",
    warehouseRevision: 1,
  };
  assert.deepEqual(
    parseInvoiceSagaLink({ ...link, snapshot: { code: "forged" } }),
    link,
  );
  assert.equal(parseInvoiceSagaLink(undefined), undefined);
  for (const patch of [
    { revision: 0 },
    { productId: "../x" },
    { warehouseId: "a/b" },
    { warehouseRevision: -1 },
  ])
    assert.throws(() => parseInvoiceSagaLink({ ...link, ...patch }));
  assert.notEqual(stockKey(link), stockKey({ ...link, warehouseRevision: 2 }));
  assert.equal(unitsMatch(" BUC ", "buc"), true);
  assert.equal(unitsMatch("buc", "kg"), false);
});
test("legacy drafts stay valid and catalog input cannot override commercial fields", () => {
  const content = {
    beneficiary: {
      name: "",
      cui: "",
      registration: "",
      address: "",
      bank: "",
      iban: "",
      phone: "",
      email: "",
    },
    date: "",
    dueDate: "",
    currency: "RON",
    vatPercent: "0",
    discountPercent: "0",
    lines: [
      {
        id: "source-0",
        name: "Original",
        um: "KG",
        quantity: "0.5",
        price: "123",
      },
    ],
  };
  const legacy = parseInvoiceContent(content);
  assert.equal(legacy.lines[0].saga, undefined);
  const next = parseInvoiceContent({
    ...content,
    lines: [
      {
        ...content.lines[0],
        saga: {
          fiscalCode: "1234",
          productId: "product",
          revision: 1,
          warehouseId: "",
          snapshot: { price: "0", unit: "BUC" },
        },
      },
    ],
  });
  assert.equal(next.lines[0].price, "123");
  assert.equal(next.lines[0].um, "KG");
  assert.equal(next.lines[0].saga?.snapshot, undefined);
});
