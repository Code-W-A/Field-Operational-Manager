import {
  InvoiceDraftError,
  type InvoiceContent,
  type InvoiceTotals,
} from "./draft";
export type CommercialRules = {
  version: 2;
  policyRevision: number;
  dueMode: "auto" | "manual";
  termKey: string;
  termDays: number | null;
  discountApproval?: { percent: string; uid: string; at: string };
};
export type CommercialLineSource = {
  referenceId: string;
  referenceRevision: number;
  bindingRevision: number;
  checkedAt: string;
};
export type CommercialBinding = {
  id: string;
  kind: "articles" | "warehouses";
  targetId: string;
  referenceRevision: number;
  revision: number;
  updatedAt: string;
  updatedBy: string;
};
export type CommercialPolicy = {
  enabled: boolean;
  revision: number;
  updatedAt?: string;
  updatedBy?: string;
};
export const commercialError = (
  message: string,
  status = 400,
  code = "COMMERCIAL_INVALID",
) => new InvoiceDraftError(message, status, code);
export function commercialDecimal(v: unknown, max = 999999999, precision = 8) {
  if (v === undefined || v === null || v === "") return "";
  const s = String(v).trim().replace(",", ".");
  if (
    !new RegExp(`^\\d{1,9}(?:\\.\\d{1,${precision}})?$`).test(s) ||
    Number(s) > max
  )
    throw commercialError("Valoare numerică comercială invalidă.");
  return s.replace(/^0+(?=\d)/, "");
}
export function commercialText(v: unknown) {
  if (v === undefined) return "";
  if (typeof v !== "string" || v.length > 2000)
    throw commercialError(
      "Informațiile suplimentare acceptă maximum 2.000 de caractere.",
    );
  return v.trim();
}
export function parseCommercial(v: unknown): CommercialRules | undefined {
  if (v === undefined) return;
  const a = v as CommercialRules;
  if (
    !a ||
    a.version !== 2 ||
    !Number.isSafeInteger(a.policyRevision) ||
    a.policyRevision < 1 ||
    !["auto", "manual"].includes(a.dueMode) ||
    typeof a.termKey !== "string" ||
    a.termKey.length > 100 ||
    !(
      a.termDays === null ||
      (Number.isInteger(a.termDays) && a.termDays >= 0 && a.termDays <= 3650)
    )
  )
    throw commercialError("Proveniența regulilor comerciale este invalidă.");
  return {
    version: 2,
    policyRevision: a.policyRevision,
    dueMode: a.dueMode,
    termKey: a.termKey,
    termDays: a.termDays,
  };
}
export function parseCommercialSource(
  v: unknown,
): CommercialLineSource | undefined {
  if (v === undefined) return;
  const s = v as CommercialLineSource;
  if (
    !s ||
    typeof s.referenceId !== "string" ||
    !/^[a-f0-9]{64}$/.test(s.referenceId) ||
    !Number.isSafeInteger(s.referenceRevision) ||
    s.referenceRevision < 1 ||
    !Number.isSafeInteger(s.bindingRevision) ||
    s.bindingRevision < 1 ||
    typeof s.checkedAt !== "string" ||
    s.checkedAt.length > 50
  )
    throw commercialError("Referința comercială a liniei este invalidă.");
  return {
    referenceId: s.referenceId,
    referenceRevision: s.referenceRevision,
    bindingRevision: s.bindingRevision,
    checkedAt: s.checkedAt,
  };
}
export function dueFromTerm(date: string, days: number | null) {
  if (!date || days === null) return "";
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export const scaledCommercial = (s: string, digits = 8) => {
  const [a, b = ""] = (s || "0").split(".");
  return (
    BigInt(a) * BigInt("1" + "0".repeat(digits)) + BigInt(b.padEnd(digits, "0"))
  );
};
export const roundCommercial = (n: bigint, d: bigint) =>
  (n + d / BigInt(2)) / d;
export function allocateCommercial(total: bigint, weights: bigint[]) {
  const sum = weights.reduce((a, b) => a + b, BigInt(0));
  if (!sum) return weights.map(() => BigInt(0));
  const values = weights.map((w) => (total * w) / sum);
  let rest = total - values.reduce((a, b) => a + b, BigInt(0));
  const order = weights
    .map((w, i) => ({ i, r: (total * w) % sum }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (!rest) break;
    values[i]++;
    rest--;
  }
  return values;
}
export function commercialAmounts(
  content: Pick<InvoiceContent, "lines" | "discountPercent">,
) {
  const gross = content.lines.map((l) =>
      roundCommercial(
        scaledCommercial(commercialDecimal(l.quantity, 999999999, 4), 4) *
          scaledCommercial(commercialDecimal(l.price)),
        BigInt(10000000000),
      ),
    ),
    subtotal = gross.reduce((a, b) => a + b, BigInt(0));
  const discount = roundCommercial(
      subtotal *
        scaledCommercial(commercialDecimal(content.discountPercent, 100, 4), 4),
      BigInt(1000000),
    ),
    discounts = allocateCommercial(discount, gross),
    bases = gross.map((g, i) => g - discounts[i]),
    vats = gross.map(() => BigInt(0));
  const groups = new Map<string, number[]>();
  content.lines.forEach((l, i) => {
    const rate = commercialDecimal(l.vatPercent, 100, 4),
      key = String(scaledCommercial(rate, 4));
    groups.set(key, [...(groups.get(key) || []), i]);
  });
  const vatGroups = [...groups.entries()].map(([rate, indexes]) => {
    const base = indexes.reduce((sum, i) => sum + bases[i], BigInt(0)),
      vat = roundCommercial(base * BigInt(rate), BigInt(1000000)),
      allocated = allocateCommercial(
        vat,
        indexes.map((i) => bases[i]),
      );
    indexes.forEach((idx, i) => (vats[idx] = allocated[i]));
    return {
      rate: (Number(rate) / 10000).toString(),
      baseCents: Number(base),
      vatCents: Number(vat),
    };
  });
  const base = bases.reduce((a, b) => a + b, BigInt(0)),
    vat = vats.reduce((a, b) => a + b, BigInt(0));
  if (
    subtotal > BigInt(Number.MAX_SAFE_INTEGER) ||
    base + vat > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw commercialError("Totalul depășește limita acceptată.");
  const incomplete =
    !content.lines.length ||
    content.discountPercent === "" ||
    content.lines.some(
      (l) =>
        !l.name.trim() ||
        !l.um.trim() ||
        !l.quantity ||
        Number(l.quantity) <= 0 ||
        !l.price ||
        Number(l.price) <= 0 ||
        l.vatPercent === undefined ||
        l.vatPercent === "",
    );
  const totals: InvoiceTotals = {
    subtotalCents: Number(subtotal),
    discountCents: Number(discount),
    baseCents: Number(base),
    vatCents: Number(vat),
    totalCents: Number(base + vat),
    incomplete,
    vatGroups,
  };
  return { gross, bases, vats, totals };
}
