import { resolveTicketLiveDisplay } from "@/lib/work-documents/ticket-live-display";
import { getTicketEmitent } from "@/lib/utils/ticket-emitent";
import { resolveTicketLocation } from "@/firebase-functions/src/client-ticket-sync";
import { equipmentFor } from "@/packages/fom-domain";

type RecordData = Record<string, any>;
export type InvoiceLine = {
  id: string;
  name: string;
  um: string;
  quantity: string;
  price: string;
};
export type InvoiceBeneficiary = {
  name: string;
  cui: string;
  registration: string;
  address: string;
  bank: string;
  iban: string;
  phone: string;
  email: string;
};
export type InvoiceContent = {
  beneficiary: InvoiceBeneficiary;
  date: string;
  dueDate: string;
  currency: "RON";
  lines: InvoiceLine[];
  vatPercent: string;
  discountPercent: string;
};
export type InvoiceTotals = {
  subtotalCents: number;
  discountCents: number;
  baseCents: number;
  vatCents: number;
  totalCents: number;
  incomplete: boolean;
};
export type InvoiceDraft = InvoiceContent & {
  schemaVersion: 1;
  workId: string;
  revision: number;
  references: {
    ticketNumber: string;
    workType: string;
    author: string;
    contract: string;
    location: string;
    locationAddress: string;
    contact: string;
    phone: string;
    email: string;
    equipment: string[];
    description: string;
  };
  source: {
    kind: "deviz" | "report" | "ticket" | "empty";
    clientId: string | null;
    preparedAt: string;
    issues: string[];
  };
  totals: InvoiceTotals;
  createdAt: string | null;
  updatedAt: string | null;
  updatedBy: { uid: string; name: string } | null;
};
export type InvoiceDraftResponse = {
  draft: InvoiceDraft | null;
  saved: boolean;
  canEdit: boolean;
  reason: string;
};
export class InvoiceDraftError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "INVALID_DRAFT",
  ) {
    super(message);
  }
}
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const normalized = (v: unknown) =>
  text(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function invoiceEditReason(work: RecordData) {
  const status = normalized(work.statusLucrare);
  if (work.archived || work.archivedAt || status.startsWith("arhivat"))
    return "Tichetul este arhivat. Ciorna poate fi doar consultată.";
  if (
    work.anulat ||
    work.anulatAt ||
    text(work.motivAnulare) ||
    status.startsWith("anulat") ||
    work.installation?.closedReason === "cancelled"
  )
    return "Tichetul este anulat. Ciorna poate fi doar consultată.";
  if (
    text(work.numarFactura) ||
    work.facturaDocument ||
    normalized(work.statusFacturare) === "facturat"
  )
    return "Tichetul are deja o factură. Ciorna poate fi doar consultată.";
  if (
    normalized(work.statusFacturare) === "nu se factureaza" ||
    text(work.motivNefacturare)
  )
    return "Tichetul este marcat „Nu se facturează”.";
  if (work.preluatDispecer !== true)
    return "Preia tichetul înainte de pregătirea facturii.";
  return "";
}
export function bucharestDate(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => p.find((v) => v.type === name)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function decimal(value: unknown, label: string, maximum = 999999999): string {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number")
    throw new InvoiceDraftError(`${label}: valoare numerică invalidă.`);
  const s = String(value).trim().replace(",", ".");
  if (!/^\d{1,9}(?:\.\d{1,4})?$/.test(s) || Number(s) > maximum)
    throw new InvoiceDraftError(
      `${label}: folosește o valoare între 0 și ${maximum}, cu maximum 4 zecimale.`,
    );
  return s.replace(/^0+(?=\d)/, "");
}
const scaled = (s: string) => {
  const [whole, fraction = ""] = (s || "0").split(".");
  return BigInt(whole) * BigInt(10000) + BigInt(fraction.padEnd(4, "0"));
};
const round = (n: bigint, d: bigint) => (n + d / BigInt(2)) / d;
export function calculateInvoiceTotals(
  content: Pick<InvoiceContent, "lines" | "vatPercent" | "discountPercent">,
): InvoiceTotals {
  let subtotal = BigInt(0);
  let incomplete =
    !content.lines.length ||
    content.vatPercent === "" ||
    content.discountPercent === "";
  for (const line of content.lines) {
    const q = decimal(line.quantity, "Cantitate"),
      p = decimal(line.price, "Preț");
    if (
      !line.name.trim() ||
      !line.um.trim() ||
      !q ||
      Number(q) <= 0 ||
      p === ""
    )
      incomplete = true;
    subtotal += round(scaled(q) * scaled(p), BigInt(1000000));
  }
  const discount = round(
    subtotal * scaled(decimal(content.discountPercent, "Reducere", 100)),
    BigInt(1000000),
  );
  const base = subtotal - discount;
  const vat = round(
    base * scaled(decimal(content.vatPercent, "TVA", 100)),
    BigInt(1000000),
  );
  if (
    subtotal > BigInt(Number.MAX_SAFE_INTEGER) ||
    base + vat > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new InvoiceDraftError("Totalul depășește limita acceptată.");
  return {
    subtotalCents: Number(subtotal),
    discountCents: Number(discount),
    baseCents: Number(base),
    vatCents: Number(vat),
    totalCents: Number(base + vat),
    incomplete,
  };
}
const beneficiaryKeys = [
  "name",
  "cui",
  "registration",
  "address",
  "bank",
  "iban",
  "phone",
  "email",
] as const;
function bounded(v: unknown, label: string, max = 1000) {
  if (typeof v !== "string" || v.length > max)
    throw new InvoiceDraftError(`${label}: text invalid sau prea lung.`);
  return v.trim();
}
function calendarDate(v: unknown, optional = false) {
  if (optional && v === "") return "";
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw new InvoiceDraftError("Verifică datele documentului.");
  const date = new Date(v + "T12:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== v)
    throw new InvoiceDraftError("Verifică datele documentului.");
  return v;
}
export function parseInvoiceContent(input: unknown): InvoiceContent {
  const v = input as Partial<InvoiceContent> | null;
  if (
    !v ||
    !v.beneficiary ||
    typeof v.beneficiary !== "object" ||
    !Array.isArray(v.lines) ||
    v.lines.length > 100 ||
    v.currency !== "RON"
  )
    throw new InvoiceDraftError("Datele ciornei nu sunt valide.");
  const beneficiary = Object.fromEntries(
    beneficiaryKeys.map((key) => [
      key,
      bounded(v.beneficiary![key], "Beneficiar"),
    ]),
  ) as InvoiceBeneficiary;
  const ids = new Set<string>();
  const lines = v.lines.map((line, index) => {
    if (!line || typeof line !== "object")
      throw new InvoiceDraftError("Linie de factură invalidă.");
    const id = bounded(line.id, "Identificator linie", 100);
    if (!id || ids.has(id))
      throw new InvoiceDraftError("Identificator de linie lipsă sau duplicat.");
    ids.add(id);
    return {
      id,
      name: bounded(line.name, "Denumire"),
      um: bounded(line.um, "UM", 40),
      quantity: decimal(line.quantity, `Cantitate ${index + 1}`),
      price: decimal(line.price, `Preț ${index + 1}`),
    };
  });
  const date = calendarDate(v.date, true),
    dueDate = calendarDate(v.dueDate, true);
  if (date && dueDate && dueDate < date)
    throw new InvoiceDraftError(
      "Scadența nu poate fi anterioară datei documentului.",
    );
  const content: InvoiceContent = {
    beneficiary,
    date,
    dueDate,
    currency: "RON",
    lines,
    vatPercent: decimal(v.vatPercent, "TVA", 100),
    discountPercent: decimal(v.discountPercent, "Reducere", 100),
  };
  calculateInvoiceTotals(content);
  return content;
}
export function invoiceContent(draft: InvoiceDraft): InvoiceContent {
  const {
    beneficiary,
    date,
    dueDate,
    currency,
    lines,
    vatPercent,
    discountPercent,
  } = draft;
  return {
    beneficiary,
    date,
    dueDate,
    currency,
    lines,
    vatPercent,
    discountPercent,
  };
}
export const invoiceSourceLabel = (kind: InvoiceDraft["source"]["kind"]) =>
  ({
    deviz: "Deviz salvat",
    report: "Raport tehnic",
    ticket: "Produse din tichet",
    empty: "Fără produse precompletate",
  })[kind];
export function prepareInvoiceDraft(
  workId: string,
  work: RecordData,
  client: RecordData | null,
  defaultVat: unknown,
  issues: string[],
  now = new Date(),
): InvoiceDraft {
  const display = resolveTicketLiveDisplay(work, client);
  const hasDeviz =
    Array.isArray(work.devizProducts) &&
    (work.devizProducts.length > 0 ||
      (Array.isArray(work.devizVersions) && work.devizVersions.length > 0) ||
      work.devizPreparedAt != null ||
      work.devizTotal != null);
  const hasReport =
    work.raportSnapshot && typeof work.raportSnapshot === "object";
  const kind: InvoiceDraft["source"]["kind"] = hasDeviz
    ? "deviz"
    : hasReport
      ? "report"
      : Array.isArray(work.products) && work.products.length
        ? "ticket"
        : "empty";
  const products =
    kind === "deviz"
      ? work.devizProducts
      : kind === "report"
        ? Array.isArray(work.raportSnapshot.products)
          ? work.raportSnapshot.products
          : []
        : kind === "ticket"
          ? work.products
          : [];
  // Invalid historic numbers stay visible for correction; never invent a price.
  const sourceNumber = (v: unknown) =>
    v == null ? "" : String(v).replace(",", ".");
  const content: InvoiceContent = {
    beneficiary: {
      name: display.identity.name,
      cui: display.identity.cui,
      registration: display.identity.reg,
      address: display.identity.address,
      phone: display.identity.phone,
      email: display.identity.email,
      bank: text(client?.banca ?? work.clientInfo?.banca),
      iban: text(client?.contBancar ?? work.clientInfo?.contBancar),
    },
    date: bucharestDate(now),
    dueDate: "",
    currency: "RON",
    lines: products.slice(0, 100).map((p: RecordData, i: number) => ({
      id: `source-${i}`,
      name: text(p.name ?? p.denumire ?? p.title),
      um: text(p.um),
      quantity: sourceNumber(p.quantity ?? p.cantitate),
      price: sourceNumber(p.price ?? p.pretUnitar),
    })),
    vatPercent: sourceNumber(
      hasDeviz && work.devizVAT != null ? work.devizVAT : defaultVat,
    ),
    discountPercent: sourceNumber(
      hasDeviz && work.devizAdjustmentPercent != null
        ? work.devizAdjustmentPercent
        : 0,
    ),
  };
  let totals: InvoiceTotals;
  try {
    totals = calculateInvoiceTotals(content);
  } catch {
    totals = {
      subtotalCents: 0,
      discountCents: 0,
      baseCents: 0,
      vatCents: 0,
      totalCents: 0,
      incomplete: true,
    };
    issues = [
      ...issues,
      "Unele valori preluate necesită corectare înainte de salvare.",
    ];
  }
  if (products.length > 100)
    issues = [
      ...issues,
      "Sursa are peste 100 de linii. Au fost preluate doar primele 100; celelalte poziții necesită verificare separată.",
    ];
  let location: RecordData | null = null;
  if (client) {
    try {
      location = resolveTicketLocation(client, work);
    } catch {
      /* Ambiguous locations never supply equipment. */
    }
  }
  const eq =
    Array.isArray(work.mobileEquipment) && work.mobileEquipment.length
      ? work.mobileEquipment.map((e: RecordData) =>
          text(e.denumire || e.nume || e.name),
        )
      : equipmentFor(work, location).map((e) =>
          e.id === "main" && e.name === "main" ? "" : text(e.name),
        );
  return {
    ...content,
    schemaVersion: 1,
    workId,
    revision: 0,
    references: {
      ticketNumber: text(work.nrLucrare || work.numarRaport) || workId,
      workType: text(work.tipLucrare),
      author: getTicketEmitent(work),
      contract: text(work.contractNumber || work.contract),
      location: display.contact.location,
      locationAddress: display.contact.address,
      contact: display.contact.name,
      phone: display.contact.phone,
      email: display.contact.email,
      equipment: eq.filter(Boolean),
      description: text(work.descriereInterventie || work.descriere),
    },
    source: {
      kind,
      clientId: client?.id || null,
      preparedAt: now.toISOString(),
      issues: [...issues, ...display.issues],
    },
    totals,
    createdAt: null,
    updatedAt: null,
    updatedBy: null,
  };
}
