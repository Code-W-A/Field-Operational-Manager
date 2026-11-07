import { SagaError } from "./contracts";
export type SagaWarehouse = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  revision: number;
  updatedAt: string;
  updatedBy: string;
};
export type SagaProduct = {
  id: string;
  name: string;
  code: string;
  unit: string;
  articleName: string;
  kind: "goods" | "service";
  warehouseIds: string[];
  active: boolean;
  revision: number;
  verifiedAt: string;
  updatedAt: string;
  updatedBy: string;
};
export type SagaCatalog = {
  fiscalCode: string;
  products: SagaProduct[];
  warehouses: SagaWarehouse[];
};
export type InvoiceSagaLink = {
  fiscalCode: string;
  productId: string;
  revision: number;
  warehouseId: string;
  warehouseRevision?: number;
  // The server resolves these fields; browser snapshots are never authoritative.
  snapshot?: {
    code: string;
    name: string;
    unit: string;
    kind: "goods" | "service";
    warehouseCode: string;
    warehouseName: string;
  };
};
export function stockKey(link?: InvoiceSagaLink) {
  return link
    ? JSON.stringify([
        link.fiscalCode,
        link.productId,
        link.revision,
        link.warehouseId,
        link.warehouseRevision,
      ])
    : "";
}
export function unitsMatch(a: string, b: string) {
  return a.trim().toLocaleLowerCase("ro") === b.trim().toLocaleLowerCase("ro");
}
// Quantities are decimal strings. Avoid binary floating point at the stock boundary.
export function stockInsufficient(available: string, quantities: string[]) {
  const values = [available, ...quantities.map((q) => q.replace(",", "."))];
  if (values.some((v) => !/^-?\d+(?:\.\d+)?$/.test(v))) return null;
  const precision = Math.max(
    ...values.map((v) => v.split(".")[1]?.length || 0),
  );
  const scale = (v: string) => {
    const negative = v.startsWith("-");
    const [whole, fraction = ""] = v.replace(/^-/, "").split(".");
    const n = BigInt(whole + fraction.padEnd(precision, "0"));
    return negative ? -n : n;
  };
  return (
    values.slice(1).reduce((sum, v) => sum + scale(v), BigInt(0)) >
    scale(available)
  );
}

export function parseInvoiceSagaLink(
  value: unknown,
): InvoiceSagaLink | undefined {
  if (value === undefined || value === null) return undefined;
  const v = value as InvoiceSagaLink;
  const code = (s: unknown, empty = false) =>
    typeof s === "string" &&
    s.length <= 100 &&
    (empty || !!s.trim()) &&
    !/[\/\x00-\x1f\x7f]/.test(s);
  if (
    !v ||
    !code(v.fiscalCode) ||
    !code(v.productId) ||
    !code(v.warehouseId, true) ||
    !Number.isSafeInteger(v.revision) ||
    v.revision < 1 ||
    (v.warehouseRevision !== undefined &&
      (!Number.isSafeInteger(v.warehouseRevision) || v.warehouseRevision < 1))
  )
    throw new SagaError("INVALID_CATALOG", "Asociere de produs invalidă.");
  return {
    fiscalCode: v.fiscalCode,
    productId: v.productId,
    revision: v.revision,
    warehouseId: v.warehouseId,
    ...(v.warehouseRevision !== undefined
      ? { warehouseRevision: v.warehouseRevision }
      : {}),
  };
}
