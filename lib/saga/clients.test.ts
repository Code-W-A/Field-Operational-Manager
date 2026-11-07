import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  clientTaxId,
  normalizeTaxId,
  sameFiscalIdentity,
  validateClientRows,
} from "./clients";
import { parseClientCSV, readClientExport } from "./client-export";

test("CSV preserves quoted delimiters, BOM, escaped quotes, multiline and leading zero codes", () => {
  assert.deepEqual(
    parseClientCSV('\uFEFFCod;Nume;CUI\r\n00123;"Firma; ""Test""";RO123\r\n'),
    [
      ["Cod", "Nume", "CUI"],
      ["00123", 'Firma; "Test"', "RO123"],
    ],
  );
  assert.equal(
    parseClientCSV('Cod,Nume\n0001,"Firma\nTest"')[1][1],
    "Firma\nTest",
  );
  assert.throws(() => parseClientCSV('Cod,Nume\n"unterminated'));
  assert.equal(
    parseClientCSV(
      'Cod;"Nume, descriere, firmă, contact";CUI\n0001;Firma;123',
    )[1][0],
    "0001",
  );
});
test("rows validate countries, reject contradictory codes, and deduplicate identical rows", () => {
  const row = { code: "00123", name: "Firma", taxId: "RO123", country: "ro" };
  assert.equal(validateClientRows([row, row]).length, 1);
  assert.equal(validateClientRows([row])[0].country, "RO");
  assert.throws(() => validateClientRows([row, { ...row, name: "Other" }]));
  assert.throws(() => validateClientRows([{ ...row, country: "" }]));
  assert.throws(() =>
    validateClientRows(Array.from({ length: 5001 }, () => row)),
  );
  assert.throws(() => validateClientRows([{ ...row, code: 123 }]));
});
test("tax identity normalizes selected country without erasing original fiscal values", () => {
  assert.equal(normalizeTaxId(" RO 001.234 ", "RO"), "001234");
  assert.equal(clientTaxId({ cui: "RO123", cif: "123" }, "RO").conflict, false);
  assert.equal(clientTaxId({ cui: "RO123", cif: "124" }, "RO").conflict, true);
  assert.equal(
    sameFiscalIdentity(
      { cui: "123" },
      { code: "1", name: "Firma", taxId: "RO123", country: "RO" },
      "RO",
    ),
    "",
  );
  assert.match(
    sameFiscalIdentity(
      { cui: "124" },
      { code: "1", name: "Firma", taxId: "123", country: "RO" },
      "RO",
    ),
    /diferit/,
  );
  assert.match(
    sameFiscalIdentity(
      { cui: "123" },
      { code: "1", name: "Firma", taxId: "123", country: "DE" },
      "RO",
    ),
    /Țara/,
  );
});
test("XLSX offers sheet selection and flags numeric, formula and date codes", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Ignored").addRows([
    ["Cod", "Nume"],
    ["0000", "Ignored"],
  ]);
  const sheet = workbook.addWorksheet("Clienti");
  sheet.addRows([
    ["Cod", "Nume"],
    ["00123", "Firma"],
    [123, "Numeric"],
    [{ formula: "1+1", result: 2 }, "Formula"],
  ]);
  const result = await readClientExport(
    new Uint8Array(await workbook.xlsx.writeBuffer()),
    "clients.xlsx",
    "Clienti",
  );
  assert.deepEqual(result.sheets, ["Ignored", "Clienti"]);
  assert.equal(result.rows[0][0].text, "00123");
  assert.equal(result.rows[0][0].ambiguous, undefined);
  assert.equal(result.rows[1][0].ambiguous, true);
  assert.equal(result.rows[2][0].ambiguous, true);
});
test("export rejects invalid UTF8, unsupported files and oversize input", async () => {
  await assert.rejects(readClientExport(new Uint8Array([255]), "x.csv"));
  await assert.rejects(
    readClientExport(new Uint8Array(10 * 1024 * 1024 + 1), "x.csv"),
  );
  await assert.rejects(readClientExport(new Uint8Array(), "x.xls"));
});
