import {
  prepareInvoiceDraft,
  invoiceContent,
  calculateInvoiceTotals,
} from "./draft";
import { calculateXmlLines, type InvoiceXmlSnapshot } from "./xml";
export const issuerFixture = {
  name: "Emitent & Fii",
  cui: "RO123456",
  registration: "J00/1/2020",
  country: "RO",
  county: "IF",
  city: "Otopeni",
  address: "Strada test 1",
  phone: "",
  email: "",
  bank: "",
  iban: "",
  vatCashAccounting: false,
};
export function contentFixture() {
  const draft = prepareInvoiceDraft(
    "w",
    {
      clientId: "c",
      client: "Client",
      preluatDispecer: true,
      nrLucrare: "TEST",
      products: [
        { name: 'Piesă & <șurub> "A"', um: "buc", quantity: 1.25, price: 10 },
      ],
    },
    { id: "c", nume: "Client", cui: "RO123", adresa: "Adresă" },
    21,
    [],
    new Date("2026-11-07T12:00:00Z"),
  );
  const c = invoiceContent(draft);
  Object.assign(c.beneficiary, {
    country: "RO",
    county: "B",
    city: "București",
  });
  c.discountPercent = "10";
  c.lines[0].saga = {
    fiscalCode: "123456",
    productId: "p",
    revision: 1,
    warehouseId: "g",
    warehouseRevision: 1,
    snapshot: {
      code: "0001",
      name: "Piesă",
      unit: "buc",
      kind: "goods",
      warehouseCode: "01",
      warehouseName: "Depozit",
    },
  };
  return c;
}
export function snapshotFixture(): InvoiceXmlSnapshot {
  const content = contentFixture();
  return {
    schemaVersion: 1,
    generatorVersion: 1,
    fiscalCode: "123456",
    workId: "w",
    ticketNumber: "TEST",
    draftRevision: 1,
    issuer: {
      ...issuerFixture,
      revision: 1,
      updatedAt: "now",
      updatedBy: "admin",
    },
    content,
    clientId: "c",
    clientCode: "0002",
    clientRevision: 1,
    linkRevision: 1,
    lines: calculateXmlLines(content),
    totals: calculateInvoiceTotals(content),
  };
}
