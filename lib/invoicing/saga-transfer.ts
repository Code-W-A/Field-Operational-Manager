import { SagaError } from "@/lib/saga/contracts";
import type { ImportOutcome, ImportPolicy } from "@/lib/saga/import";
import type { PreparedInvoice } from "./xml";
export type StockReading = { quantity: string; checkedAt: string };
export type StockGroup = {
  code: string;
  warehouse: string;
  unit: string;
  expected: string;
  before: StockReading | null;
  after: StockReading | null;
  delta: string | null;
  matches: boolean;
};
export type SagaTransfer = {
  schemaVersion: 1;
  id: string;
  workId: string;
  fiscalCode: string;
  sha256: string;
  number: string;
  mode: ImportPolicy["mode"];
  operationId: string;
  phase:
    | "baseline"
    | "ready"
    | "sending"
    | "after"
    | "done"
    | "blocked"
    | "review";
  importStatus: "pending" | "sending" | ImportOutcome;
  stockStatus:
    | "pending"
    | "checking"
    | "observed"
    | "not_confirmed"
    | "not_applicable"
    | "blocked";
  groups: StockGroup[];
  cursor: number;
  attempts: number;
  maxAttempts: number;
  intervalMs: number;
  nextAt: number;
  leaseOwner: string | null;
  leaseUntil: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  actorRole: string;
  revision: number;
  error: string | null;
  httpStatus: number | null;
  reportAvailable: boolean;
  reportChunks: number;
  reportTruncated: boolean;
  reportSha256: string | null;
};
export class TransferError extends SagaError {}
export const transferPending = (v: SagaTransfer) =>
  ["baseline", "ready", "sending", "after"].includes(v.phase);
const decimal = (v: string) => {
  if (!/^-?\d+(?:\.\d+)?$/.test(v) || v.length > 80)
    throw new TransferError(
      "INVALID_QUANTITY",
      "Cantitatea SAGA nu este validă.",
    );
  return v;
};
export function decimalSum(a: string, b: string, subtract = false) {
  decimal(a);
  decimal(b);
  const precision = Math.max(
    (a.split(".")[1] || "").length,
    (b.split(".")[1] || "").length,
  );
  const scale = (v: string) => {
    const neg = v.startsWith("-");
    const [w, f = ""] = v.replace(/^-/, "").split(".");
    const n = BigInt(w + f.padEnd(precision, "0"));
    return neg ? -n : n;
  };
  const value = scale(a) + (subtract ? -scale(b) : scale(b)),
    sign = value < BigInt(0) ? "-" : "",
    digits = (value < BigInt(0) ? -value : value)
      .toString()
      .padStart(precision + 1, "0");
  if (!precision) return sign + digits;
  const fraction = digits.slice(-precision).replace(/0+$/, "");
  return sign + digits.slice(0, -precision) + (fraction ? "." + fraction : "");
}
export const decimalLess = (a: string, b: string) =>
  decimalSum(a, b, true).startsWith("-");
export function stockGroups(doc: PreparedInvoice): StockGroup[] {
  const groups = new Map<string, StockGroup>();
  for (const line of doc.snapshot.lines) {
    if (line.kind === "service") continue;
    if (
      !line.code ||
      !line.warehouseCode ||
      !line.unit ||
      decimalLess(line.quantity, "0") ||
      decimalSum(line.quantity, "0") === "0"
    )
      throw new TransferError(
        "INVALID_MAPPING",
        "Produsul trebuie să aibă cod SAGA, gestiune, UM și cantitate pozitivă.",
      );
    const key = JSON.stringify([line.code, line.warehouseCode]),
      current = groups.get(key);
    if (current) {
      if (current.unit.trim().toLowerCase() !== line.unit.trim().toLowerCase())
        throw new TransferError(
          "UNIT_CONFLICT",
          "Același articol are unități de măsură diferite.",
        );
      current.expected = decimalSum(current.expected, line.quantity);
    } else
      groups.set(key, {
        code: line.code,
        warehouse: line.warehouseCode,
        unit: line.unit,
        expected: decimalSum(line.quantity, "0"),
        before: null,
        after: null,
        delta: null,
        matches: false,
      });
  }
  return [...groups.values()];
}
export const IMPORT_LABELS: Record<SagaTransfer["importStatus"], string> = {
  pending: "Netrimisă",
  sending: "Transmitere începută",
  imported: "Importată în SAGA",
  partial: "Import parțial — necesită reconciliere",
  failed: "Import respins",
  unknown: "Rezultat incert — necesită reconciliere",
};
export const STOCK_LABELS: Record<SagaTransfer["stockStatus"], string> = {
  pending: "Necitit",
  checking: "Verificare în curs",
  observed: "Diferența așteptată a fost observată",
  not_confirmed: "Scăderea stocului nu este confirmată",
  not_applicable: "Neaplicabil — servicii",
  blocked: "Transmitere oprită la verificarea stocului",
};
export const STOCK_UNCONFIRMED =
  "Factură importată în SAGA; scăderea stocului nu este confirmată.";
