import { SagaError } from "./contracts";
export const REFERENCE_KINDS = [
  "articles",
  "types",
  "warehouses",
  "agents",
  "clientTerms",
] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];
export type ReferenceField = {
  key: string;
  label: string;
  type: "code" | "text" | "decimal" | "currency" | "boolean" | "term" | "days";
  required?: boolean;
};
const identity: ReferenceField[] = [
  { key: "code", label: "Cod SAGA", type: "code", required: true },
  { key: "name", label: "Denumire", type: "text", required: true },
];
export const REFERENCE_LABELS: Record<ReferenceKind, string> = {
  articles: "Articole",
  types: "Tipuri SAGA",
  warehouses: "Gestiuni",
  agents: "Agenți",
  clientTerms: "Termene clienți",
};
export const REFERENCE_FIELDS: Record<ReferenceKind, ReferenceField[]> = {
  articles: [
    ...identity,
    { key: "typeCode", label: "Cod tip SAGA", type: "code" },
    { key: "unit", label: "UM", type: "text" },
    { key: "vat", label: "TVA (%)", type: "decimal" },
    { key: "price", label: "Preț din export", type: "decimal" },
    { key: "currency", label: "Monedă", type: "currency" },
  ],
  types: [
    ...identity,
    ...[
      ["purchasable", "Aprovizionabil"],
      ["consumable", "Consumabil"],
      ["sellable", "Vandabil"],
      ["produced", "Produs"],
      ["notStocked", "Nestocat"],
    ].map(([key, label]) => ({ key, label, type: "boolean" as const })),
  ],
  warehouses: [
    ...identity,
    { key: "category", label: "Tip gestiune din export", type: "text" },
  ],
  agents: identity,
  clientTerms: [
    { key: "code", label: "Cod client SAGA", type: "code", required: true },
    { key: "termState", label: "Stare termen", type: "term" },
    { key: "days", label: "Zile scadență", type: "days" },
  ],
};
export type ReferenceRow = {
  code: string;
  name: string;
  [key: string]: string | number | boolean | null;
};
export type ApiArticleSnapshot = {
  name: string;
  unit: string;
  vat: string | null;
  price: string | null;
  checkedAt: string;
};
export type ReferenceEntry = {
  operatorConfirmation?: {
    currency: "RON";
    kind: "goods" | "service";
    uid: string;
    at: string;
  };
  id: string;
  kind: ReferenceKind;
  code: string;
  name: string;
  exportData: ReferenceRow;
  apiSnapshot: ApiArticleSnapshot | null;
  revision: number;
  source: string;
  importedAt: string;
  updatedAt: string;
  updatedBy: string;
  importId: string;
  clientId?: string;
};
export type ReferenceImport = {
  id: string;
  kind: ReferenceKind;
  source: string;
  total: number;
  next: number;
  chunks: number;
  status: "running" | "completed" | "cancelled";
  updatedAt: string;
  updatedBy: string;
};
export type IssuerUser = {
  uid: string;
  name: string;
  role: string;
  disabled: boolean;
};
export type IssuerConfiguration = {
  numbering?: { counterId: string; activatedAt: string; activatedBy: string };
  uid: string;
  prefix: string;
  lastVerifiedNumber: string;
  agentId: string;
  agentCode: string;
  agentName: string;
  agentRevision: number;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  status: "prepared";
  exclusiveConfirmed: true;
  lastNumberConfirmed: true;
};
export const REFERENCE_BATCH = 200;
export const referenceError = (
  message: string,
  code = "INVALID_REFERENCE",
  status = 400,
) => new SagaError(code, message, status);
export function referenceKind(v: unknown): ReferenceKind {
  if (!REFERENCE_KINDS.includes(v as ReferenceKind))
    throw referenceError("Catalog necunoscut.");
  return v as ReferenceKind;
}
export function normalizeReference(v: string) {
  return v
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("ro");
}
export function cleanReference(
  v: unknown,
  max = 100,
  required = false,
): string {
  if (
    typeof v !== "string" ||
    v.length > max ||
    /[\x00-\x1f\x7f]/.test(v) ||
    (required && !v.trim())
  )
    throw referenceError("Text invalid, lipsă sau prea lung.");
  return v.trim();
}
export function referenceDecimal(v: unknown, vat = false): string | null {
  if (v === undefined || v === null || v === "") return null;
  const value = cleanReference(v, 40).replace(",", ".");
  if (!/^\d{1,15}(?:\.\d{1,8})?$/.test(value) || (vat && Number(value) > 100))
    throw referenceError(
      "Prețul/TVA trebuie să fie un număr zecimal pozitiv sau zero, cu punct sau virgulă.",
    );
  return value.replace(/^0+(?=\d)/, "");
}
function booleanValue(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = normalizeReference(cleanReference(v, 20));
  if (["1", "true", "da", "yes"].includes(s)) return true;
  if (["0", "false", "nu", "no"].includes(s)) return false;
  throw referenceError(
    "Proprietățile tipului trebuie să fie da/nu, true/false sau 1/0.",
  );
}
export function validateReferenceRows(
  kind: ReferenceKind,
  input: unknown,
): ReferenceRow[] {
  referenceKind(kind);
  if (!Array.isArray(input) || !input.length || input.length > 5000)
    throw referenceError(
      "Importul trebuie să conțină între 1 și 5.000 de rânduri.",
    );
  const byCode = new Map<string, ReferenceRow>();
  for (const value of input) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw referenceError("Rând invalid.");
    const row: ReferenceRow = {
      code: cleanReference(value.code, 100, true),
      name: kind === "clientTerms" ? "" : cleanReference(value.name, 300, true),
    };
    for (const f of REFERENCE_FIELDS[kind]) {
      if (["code", "name"].includes(f.key)) continue;
      const v = value[f.key];
      if (f.type === "decimal")
        row[f.key] = referenceDecimal(v, f.key === "vat");
      else if (f.type === "boolean") row[f.key] = booleanValue(v);
      else if (f.type === "currency") {
        const s = cleanReference(v ?? "", 3).toUpperCase();
        if (s && !/^[A-Z]{3}$/.test(s))
          throw referenceError(
            "Moneda trebuie să aibă trei litere, de exemplu RON.",
          );
        row[f.key] = s || null;
      } else if (f.type !== "term" && f.type !== "days")
        row[f.key] =
          cleanReference(v ?? "", f.key === "category" ? 100 : 100) || null;
    }
    if (kind === "clientTerms") {
      const raw =
          value.days === null || value.days === undefined
            ? ""
            : String(value.days).trim(),
        state =
          cleanReference(value.termState ?? "", 20) ||
          (raw ? "days" : "unknown");
      if (!["unknown", "none", "days"].includes(state))
        throw referenceError(
          "Alege termen necunoscut, lipsă confirmată sau număr de zile.",
        );
      if (state === "days") {
        if (!/^\d{1,4}$/.test(raw) || Number(raw) > 3650)
          throw referenceError(
            "Zilele de scadență trebuie să fie între 0 și 3.650.",
          );
        row.days = Number(raw);
      } else {
        if (raw)
          throw referenceError(
            "Un termen necunoscut/fără termen nu poate avea zile completate.",
          );
        row.days = null;
      }
      row.termState = state;
    }
    const old = byCode.get(row.code);
    if (old && JSON.stringify(old) !== JSON.stringify(row))
      throw referenceError(
        `Codul ${row.code} are date contradictorii.`,
        "DUPLICATE_CODE",
      );
    byCode.set(row.code, row);
  }
  return [...byCode.values()];
}
