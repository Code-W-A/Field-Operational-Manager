import { SagaError } from "./contracts";
export type ImportOutcome = "imported" | "partial" | "failed" | "unknown";
export type SagaImportResult = {
  outcome: ImportOutcome;
  httpStatus: number;
  report: string;
  checkedAt: string;
  truncated: boolean;
};
export type ImportPolicy = {
  mode: "dry-run" | "test" | "production";
  enabled: boolean;
  testFiscalCode: string;
  testConfirmed: boolean;
  checks: number;
  intervalMs: number;
};
export function importPolicy(
  env: Record<string, string | undefined> = process.env,
): ImportPolicy {
  const mode = env.SAGA_IMPORT_MODE || "dry-run";
  if (!["dry-run", "test", "production"].includes(mode))
    throw new SagaError(
      "IMPORT_CONFIG",
      "Modul importului SAGA este invalid.",
      503,
    );
  const number = (key: string, fallback: number, min: number, max: number) => {
    const v = env[key] === undefined ? fallback : Number(env[key]);
    if (!Number.isInteger(v) || v < min || v > max)
      throw new SagaError(
        "IMPORT_CONFIG",
        `Configurație invalidă: ${key}.`,
        503,
      );
    return v;
  };
  return {
    mode: mode as ImportPolicy["mode"],
    enabled: env.SAGA_IMPORTS_ENABLED === "true",
    testFiscalCode: (env.SAGA_TEST_COD_FISCAL || "").trim().replace(/^RO/i, ""),
    testConfirmed: env.SAGA_TEST_FIRM_CONFIRMED === "true",
    checks: number("SAGA_STOCK_CHECK_ATTEMPTS", 3, 1, 5),
    intervalMs: number("SAGA_STOCK_CHECK_INTERVAL_MS", 5000, 1000, 60000),
  };
}
export function requireLiveImports(
  policy: ImportPolicy,
  fiscalCode: string,
  readsEnabled: boolean,
) {
  if (policy.mode === "dry-run" || !policy.enabled || !readsEnabled)
    throw new SagaError(
      "IMPORTS_DISABLED",
      "Transmiterea reală către SAGA nu este activată.",
      409,
    );
  if (
    policy.mode === "test" &&
    (!policy.testConfirmed ||
      !policy.testFiscalCode ||
      policy.testFiscalCode !== fiscalCode)
  )
    throw new SagaError(
      "TEST_COMPANY_REQUIRED",
      "Firma SAGA de test trebuie configurată și confirmată explicit.",
      409,
    );
}
export function redactSagaReport(text: string, secrets: string[]) {
  let result = text;
  for (const secret of [...secrets]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length))
    result = result.split(secret).join("[redactat]");
  return result
    .replace(/(Bearer\s+)[^\s"<>]+/gi, "$1[redactat]")
    .replace(/(X-Saga-Refresh-Token\s*[:=]\s*)[^\s"<>]+/gi, "$1[redactat]");
}
export function parseImportResult(
  status: number,
  body: string,
  at: string,
  secrets: string[] = [],
  truncated = false,
): SagaImportResult {
  let success: unknown;
  try {
    const v = JSON.parse(body);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const a = v.success,
        b = v.Success;
      if (a !== undefined && b !== undefined && a !== b) success = "conflict";
      else success = a ?? b;
    }
  } catch {}
  let outcome: ImportOutcome = "unknown";
  if (!truncated) {
    if (status === 200 && success === true) outcome = "imported";
    else if (status === 200 && success === false) outcome = "failed";
    else if (
      status === 207 &&
      body.trim() &&
      success !== true &&
      success !== "conflict"
    )
      outcome = "partial";
    else if (
      (status === 400 && success === false) ||
      (status === 422 &&
        body.trim() &&
        success !== true &&
        success !== "conflict")
    )
      outcome = "failed";
  }
  return {
    outcome,
    httpStatus: status,
    report: redactSagaReport(body, secrets),
    checkedAt: at,
    truncated,
  };
}
