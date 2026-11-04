import test from "node:test";
import assert from "node:assert/strict";
import {
  bucharestDate,
  calculateInvoiceTotals,
  invoiceContent,
  invoiceEditReason,
  parseInvoiceContent,
  prepareInvoiceDraft,
} from "./draft";

const work = {
  clientId: "client",
  client: "Client",
  clientInfo: {},
  preluatDispecer: true,
  nrLucrare: "#001",
  createdByName: "Dispecer",
  tipLucrare: "Intervenție",
  locatie: "Locație",
  products: [{ name: "Produs tichet", um: "buc", quantity: 1, price: 100 }],
};
const client = {
  id: "client",
  nume: "Client",
  cui: "RO123",
  regCom: "J123",
  adresa: "Adresă fiscală",
  banca: "Bancă",
  contBancar: "RO-test",
};
const seed = (patch = {}, c: any = client) =>
  prepareInvoiceDraft(
    "work",
    { ...work, ...patch },
    c,
    21,
    [],
    new Date("2026-11-04T08:00:00Z"),
  );

test("prepopulation includes verified fiscal identity, references and ticket source", () => {
  const draft = seed();
  assert.equal(draft.beneficiary.cui, "RO123");
  assert.equal(draft.beneficiary.iban, "RO-test");
  assert.equal(draft.beneficiary.address, "Adresă fiscală");
  assert.equal(draft.references.location, "Locație");
  assert.equal(draft.references.author, "Dispecer");
  assert.equal(draft.source.kind, "ticket");
  assert.equal(draft.date, "2026-11-04");
  assert.equal(draft.dueDate, "");
});
test("saved deviz takes priority and preserves explicit zero VAT and its discount", () => {
  const draft = seed({
    devizProducts: [{ name: "Deviz", um: "buc", quantity: 2, price: 10 }],
    devizVAT: 0,
    devizAdjustmentPercent: 10,
    raportSnapshot: { products: [{ name: "Raport" }] },
  });
  assert.equal(draft.lines[0].name, "Deviz");
  assert.equal(draft.vatPercent, "0");
  assert.equal(draft.discountPercent, "10");
  assert.equal(draft.totals.totalCents, 1800);
});
test("multiple equipment references use linked location names and installation snapshots", () => {
  const linked = {
    ...client,
    locatii: [
      {
        id: "l",
        nume: "Locație",
        echipamente: [
          { id: "a", denumire: "Echipament A" },
          { id: "b", nume: "Echipament B" },
        ],
      },
    ],
  };
  assert.deepEqual(
    seed(
      { locationId: "l", tipLucrare: "Revizie", equipmentIds: ["a", "b"] },
      linked,
    ).references.equipment,
    ["Echipament A", "Echipament B"],
  );
  assert.deepEqual(
    seed({
      installation: { equipment: [{ id: "i", name: "Echipament instalat" }] },
    }).references.equipment,
    ["Echipament instalat"],
  );
  assert.deepEqual(seed().references.equipment, []);
});
test("empty saved report and empty saved deviz do not fall through to offer/ticket products", () => {
  assert.deepEqual(seed({ raportSnapshot: { products: [] } }).lines, []);
  const draft = seed({
    devizProducts: [],
    devizVersions: [{}],
    raportSnapshot: { products: [{ name: "Raport" }] },
  });
  assert.deepEqual(draft.lines, []);
  assert.equal(draft.source.kind, "deviz");
});
test("report wins over ticket products; missing numbers stay blank and no labor is invented", () => {
  const draft = seed({
    raportSnapshot: { products: [{ name: "Piesă", um: "buc" }] },
  });
  assert.equal(draft.source.kind, "report");
  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0].price, "");
  assert.equal(draft.totals.incomplete, true);
  assert.equal(seed({ products: [] }).lines.length, 0);
});
test("decimal arithmetic, half-up cents, zero price and discount use shared totals", () => {
  const draft = seed();
  draft.lines = [
    { id: "a", name: "Piesă", um: "buc", quantity: "0,3", price: "0.1" },
  ];
  draft.discountPercent = "0";
  assert.equal(calculateInvoiceTotals(draft).subtotalCents, 3);
  draft.lines[0].quantity = "2.5";
  draft.lines[0].price = "10.01";
  draft.discountPercent = "10";
  const totals = calculateInvoiceTotals(draft);
  assert.deepEqual(
    [
      totals.subtotalCents,
      totals.discountCents,
      totals.baseCents,
      totals.vatCents,
      totals.totalCents,
    ],
    [2503, 250, 2253, 473, 2726],
  );
  draft.lines[0].price = "0";
  assert.equal(calculateInvoiceTotals(draft).incomplete, false);
});
test("invalid numeric values are rejected while incomplete ciorna is accepted", () => {
  for (const price of ["NaN", "Infinity", "-1", "1.00001", "1e2", "1.2.3"]) {
    const content = invoiceContent(seed());
    content.lines[0].price = price;
    assert.throws(() => parseInvoiceContent(content));
  }
  const d = invoiceContent(seed());
  d.lines[0].price = "";
  d.beneficiary.cui = "";
  d.date = "";
  assert.equal(calculateInvoiceTotals(parseInvoiceContent(d)).incomplete, true);
  d.discountPercent = "101";
  assert.throws(() => parseInvoiceContent(d));
});
test("invalid dates, duplicate IDs and unsafe monetary totals are rejected", () => {
  const d = invoiceContent(seed());
  d.date = "2026-99-01";
  assert.throws(() => parseInvoiceContent(d), /datele/);
  d.date = "2026-11-04";
  d.dueDate = "2026-11-03";
  assert.throws(() => parseInvoiceContent(d), /Scadența/);
  d.dueDate = "";
  d.lines.push({ ...d.lines[0] });
  assert.throws(() => parseInvoiceContent(d), /duplicat/);
  d.lines = [
    {
      id: "huge",
      name: "x",
      um: "buc",
      quantity: "999999999",
      price: "999999999",
    },
  ];
  d.discountPercent = "100";
  assert.throws(() => calculateInvoiceTotals(d), /limita/);
});
test("eligibility allows drafts before final report and blocks accounting/terminal states", () => {
  assert.equal(invoiceEditReason(work), "");
  for (const patch of [
    { preluatDispecer: false },
    { anulat: true },
    { archivedAt: "today" },
    { statusLucrare: "Arhivată" },
    { numarFactura: "F1" },
    { facturaDocument: { url: "pdf" } },
    { statusFacturare: "Facturat" },
    { statusFacturare: "Nu se facturează" },
  ])
    assert.ok(invoiceEditReason({ ...work, ...patch }));
});
test("Bucharest calendar date respects midnight and content cannot smuggle metadata", () => {
  assert.equal(bucharestDate(new Date("2026-11-03T22:30:00Z")), "2026-11-04");
  const input = {
    ...invoiceContent(seed()),
    numarFactura: "F1",
    source: { clientId: "other" },
    totals: { totalCents: 1 },
  };
  const parsed = parseInvoiceContent(input);
  assert.equal("numarFactura" in parsed, false);
  assert.equal("source" in parsed, false);
  assert.equal("totals" in parsed, false);
});
