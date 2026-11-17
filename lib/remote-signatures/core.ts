import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";

export type Target = {
  workId: string;
  kind: "report" | "sheet" | "completion";
  sheetId?: string;
};
export type Data = Record<string, any>;
export const DECLARATION =
  "Confirm că aceasta este semnătura mea și că am verificat documentul prezentat.";
export const DECLARATION_VERSION = "remote-signature-v1";
export const INVITATION_TTL = 7 * 86400000;
export const CONFIRMATION_TTL = 86400000;
export class SigningError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = "SIGNING_INVALID",
  ) {
    super(message);
  }
}
export function check(
  value: unknown,
  message: string,
  status = 400,
): asserts value {
  if (!value) throw new SigningError(message, status);
}
export function identifier(value: unknown): string {
  check(
    typeof value === "string" && /^[\w-]{1,160}$/.test(value),
    "Identificator invalid.",
  );
  return value;
}
export function target(value: Data): Target {
  check(
    ["report", "sheet", "completion"].includes(value.kind),
    "Document invalid.",
  );
  return {
    workId: identifier(value.workId),
    kind: value.kind,
    ...(value.kind === "sheet" ? { sheetId: identifier(value.sheetId) } : {}),
  };
}
export function canonical(value: any): string {
  if (value?.toDate) return JSON.stringify(value.toDate().toISOString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value))
    return `[${value.map((v) => canonical(v ?? null)).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}
export const digest = (value: any) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const targetKey = (t: Target) => digest(t);
export function email(value: unknown) {
  const result = String(value || "")
    .trim()
    .toLowerCase();
  check(
    result.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result),
    "Adresa de email este invalidă.",
  );
  return result;
}
export function signingSecret() {
  const secret = process.env.REMOTE_SIGNATURE_SECRET || "";
  check(
    Buffer.byteLength(secret) >= 32,
    "Semnarea prin email nu este încă configurată.",
    503,
  );
  return secret;
}
// Reconstructible by the server for copying/resending; never expose the secret.
export function token(
  secret: string,
  id: string,
  phase: "invite" | "confirm",
  nonce = "",
) {
  return createHmac("sha256", secret)
    .update(`${phase}:${id}:${nonce}`)
    .digest("base64url");
}
export function equalToken(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function assertActive(request: Data, now: number) {
  check(
    ["invited", "awaiting_confirmation"].includes(request.status),
    "Solicitarea nu mai este activă.",
    409,
  );
  check(
    now < request.expiresAt,
    "Solicitarea a expirat. Cereți un link nou.",
    410,
  );
}
export function assertSource(request: Data, source: Data) {
  check(
    request.sourceHash === digest(source),
    "Documentul s-a modificat. Este necesară o solicitare nouă.",
    409,
  );
}
export const clean = (value: any) => JSON.parse(canonical(value));
export const pick = (value: Data, keys: string[]) =>
  Object.fromEntries(
    keys.filter((k) => value[k] !== undefined).map((k) => [k, value[k]]),
  );

/** Validate pixels without rewriting the PNG the beneficiary reviewed. */
export async function validateSignatureImage(value: unknown) {
  check(
    typeof value === "string" &&
      value.length <= 120000 &&
      /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value),
    "Semnătură PNG invalidă.",
  );
  try {
    const { data, info } = await sharp(
      Buffer.from(value.split(",")[1], "base64"),
      { limitInputPixels: 4_000_000 },
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    check(
      info.width <= 4096 && info.height <= 4096,
      "Semnătura depășește dimensiunile permise.",
    );
    let ink = false;
    for (let i = 0; i < data.length; i += 4)
      if (
        data[i + 3] > 20 &&
        Math.min(data[i], data[i + 1], data[i + 2]) < 230
      ) {
        ink = true;
        break;
      }
    check(
      ink,
      "Semnătura este goală. Desenează semnătura înainte de confirmare.",
    );
  } catch (e) {
    if (e instanceof SigningError) throw e;
    throw new SigningError(
      "Imaginea semnăturii nu poate fi citită. Desenează semnătura din nou.",
    );
  }
}
