import { SagaError } from "./contracts";
export type SagaClientRow = {
  code: string;
  name: string;
  taxId: string;
  country: string;
};
export type SagaClientEntry = SagaClientRow & {
  id: string;
  revision: number;
  source: string;
  importedAt: string;
  updatedBy: string;
  origin?: "manual" | "export";
};
export type SagaClientLink = {
  clientId: string;
  sagaClientId: string;
  sagaRevision: number;
  country: string;
  fomTaxId: string;
  missingTaxConfirmed: boolean;
  active: boolean;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  confirmationMethod?: "manual" | "export";
  confirmedByName?: string;
};
export type ClientAssociation = {
  fiscalCode: string;
  clientId: string | null;
  clientName: string;
  taxId: string;
  revision: number;
  link: SagaClientLink | null;
  entry: SagaClientEntry | null;
  issues: string[];
};
export type ClientImport = {
  id: string;
  source: string;
  total: number;
  next: number;
  chunks: number;
  status: "running" | "completed" | "cancelled";
  updatedAt: string;
  updatedBy: string;
};
export type ExportCell = { text: string; ambiguous?: boolean };
export type ExportSheet = {
  sheets: string[];
  sheet: string;
  headers: string[];
  rows: ExportCell[][];
};
export const CLIENT_IMPORT_BATCH = 200;
export function normalizeTaxId(raw: string, country: string) {
  let s = String(raw || "")
    .trim()
    .toUpperCase();
  if (["N/A", "-", "NECUNOSCUT"].includes(s)) return "";
  s = s.replace(/[\s.\-/]/g, "");
  return country && s.startsWith(country) ? s.slice(country.length) : s;
}
export function clientTaxId(client: Record<string, unknown>, country: string) {
  const values = [client.cui, client.cif, client.CUI, client.CIF].filter(
    (v): v is string => typeof v === "string" && !!v.trim(),
  );
  const distinct = new Set(
    values.map((v) => normalizeTaxId(v, country)).filter(Boolean),
  );
  return {
    raw: values[0] || "",
    normalized: distinct.values().next().value || "",
    conflict: distinct.size > 1,
  };
}
export function validateClientRows(input: unknown): SagaClientRow[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 5000)
    throw new SagaError(
      "INVALID_IMPORT",
      "Fișierul trebuie să conțină între 1 și 5.000 de clienți.",
    );
  const clean = (value: unknown, max: number, required = false) => {
    if (
      typeof value !== "string" ||
      value.length > max ||
      /[\x00-\x1f\x7f]/.test(value) ||
      (required && !value.trim())
    )
      throw new SagaError(
        "INVALID_IMPORT",
        "Verifică toate codurile, denumirile și țările din previzualizare.",
      );
    return value.trim();
  };
  const byCode = new Map<string, SagaClientRow>();
  for (const value of input) {
    const v = value as SagaClientRow;
    if (!v || typeof v !== "object")
      throw new SagaError("INVALID_IMPORT", "Rând invalid.");
    const row = {
      code: clean(v.code, 100, true),
      name: clean(v.name, 300, true),
      taxId: clean(v.taxId, 100),
      country: clean(v.country, 2, true).toUpperCase(),
    };
    if (!/^[A-Z]{2}$/.test(row.country))
      throw new SagaError(
        "INVALID_IMPORT",
        "Țara trebuie completată cu două litere, de exemplu RO.",
      );
    const previous = byCode.get(row.code);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row))
      throw new SagaError(
        "DUPLICATE_CODE",
        `Codul ${row.code} are date contradictorii.`,
      );
    byCode.set(row.code, row);
  }
  return [...byCode.values()];
}
export function sameFiscalIdentity(
  fom: Record<string, unknown>,
  entry: SagaClientRow,
  country: string,
) {
  const identity = clientTaxId(fom, country);
  const sagaTax = normalizeTaxId(entry.taxId, entry.country);
  if (identity.conflict)
    return "Datele CUI/CIF ale clientului FOM sunt contradictorii. Corectează clientul înainte de asociere.";
  if (country !== entry.country)
    return "Țara fiscală diferă de cea a clientului SAGA.";
  if (identity.normalized && sagaTax && identity.normalized !== sagaTax)
    return "CUI/CIF diferit între clientul FOM și clientul SAGA.";
  return "";
}
