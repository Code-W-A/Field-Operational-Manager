import { SagaError } from "./contracts";
export type SagaConfig = {
  apiKey: string;
  fiscalCode: string;
  baseUrl: string;
  encryptionKey: Buffer;
  readsEnabled: boolean;
};
export function sagaConfig(
  env: Record<string, string | undefined> = process.env,
): SagaConfig {
  const required = [
    "SAGA_API_KEY",
    "SAGA_COD_FISCAL",
    "SAGA_API_BASE_URL",
    "SAGA_TOKEN_ENCRYPTION_KEY",
  ];
  const missing = required.filter((k) => !env[k]?.trim());
  if (missing.length)
    throw new SagaError(
      "NOT_CONFIGURED",
      `Lipsesc variabilele: ${missing.join(", ")}.`,
      503,
    );
  const apiKey = env.SAGA_API_KEY!.trim(),
    fiscalCode = env.SAGA_COD_FISCAL!.trim().replace(/^RO/i, "");
  if (apiKey.length < 8 || apiKey.length > 16000 || /\s/.test(apiKey))
    throw new SagaError(
      "INVALID_CONFIG",
      "Cheia SAGA configurată nu are un format valid.",
      503,
    );
  if (!/^\d{2,10}$/.test(fiscalCode))
    throw new SagaError(
      "INVALID_CONFIG",
      "Codul fiscal SAGA configurat nu este valid.",
      503,
    );
  let url: URL;
  try {
    url = new URL(env.SAGA_API_BASE_URL!.trim());
  } catch {
    throw new SagaError(
      "INVALID_CONFIG",
      "Adresa API SAGA nu este validă.",
      503,
    );
  }
  if (
    url.origin !== "https://web.sagasoft.ro" ||
    !/^\/api\/v\d{8}\/?$/.test(url.pathname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new SagaError(
      "INVALID_CONFIG",
      "Adresa API trebuie să fie versiunea oficială HTTPS SAGA Web.",
      503,
    );
  const key = env.SAGA_TOKEN_ENCRYPTION_KEY!.trim();
  if (!/^[a-fA-F0-9]{64}$/.test(key))
    throw new SagaError(
      "INVALID_CONFIG",
      "Cheia de criptare SAGA trebuie să conțină 64 de caractere hexazecimale.",
      503,
    );
  return {
    apiKey,
    fiscalCode,
    baseUrl: url.href.replace(/\/$/, ""),
    encryptionKey: Buffer.from(key, "hex"),
    readsEnabled: env.SAGA_READS_ENABLED === "true",
  };
}
