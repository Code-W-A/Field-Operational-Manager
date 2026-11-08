import { eurReferenceText, type EurReference } from "./eur-rate";
import {
  commercialAmounts,
  scaledCommercial,
  roundCommercial,
} from "./commercial";
import { XMLBuilder, XMLValidator } from "fast-xml-parser";
import { normalizeTaxId } from "@/lib/saga/clients";
import { calculateInvoiceTotals, type InvoiceContent } from "./draft";
export class InvoiceXmlError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type InvoiceIssuer = {
  name: string;
  cui: string;
  registration: string;
  country: string;
  county: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  bank: string;
  iban: string;
  vatCashAccounting: boolean;
};
export type IssuerProfile = InvoiceIssuer & {
  revision: number;
  updatedAt: string;
  updatedBy: string;
};
export const issuerLabels = {
  name: "Denumire firmă emitentă",
  cui: "CIF firmă emitentă",
  registration: "Registrul comerțului emitent",
  country: "Țara emitentului",
  county: "Județ emitent (cod, ex. IF)",
  city: "Localitate emitent",
  address: "Adresă fiscală emitent",
  phone: "Telefon emitent",
  email: "Email emitent",
  bank: "Banca emitentului",
  iban: "IBAN emitent",
} as const;
export const validCounty = (country: string, county: string) =>
  country !== "RO" ||
  new Set(
    "AB AR AG BC BH BN BT BV BR B BZ CS CL CJ CT CV DB DJ GL GR GJ HR HD IL IS IF MM MH MS NT OT PH SM SJ SB SV TR TM TL VS VL VN".split(
      " ",
    ),
  ).has(county);
