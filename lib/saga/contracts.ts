export class SagaError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type SagaReadInput = {
  kind: "article" | "stock";
  code: string;
  warehouse: string;
  date: string;
};
export type SagaStatus = {
  configured: boolean;
  missing: string[];
  fiscalCode: string | null;
  state:
    | "unconfigured"
    | "disabled"
    | "ready"
    | "connected"
    | "busy"
    | "needs_review"
    | "authorization_error";
  lastReadAt: string | null;
  lastError: string | null;
};
export type SagaReadResult = {
  kind: "article" | "stock";
  code: string;
  checkedAt: string;
  warehouse: string | null;
  date: string | null;
  article?: { name: string; unit: string; vat: string; price: string };
  quantity?: string;
};
export function parseReadInput(input: unknown): SagaReadInput {
  const v = input as Record<string, unknown> | null;
  const code = (value: unknown, required: boolean) => {
    if (value === undefined && !required) return "";
    if (
      typeof value !== "string" ||
      value.length > 100 ||
      /[\x00-\x1f\x7f]/.test(value) ||
      (required && !value.trim())
    )
      throw new SagaError(
        "INVALID_INPUT",
        "Completează un cod valid, exact ca în SAGA.",
      );
    return value.trim();
  };
  if (!v || !["article", "stock"].includes(String(v.kind)))
    throw new SagaError(
      "INVALID_INPUT",
      "Alege consultarea articolului sau a stocului.",
    );
  const articleCode = code(v.code, true),
    warehouse = code(v.warehouse, false);
  const date = v.date === undefined ? "" : v.date;
  if (typeof date !== "string")
    throw new SagaError("INVALID_INPUT", "Data nu este validă.");
  if (date) {
    const parsed = new Date(`${date}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    )
      throw new SagaError("INVALID_INPUT", "Data nu este validă.");
  }
  if (v.kind === "article" && (warehouse || date))
    throw new SagaError(
      "INVALID_INPUT",
      "Gestiunea și data se folosesc doar la consultarea stocului.",
    );
  return {
    kind: v.kind as SagaReadInput["kind"],
    code: articleCode,
    warehouse,
    date,
  };
}
