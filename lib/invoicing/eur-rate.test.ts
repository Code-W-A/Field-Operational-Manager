import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseBnrXml,
  selectBnrRate,
  parseEurReference,
  eurReferenceText,
} from "./eur-rate";
import { bnrXmlFixture } from "./eur-rate.fixtures";
import { contentFixture, snapshotFixture } from "./xml.fixtures";
import { calculateInvoiceTotals, parseInvoiceContent } from "./draft";
import { invoiceXml, invoiceSupplementaryText } from "./xml";
import { verifyInvoiceArtifact, digest } from "./saga-artifact.server";
test("BNR XML preserves decimal precision and supports default/prefixed namespaces", () => {
  for (const prefix of ["", "bnr"])
    assert.deepEqual(
      parseBnrXml(
        bnrXmlFixture([{ date: "2026-11-06", value: "5.3408" }], prefix),
      ),
      [{ date: "2026-11-06", value: "5.3408" }],
    );
});
test("weekend, ascending/descending feeds and year boundary choose the last eligible publication", () => {
  const rows = [
    { date: "2026-11-06", value: "5.1" },
    { date: "2026-11-05", value: "5.2" },
  ];
  assert.equal(selectBnrRate(rows, "2026-11-08")?.date, "2026-11-06");
  assert.equal(selectBnrRate(rows.reverse(), "2026-11-05")?.value, "5.2");
  assert.equal(selectBnrRate(rows, "2026-11-01"), null);
  assert.equal(
    selectBnrRate([{ date: "2025-12-31", value: "5.1" }], "2026-01-01")?.date,
    "2025-12-31",
  );
});
test("zero/negative/comma/exponent rates and non-unit EUR multiplier reject", () => {
  for (const value of ["0", "-1", "5,1", "5e1", "NaN"])
    assert.throws(() =>
      parseBnrXml(bnrXmlFixture([{ date: "2026-11-06", value }])),
    );
  assert.throws(() =>
    parseBnrXml(
      bnrXmlFixture([{ date: "2026-11-06", value: "5.1" }]).replace(
        'currency="EUR"',
        'currency="EUR" multiplier="100"',
      ),
    ),
  );
});
test("missing EUR, wrong base, malformed dates, duplicate and hostile XML reject", () => {
  const xml = bnrXmlFixture([{ date: "2026-11-06", value: "5.1" }]);
  for (const text of [
    xml.replace("EUR", "USD"),
    xml.replace("RON", "USD"),
    xml.replace("2026-11-06", "2026-02-30"),
    xml.replace("</DataSet>", ""),
    '<!DOCTYPE DataSet [<!ENTITY x SYSTEM "https://example.com/">]>' + xml,
  ])
    assert.throws(() => parseBnrXml(text));
  assert.throws(() =>
    parseBnrXml(
      bnrXmlFixture([
        { date: "2026-11-06", value: "5.1" },
        { date: "2026-11-06", value: "5.2" },
      ]),
    ),
  );
});
test("reference parsing rejects malformed ids, dates and states", () => {
  assert.equal(parseEurReference(undefined), undefined);
  for (const data of [
    { status: "available", requestedDate: "2026-11-08", quoteId: "fake" },
    { status: "omitted", requestedDate: "2026-02-30" },
    { status: "other", requestedDate: "2026-11-08" },
  ])
    assert.throws(() => parseEurReference(data));
});
test("informative reference and omission never change RON totals", () => {
  const c = contentFixture(),
    totals = calculateInvoiceTotals(c);
  c.eurReference = { status: "omitted", requestedDate: c.date };
  assert.deepEqual(calculateInvoiceTotals(c), totals);
  c.eurReference = {
    status: "available",
    quoteId: "a".repeat(64),
    requestedDate: c.date,
    value: "5.3408",
    rateDate: "2026-11-06",
    source: "BNR",
    sourceUrl: "https://curs.bnr.ro/nbrfxrates10days.xml",
    fetchedAt: "now",
  };
  assert.deepEqual(calculateInvoiceTotals(parseInvoiceContent(c)), totals);
});
test("v4 freezes EUR in supplementary XML and artifact verification; v1-v3 bytes stay intact", () => {
  const s = snapshotFixture(),
    historical = invoiceXml(s, "OLD0001");
  s.generatorVersion = 4;
  const ref = {
    status: "available" as const,
    quoteId: "a".repeat(64),
    requestedDate: s.content.date,
    value: "5.3408",
    rateDate: "2026-11-06",
    source: "BNR" as const,
    sourceUrl: "https://curs.bnr.ro/nbrfxrates10days.xml",
    fetchedAt: "now",
  };
  s.eurReference = ref;
  s.content.eurReference = ref;
  const artifact = invoiceXml(s, "NEW0001");
  assert.match(artifact.xml, /Curs EUR informativ BNR: 1 EUR = 5.3408 RON/);
  assert.ok(!artifact.xml.includes("FacturaCurs"));
  const sha = digest(artifact.xml),
    doc = {
      workId: s.workId,
      fiscalCode: s.fiscalCode,
      number: "NEW0001",
      state: "prepared_local" as const,
      compatibility: "unverified" as const,
      stock: "not_checked" as const,
      snapshot: s,
      sha256: sha,
      filename: artifact.filename,
      operationId: "op",
      preparedAt: "now",
      preparedBy: "admin",
    };
  verifyInvoiceArtifact(doc, { xml: artifact.xml, sha256: sha }, s.fiscalCode);
  assert.throws(() =>
    verifyInvoiceArtifact(
      { ...doc, snapshot: { ...s, eurReference: { ...ref, value: "99" } } },
      { xml: artifact.xml, sha256: sha },
      s.fiscalCode,
    ),
  );
  assert.deepEqual(invoiceXml(snapshotFixture(), "OLD0001"), historical);
});
test("omitted document text is explicit and preserves ticket/commercial notes", () => {
  const s = snapshotFixture();
  s.generatorVersion = 4;
  s.eurReference = {
    status: "omitted",
    requestedDate: s.content.date,
    confirmedBy: "admin",
    confirmedAt: "now",
  };
  assert.match(invoiceSupplementaryText(s), /omitere confirmată/);
  assert.match(eurReferenceText(s.eurReference), /neînregistrat/);
});
