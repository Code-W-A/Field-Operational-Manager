import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  validateReferenceRows,
  normalizeReference,
  referenceDecimal,
} from "./references";
import { readClientExport } from "./client-export";
test("Codes preserve zeros, decimal zero differs from missing and VAT zero survives", () => {
  const [r] = validateReferenceRows("articles", [
    { code: "000194", name: "Braț", vat: "0", price: "0", unit: "BUC" },
  ]);
  assert.equal(r.code, "000194");
  assert.equal(r.vat, "0");
  assert.equal(r.price, "0");
  assert.equal(referenceDecimal(""), null);
  assert.equal(referenceDecimal("00012,5000"), "12.5000");
  assert.throws(() => referenceDecimal("-1"));
  assert.throws(() => referenceDecimal("101", true));
});
test("Normalized prefix search handles Romanian accents", () =>
  assert.equal(normalizeReference("  Șurub  "), "surub"));
test("Conflicting duplicate codes reject; identical ones deduplicate", () => {
  assert.equal(
    validateReferenceRows("agents", [
      { code: "0002", name: "Ion" },
      { code: "0002", name: "Ion" },
    ]).length,
    1,
  );
  assert.throws(
    () =>
      validateReferenceRows("agents", [
        { code: "0002", name: "Ion" },
        { code: "0002", name: "Alin" },
      ]),
    /contradictorii/,
  );
});
test("SAGA type properties remain distinct and nullable", () => {
  const [r] = validateReferenceRows("types", [
    {
      code: "M",
      name: "Material",
      purchasable: "da",
      consumable: "nu",
      notStocked: "1",
    },
  ]);
  assert.equal(r.purchasable, true);
  assert.equal(r.consumable, false);
  assert.equal(r.notStocked, true);
  assert.equal(r.sellable, null);
});
test("Unknown, explicitly absent and zero-day client terms differ", () => {
  const r = validateReferenceRows("clientTerms", [
    { code: "1" },
    { code: "2", termState: "none" },
    { code: "3", days: "0" },
  ]);
  assert.deepEqual(
    r.map((x) => [x.termState, x.days]),
    [
      ["unknown", null],
      ["none", null],
      ["days", 0],
    ],
  );
  assert.throws(() =>
    validateReferenceRows("clientTerms", [
      { code: "1", termState: "none", days: "0" },
    ]),
  );
  assert.throws(() =>
    validateReferenceRows("clientTerms", [{ code: "1", days: "-1" }]),
  );
});
test("CSV supports UTF-8 BOM, quoted delimiters and multiline values", async () => {
  const r = await readClientExport(
    new TextEncoder().encode(
      '\ufeffCod;Nume\r\n000194;"Braț; amortizor"\r\n000195;"Linie\nsecundară"',
    ),
    "a.csv",
  );
  assert.equal(r.rows[0][0].text, "000194");
  assert.equal(r.rows[0][1].text, "Braț; amortizor");
  assert.equal(r.rows[1][1].text, "Linie\nsecundară");
});
test("XLSX sheet choice and ambiguous numeric codes", async () => {
  const w = new ExcelJS.Workbook();
  w.addWorksheet("Prima").addRows([
    ["Cod", "Nume"],
    ["0002", "Ion"],
  ]);
  w.addWorksheet("A doua").addRows([
    ["Cod", "Nume"],
    [194, "Braț"],
  ]);
  const b = new Uint8Array(await w.xlsx.writeBuffer());
  const r = await readClientExport(b, "a.xlsx", "A doua");
  assert.equal(r.sheets.length, 2);
  assert.equal(r.rows[0][0].ambiguous, true);
  assert.equal(
    (await readClientExport(b, "a.xlsx", "Prima")).rows[0][0].text,
    "0002",
  );
});
test("Limits and unsupported types reject", async () => {
  assert.throws(() =>
    validateReferenceRows(
      "agents",
      Array.from({ length: 5001 }, (_, i) => ({ code: String(i), name: "A" })),
    ),
  );
  await assert.rejects(() =>
    readClientExport(new Uint8Array(10 * 1024 * 1024 + 1), "a.csv"),
  );
  await assert.rejects(() => readClientExport(new Uint8Array(), "a.xls"));
});
