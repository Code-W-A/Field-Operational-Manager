import { DomainError } from "./errors";
import type { ProductItem } from "./works";
export const INTERVENTION_PHOTO_LIMIT = 4;
export const POSTPONE_REASON_MIN_LENGTH = 10;
export const EQUIPMENT_STATES = [
  "Funcțional",
  "Parțial funcțional",
  "Nefuncțional",
] as const;
export const WARRANTY_DECISIONS = [
  "confirma",
  "nu_intra",
  "dupa_atelier",
] as const;
export const REVISION_STATES = ["functional", "nefunctional", "na"] as const;
export const HR_REQUEST_KINDS = [
  "CO",
  "CFP",
  "CM",
  "IN",
  "DEL",
  "CORRECT_HOURS",
  "ADD_OVERTIME",
] as const;
export function isPngSignature(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length > 120000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return false;
  const data = value.slice(value.indexOf(",") + 1),
    alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  let bits = 0,
    accumulator = 0;
  for (const char of data.slice(0, 12)) {
    if (char === "=") break;
    accumulator = (accumulator << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 255);
    }
  }
  return [137, 80, 78, 71, 13, 10, 26, 10].every(
    (byte, i) => bytes[i] === byte,
  );
}
export function postponeReason(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length < POSTPONE_REASON_MIN_LENGTH
  )
    throw new DomainError(
      "Motivul amânării trebuie să aibă minimum 10 caractere.",
    );
  return value.trim();
}
export type ReportProduct = ProductItem & { id: string; total: number };
/** New writes are normalized; old snapshots are read without applying this validator. */
export function validateProducts(input: unknown): ReportProduct[] {
  if (!Array.isArray(input) || input.length > 100)
    throw new DomainError("Lista produselor este invalidă.");
  return input.map((p) => {
    if (!p || typeof p !== "object") throw new DomainError("Produs invalid.");
    const quantity = Number(p.quantity),
      price = Number(p.price),
      name = String(p.name || p.description || "").trim();
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(price) ||
      price < 0 ||
      !name
    )
      throw new DomainError("Completează produsul, cantitatea și prețul.");
    return {
      id: String(p.id || ""),
      name,
      um: String(p.um || "buc"),
      quantity,
      price,
      total: quantity * price,
    };
  });
}
export function validateReportSignatures(data: {
  semnaturaTehnician?: unknown;
  semnaturaBeneficiar?: unknown;
}) {
  // Web explicitly supports unsigned generation after confirmation.
  for (const value of [data.semnaturaTehnician, data.semnaturaBeneficiar])
    if (value && !isPngSignature(value))
      throw new DomainError("Semnătură PNG invalidă.");
}