export function parseIssuer(input: unknown, fiscalCode: string): InvoiceIssuer {
  const v = input as InvoiceIssuer;
  if (!v || typeof v.vatCashAccounting !== "boolean")
    throw new InvoiceXmlError(
      "INVALID_ISSUER",
      "Completează profilul fiscal și opțiunea TVA la încasare.",
    );
  const result = Object.fromEntries(
    Object.keys(issuerLabels).map((key) => {
      const value = v[key as keyof typeof issuerLabels];
      if (
        typeof value !== "string" ||
        value.length > 1000 ||
        /[\x00-\x1f\x7f]/.test(value)
      )
        throw new InvoiceXmlError(
          "INVALID_ISSUER",
          "Datele emitentului nu sunt valide.",
        );
      return [key, value.trim()];
    }),
  ) as Omit<InvoiceIssuer, "vatCashAccounting">;
  if (normalizeTaxId(result.cui, "RO") !== fiscalCode)
    throw new InvoiceXmlError(
      "INVALID_ISSUER",
      "CIF-ul emitentului trebuie să corespundă firmei SAGA conectate.",
    );
  if (
    !result.name ||
    !result.registration ||
    !result.address ||
    !result.city ||
    !result.country ||
    !/^[A-Z]{2}$/.test(result.country) ||
    !validCounty(result.country, result.county)
  )
    throw new InvoiceXmlError(
      "INVALID_ISSUER",
      "Completează denumirea, registrul comerțului și adresa fiscală structurată a emitentului (județul prin cod, ex. IF).",
    );
  return {
    ...result,
    cui: /^RO/i.test(result.cui) ? `RO${fiscalCode}` : fiscalCode,
    vatCashAccounting: v.vatCashAccounting,
  };
}
export type XmlLine = {
  vatPercent?: string;
  extraInfo?: string;
  id: string;
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  baseCents: number;
  vatCents: number;
  code: string;
  productId: string;
  warehouseCode: string;
  kind: "goods" | "service";
};
export type InvoiceXmlSnapshot = {
  agent?: {
    code: string;
    name: string;
    id: string;
    revision: number;
    profileRevision: number;
  };
  numbering?: import("./numbering").UserNumberingIdentity;
  schemaVersion: 1;
  generatorVersion: 1 | 2 | 3 | 4;
  eurReference?: EurReference;
  fiscalCode: string;
  workId: string;
  ticketNumber: string;
  draftRevision: number;
  issuer: IssuerProfile;
  content: InvoiceContent;
  clientId: string;
  clientCode: string;
  clientRevision: number;
  linkRevision: number;
  lines: XmlLine[];
  totals: ReturnType<typeof calculateInvoiceTotals>;
};
export type PreparedInvoice = {
  workId: string;
  fiscalCode: string;
  number: string;
  state: "prepared_local";
  compatibility: "unverified";
  stock: "not_checked";
  snapshot: InvoiceXmlSnapshot;
  sha256: string;
  filename: string;
  operationId: string;
  preparedAt: string;
  preparedBy: string;
};
export type XmlPreview = {
  snapshot: InvoiceXmlSnapshot;
  previewHash: string;
  estimatedNumber: string;
};
const scaled = (value: string) => {
  const [a, b = ""] = value.split(".");
  return BigInt(a || "0") * BigInt(10000) + BigInt(b.padEnd(4, "0"));
};
const rounded = (n: bigint, d: bigint) => (n + d / BigInt(2)) / d;
function distribute(total: bigint, weights: bigint[]): bigint[] {
  const sum = weights.reduce((a, b) => a + b, BigInt(0));
  if (!sum) return weights.map(() => BigInt(0));
  const result = weights.map((w) => (total * w) / sum);
  let rest = total - result.reduce((a, b) => a + b, BigInt(0));
  const order = weights
    .map((w, i) => ({ i, remainder: (total * w) % sum }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.i - b.i
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const item of order) {
    if (rest === BigInt(0)) break;
    result[item.i]++;
    rest--;
  }
  return result;
}
export function calculateXmlLines(content: InvoiceContent): XmlLine[] {
  if (content.commercial) {
    const { bases, vats, totals } = commercialAmounts(content);
    if (totals.incomplete)
      throw new InvoiceXmlError(
        "INCOMPLETE_INVOICE",
        "Completează liniile comerciale.",
      );
    return content.lines.map((line, i) => {
      const link = line.saga?.snapshot;
      if (!link)
        throw new InvoiceXmlError(
          "UNMAPPED_PRODUCT",
          "Asociază articolul SAGA.",
        );
      const q = scaledCommercial(line.quantity, 4),
        price = roundCommercial(bases[i] * BigInt(10000000000), q);
      if (roundCommercial(q * price, BigInt(10000000000)) !== bases[i])
        throw new InvoiceXmlError(
          "PRICE_PRECISION",
          "Prețul net nu reproduce valoarea liniei cu maximum 8 zecimale.",
        );
      const fraction = (price % BigInt(100000000))
        .toString()
        .padStart(8, "0")
        .replace(/0+$/, "");
      return {
        id: line.id,
        name: line.name,
        unit: line.um,
        quantity: line.quantity,
        unitPrice:
          String(price / BigInt(100000000)) + (fraction ? "." + fraction : ""),
        baseCents: Number(bases[i]),
        vatCents: Number(vats[i]),
        code: link.code,
        productId: line.saga!.productId,
        warehouseCode: link.warehouseCode,
        kind: link.kind,
        vatPercent: line.vatPercent!,
        extraInfo: line.extraInfo || "",
      };
    });
  }
  const totals = calculateInvoiceTotals(content);
  if (totals.incomplete)
    throw new InvoiceXmlError(
      "INCOMPLETE_INVOICE",
      "Completează toate liniile, cantitățile, TVA-ul și discountul.",
    );
  const gross = content.lines.map((l) =>
    rounded(scaled(l.quantity) * scaled(l.price), BigInt(1000000)),
  );
  const discounts = distribute(BigInt(totals.discountCents), gross),
    bases = gross.map((v, i) => v - discounts[i]);
  const vats = distribute(BigInt(totals.vatCents), bases);
  return content.lines.map((line, i) => {
    const link = line.saga?.snapshot;
    if (!link)
      throw new InvoiceXmlError(
        "UNMAPPED_PRODUCT",
        "Asociază toate pozițiile cu articolele SAGA.",
      );
    const q = scaled(line.quantity);
    if (q <= BigInt(0))
      throw new InvoiceXmlError(
        "INVALID_QUANTITY",
        "Cantitățile trebuie să fie pozitive.",
      );
    const price = rounded(bases[i] * BigInt(10000000000), q);
    if (rounded(q * price, BigInt(10000000000)) !== bases[i])
      throw new InvoiceXmlError(
        "PRICE_PRECISION",
        "Prețul net cu maximum 8 zecimale nu reproduce valoarea liniei. Corectează cantitatea sau prețul înainte de pregătire.",
      );
    const whole = price / BigInt(100000000),
      fraction = (price % BigInt(100000000))
        .toString()
        .padStart(8, "0")
        .replace(/0+$/, "");
    return {
      id: line.id,
      name: line.name,
      unit: line.um,
      quantity: line.quantity,
      unitPrice: `${whole}${fraction ? `.${fraction}` : ""}`,
      baseCents: Number(bases[i]),
      vatCents: Number(vats[i]),
      code: link.code,
      productId: line.saga!.productId,
      warehouseCode: link.warehouseCode,
      kind: link.kind,
    };
  });
}
export function invoiceSupplementaryText(snapshot: InvoiceXmlSnapshot) {
  const c = snapshot.content;
  const base = `Tichet ${snapshot.ticketNumber}; referință FOM ${snapshot.workId}${c.commercial && c.extraInfo ? "; " + c.extraInfo : ""}`;
  return snapshot.generatorVersion === 4 && snapshot.eurReference
    ? `${base}; ${eurReferenceText(snapshot.eurReference)}`
    : base;
}
export function invoiceXml(
  snapshot: InvoiceXmlSnapshot,
  number: string,
): { xml: string; filename: string } {
  const escape = (value: string) => {
    if (
      /[\x00-\x08\x0b\x0c\x0e-\x1f\ufffe\uffff]/.test(value) ||
      Array.from(value).some((c) => {
        const n = c.codePointAt(0)!;
        return n >= 0xd800 && n <= 0xdfff;
      })
    )
      throw new InvoiceXmlError(
        "INVALID_XML_TEXT",
        "Textul conține caractere nepermise în XML.",
      );
    return value;
  };
  const tag = (key: string, value: string) => ({ [key]: escape(value) });
  const money = (value: number) =>
    `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
  const date = (s: string) => (s ? s.split("-").reverse().join(".") : "");
  const p = snapshot.issuer,
    c = snapshot.content,
    b = c.beneficiary;
  const header = Object.assign(
    {},
    ...[
      tag("FurnizorNume", p.name),
      tag("FurnizorCIF", p.cui),
      tag("FurnizorNrRegCom", p.registration),
      tag("FurnizorTara", p.country),
      tag("FurnizorLocalitate", p.city),
      tag("FurnizorJudet", p.county),
      tag("FurnizorAdresa", p.address),
      tag("FurnizorTelefon", p.phone),
      tag("FurnizorMail", p.email),
      tag("FurnizorBanca", p.bank),
      tag("FurnizorIBAN", p.iban),
      tag("GUID_cod_client", snapshot.clientId),
      tag("ClientNume", b.name),
      tag("ClientCIF", b.cui),
      tag("ClientNrRegCom", b.registration),
      tag("ClientJudet", b.country === "RO" ? b.county || "" : ""),
      tag("ClientTara", b.country || ""),
      tag("ClientLocalitate", b.city || ""),
      tag("ClientAdresa", b.address),
      tag("ClientBanca", b.bank),
      tag("ClientIBAN", b.iban),
      tag("ClientTelefon", b.phone),
      tag("ClientMail", b.email),
      tag("FacturaNumar", number),
      tag("FacturaData", date(c.date)),
      ...(c.dueDate ? [tag("FacturaScadenta", date(c.dueDate))] : []),
      tag("FacturaTaxareInversa", "Nu"),
      tag("FacturaTVAIncasare", p.vatCashAccounting ? "Da" : "Nu"),
      tag("FacturaMoneda", "RON"),
      tag("FacturaInformatiiSuplimentare", invoiceSupplementaryText(snapshot)),
      ...(snapshot.agent ? [tag("FacturaAgent", snapshot.agent.code)] : []),
      tag("Cod", snapshot.clientCode),
    ],
  );
  const lines = snapshot.lines.map((l, i) => ({
    LinieNrCrt: String(i + 1),
    ...(l.kind === "goods" ? tag("Gestiune", l.warehouseCode) : {}),
    ...tag("Descriere", l.name),
    ...tag("CodArticolClient", l.code),
    ...tag("GUID_cod_articol", l.productId),
    ...tag("UM", l.unit),
    ...tag("Cantitate", l.quantity),
    ...tag("Pret", l.unitPrice),
    ...tag("Valoare", money(l.baseCents)),
    ...tag("ProcTVA", c.commercial ? l.vatPercent! : c.vatPercent),
    ...(c.commercial ? tag("InformatiiSuplimentare", l.extraInfo || "") : {}),
    ...tag("TVA", money(l.vatCents)),
  }));
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    new XMLBuilder({
      format: false,
      suppressEmptyNode: false,
      processEntities: true,
    }).build({
      Facturi: {
        Factura: {
          Antet: header,
          Detalii: { Continut: { Linie: lines } },
          ...tag("GUID_factura", snapshot.workId),
        },
      },
    });
  if (XMLValidator.validate(xml) !== true)
    throw new InvoiceXmlError(
      "INVALID_XML",
      "Documentul XML generat nu este valid.",
    );
  const safe = (s: string) => s.replace(/[^\p{L}\p{N}._-]/gu, "_");
  return {
    xml,
    filename: `F_${snapshot.fiscalCode}_${safe(number)}_${c.date.split("-").reverse().join("_")}.xml`,
  };
}
