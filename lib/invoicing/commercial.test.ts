import { test } from "node:test";
import assert from "node:assert/strict";
import { commercialAmounts, dueFromTerm, commercialText } from "./commercial";
import { parseInvoiceContent, calculateInvoiceTotals } from "./draft";
import { contentFixture, snapshotFixture } from "./xml.fixtures";
import { calculateXmlLines, invoiceXml } from "./xml";
import { verifyInvoiceArtifact, digest } from "./saga-artifact.server";
const content = () => {
  const c = contentFixture();
  c.commercial = {
    version: 2,
    policyRevision: 1,
    dueMode: "auto",
    termKey: "key",
    termDays: 0,
  };
  c.dueDate = c.date;
  c.extraInfo = "Notă & <test>";
  c.lines[0] = {
    ...c.lines[0],
    price: "10.12345678",
    vatPercent: "0",
    extraInfo: "Detaliu & <linie>",
  };
  return c;
};
test("mixed VAT and discount reconcile exact line/group/invoice cents", () => {
  const c = content();
  c.lines.push({
    ...c.lines[0],
    id: "b",
    quantity: "2.5",
    price: "11.23",
    vatPercent: "21",
  });
  c.lines.push({
    ...c.lines[0],
    id: "c",
    quantity: "0.33",
    price: "9.99",
    vatPercent: "11",
  });
  const a = commercialAmounts(c),
    sum = (v: bigint[]) => Number(v.reduce((a, b) => a + b, BigInt(0)));
  assert.equal(sum(a.bases), a.totals.baseCents);
  assert.equal(sum(a.vats), a.totals.vatCents);
  assert.equal(
    a.totals.vatGroups!.reduce((s, g) => s + g.vatCents, 0),
    a.totals.vatCents,
  );
  assert.equal(
    a.totals.subtotalCents - a.totals.discountCents + a.totals.vatCents,
    a.totals.totalCents,
  );
  assert.equal(a.totals.incomplete, false);
});
test("zero price/missing price/VAT are incomplete; VAT zero is valid", () => {
  const c = content();
  assert.equal(calculateInvoiceTotals(c).incomplete, false);
  for (const p of ["", "0"]) {
    c.lines[0].price = p;
    assert.equal(calculateInvoiceTotals(c).incomplete, true);
  }
  c.lines[0].price = "10";
  c.lines[0].vatPercent = "";
  assert.equal(calculateInvoiceTotals(c).incomplete, true);
});
test("rounding uses deterministic row order for equal remainders", () => {
  const c = content();
  c.discountPercent = "10";
  c.lines = Array.from({ length: 3 }, (_, i) => ({
    ...c.lines[0],
    id: String(i),
    quantity: "1",
    price: "0.05",
    vatPercent: "21",
  }));
  const a = commercialAmounts(c);
  assert.deepEqual(a.bases, [BigInt(4), BigInt(4), BigInt(5)]);
  assert.equal(a.totals.discountCents, 2);
});
test("due date handles zero/absent terms and leap/day/year boundaries", () => {
  assert.equal(dueFromTerm("2024-02-28", 1), "2024-02-29");
  assert.equal(dueFromTerm("2026-12-31", 1), "2027-01-01");
  assert.equal(dueFromTerm("2026-11-08", 0), "2026-11-08");
  assert.equal(dueFromTerm("2026-11-08", null), "");
});
test("notes accept 2000 chars; approval is never accepted from the browser", () => {
  const c = content();
  assert.equal(commercialText("x".repeat(2000)).length, 2000);
  assert.throws(() => commercialText("x".repeat(2001)));
  c.commercial!.discountApproval = {
    percent: c.discountPercent,
    uid: "forged",
    at: "now",
  };
  assert.equal(parseInvoiceContent(c).commercial?.discountApproval, undefined);
});
test("commercial XML uses per-line VAT, agent and escaped notes; private artifact verifies", () => {
  const c = content(),
    s = snapshotFixture();
  s.generatorVersion = 3;
  s.content = c;
  s.lines = calculateXmlLines(c);
  s.totals = calculateInvoiceTotals(c);
  s.agent = {
    code: "0004",
    id: "a",
    name: "Alin",
    revision: 1,
    profileRevision: 1,
  };
  const a = invoiceXml(s, "NRGA F260001");
  assert.match(a.xml, /<ProcTVA>0<\/ProcTVA>/);
  assert.match(a.xml, /<FacturaAgent>0004<\/FacturaAgent>/);
  assert.match(a.xml, /Notă &amp; &lt;test&gt;/);
  assert.match(a.xml, /<InformatiiSuplimentare>Detaliu &amp; &lt;linie&gt;/);
  const sha = digest(a.xml);
  verifyInvoiceArtifact(
    {
      workId: s.workId,
      fiscalCode: s.fiscalCode,
      number: "NRGA F260001",
      snapshot: s,
      sha256: sha,
      filename: a.filename,
      state: "prepared_local",
      compatibility: "unverified",
      stock: "not_checked",
      operationId: "op",
      preparedAt: "now",
      preparedBy: "admin",
    },
    { xml: a.xml, sha256: sha },
    s.fiscalCode,
  );
});
test("old snapshots keep generator byte stability without new fiscal fields", () => {
  const s = snapshotFixture();
  const a = invoiceXml(s, "OLD0001");
  assert.ok(!a.xml.includes("FacturaAgent"));
  assert.ok(!a.xml.includes("<InformatiiSuplimentare>"));
  assert.deepEqual(invoiceXml(s, "OLD0001"), a);
});
test("8 decimal prices survive parsing; invalid controls still fail XML", () => {
  const c = content();
  assert.equal(parseInvoiceContent(c).lines[0].price, "10.12345678");
  c.extraInfo = "bad\u0001";
  const s = snapshotFixture();
  s.content = c;
  s.generatorVersion = 3;
  s.lines = calculateXmlLines(c);
  assert.throws(() => invoiceXml(s, "N1"));
});
