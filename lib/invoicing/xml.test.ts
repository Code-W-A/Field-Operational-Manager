import assert from "node:assert/strict";
import test from "node:test";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  prepareInvoiceDraft,
  invoiceContent,
  calculateInvoiceTotals,
  parseInvoiceContent,
} from "./draft";
import {
  calculateXmlLines,
  invoiceXml,
  parseIssuer,
  type InvoiceXmlSnapshot,
} from "./xml";
import { issuerFixture, contentFixture, snapshotFixture } from "./xml.fixtures";
test("profile requires explicit fiscal data, matching CIF and Romanian county code", () => {
  assert.equal(parseIssuer(issuerFixture, "123456").iban, "");
  for (const patch of [
    { cui: "999" },
    { county: "Ilfov" },
    { name: "" },
    { vatCashAccounting: undefined },
    { country: "România" },
  ])
    assert.throws(() => parseIssuer({ ...issuerFixture, ...patch }, "123456"));
});
test("discount and VAT allocation exactly match global cents with stable tie order", () => {
  const c = contentFixture();
  c.lines = [0, 1, 2].map((i) => ({
    ...c.lines[0],
    id: String(i),
    quantity: "1",
    price: "0.01",
  }));
  c.discountPercent = "33.3333";
  c.vatPercent = "100";
  const lines = calculateXmlLines(c),
    t = calculateInvoiceTotals(c);
  assert.deepEqual(
    lines.map((l) => l.baseCents),
    [0, 1, 1],
  );
  assert.equal(
    lines.reduce((a, l) => a + l.baseCents, 0),
    t.baseCents,
  );
  assert.equal(
    lines.reduce((a, l) => a + l.vatCents, 0),
    t.vatCents,
  );
});
test("zero VAT, fractional quantities and full discount remain exact", () => {
  for (const discount of ["0", "10", "100"]) {
    const c = contentFixture();
    c.vatPercent = "0";
    c.discountPercent = discount;
    const l = calculateXmlLines(c);
    const t = calculateInvoiceTotals(c);
    assert.equal(l[0].baseCents, t.baseCents);
    assert.equal(l[0].vatCents, 0);
    assert.ok(
      l[0].unitPrice.split(".")[1]?.length <= 8 ||
        !l[0].unitPrice.includes("."),
    );
  }
});
test("XML is valid UTF8 with escaping, diacritics, dates, stable ids and text codes", () => {
  const s = snapshotFixture();
  s.content.dueDate = "2026-11-30";
  const { xml, filename } = invoiceXml(s, "NRG000126");
  assert.equal(XMLValidator.validate(xml), true);
  const parsed = new XMLParser({ parseTagValue: false }).parse(xml).Facturi
    .Factura;
  assert.equal(parsed.Antet.FurnizorNume, "Emitent & Fii");
  assert.equal(parsed.Antet.Cod, "0002");
  assert.equal(parsed.Antet.FacturaData, "07.11.2026");
  assert.equal(parsed.Antet.FacturaScadenta, "30.11.2026");
  assert.equal(parsed.Detalii.Continut.Linie.CodArticolClient, "0001");
  assert.equal(parsed.Detalii.Continut.Linie.Gestiune, "01");
  assert.equal(parsed.Detalii.Continut.Linie.Descriere, s.lines[0].name);
  assert.equal(parsed.GUID_factura, "w");
  assert.equal(filename, "F_123456_NRG000126_07_11_2026.xml");
});
test("services omit inventory warehouse; foreign beneficiaries omit Romanian county", () => {
  const s = snapshotFixture();
  s.lines[0].kind = "service";
  s.content.beneficiary.country = "FR";
  const { xml } = invoiceXml(s, "1");
  assert.ok(!xml.includes("<Gestiune>"));
  assert.ok(xml.includes("<ClientJudet></ClientJudet>"));
});
test("illegal controls and lone surrogates fail XML generation", () => {
  for (const value of ["bad\u0001", "bad\ud800"]) {
    const s = snapshotFixture();
    s.lines[0].name = value;
    assert.throws(() => invoiceXml(s, "1"));
  }
});
test("old drafts work without structured address migration; optional fields roundtrip", () => {
  const c = contentFixture();
  assert.equal(parseInvoiceContent(c).beneficiary.country, "RO");
  delete c.beneficiary.country;
  delete c.beneficiary.city;
  delete c.beneficiary.county;
  assert.equal(parseInvoiceContent(c).beneficiary.country, undefined);
});

test("eight decimal unit price limitation blocks non-reproducible line cents", () => {
  const c = contentFixture();
  c.lines[0].quantity = "999999999";
  c.lines[0].price = "0.0001";
  c.discountPercent = "99.9999";
  assert.throws(
    () => calculateXmlLines(c),
    (e: any) => e.code === "PRICE_PRECISION",
  );
});
