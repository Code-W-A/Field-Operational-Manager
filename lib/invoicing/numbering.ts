export class InvoiceNumberingError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type NumberingInput = {
  expectedRevision: number;
  prefix: string;
  lastVerifiedNumber: string;
  reason: string;
  exclusiveConfirmed: boolean;
  sagaVerified: boolean;
};
export type NumberingCounter = {
  fiscalCode: string;
  prefix: string;
  width: number;
  lastNumber: string;
  allocationCount: number;
  revision: number;
  updatedAt: string;
};
export type NumberingConfig = {
  fiscalCode: string;
  prefix: string;
  counterId: string;
  width: number;
  revision: number;
  hasAllocated: boolean;
  verifiedLast: string;
  verifiedAt: string;
  updatedBy: string;
  reason: string;
  exclusiveConfirmed: true;
};
export type UserNumberingIdentity = {
  mode: "per_user";
  uid: string;
  name: string;
  profileRevision: number;
  modeRevision: number;
  counterRevision: number;
  counterId: string;
  prefix: string;
  width: number;
};
export type NumberingState = {
  mode?: "legacy" | "per_user";
  user?: UserNumberingIdentity;
  reason?: string;
  fiscalCode: string;
  writesEnabled: boolean;
  config: NumberingConfig | null;
  counter: NumberingCounter | null;
  estimatedNumber: string | null;
};
export type NumberingPreview = {
  previousNumber: string | null;
  nextNumber: string;
  confirmationHash: string;
  input: NumberingInput;
  width: number;
};
export type NumberReservation = {
  userNumbering?: UserNumberingIdentity;
  fiscalCode: string;
  workId: string;
  operationId: string;
  draftRevision: number;
  counterId: string;
  prefix: string;
  number: string;
  fullNumber: string;
  allocatedAt: string;
  allocatedBy: string;
};
const invalid = (message: string) =>
  new InvoiceNumberingError("INVALID_NUMBERING", message);
export function parseLastNumber(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,18}$/.test(value.trim()))
    throw invalid(
      "Completează ultima valoare numerică folosind între 1 și 18 cifre.",
    );
  const raw = value.trim();
  return { number: BigInt(raw).toString(), width: raw.length };
}
export function nextInvoiceNumber(last: string) {
  const next = BigInt(parseLastNumber(last).number) + BigInt(1);
  if (next.toString().length > 18)
    throw invalid(
      "Plaja numerică este epuizată. Configurează numerotarea cu administratorul.",
    );
  return next.toString();
}
export function formatInvoiceNumber(
  prefix: string,
  number: string,
  width: number,
) {
  return prefix + number.padStart(width, "0");
}
export function parseNumberingInput(value: unknown): NumberingInput {
  const v = value as NumberingInput;
  if (
    !v ||
    !Number.isSafeInteger(v.expectedRevision) ||
    v.expectedRevision < 0 ||
    typeof v.prefix !== "string" ||
    v.prefix.length > 32 ||
    /[\x00-\x1f\x7f]/.test(v.prefix) ||
    typeof v.reason !== "string" ||
    v.reason.length > 500 ||
    typeof v.exclusiveConfirmed !== "boolean" ||
    typeof v.sagaVerified !== "boolean"
  )
    throw invalid("Configurația numerotării nu este validă.");
  parseLastNumber(v.lastVerifiedNumber);
  if (!v.exclusiveConfirmed || !v.sagaVerified)
    throw invalid(
      "Confirmă verificarea numărului în SAGA și utilizarea exclusivă a seriei în FOM.",
    );
  return {
    expectedRevision: v.expectedRevision,
    prefix: v.prefix.trim(),
    lastVerifiedNumber: v.lastVerifiedNumber.trim(),
    reason: v.reason.trim(),
    exclusiveConfirmed: true,
    sagaVerified: true,
  };
}
export function candidateNumbering(
  input: NumberingInput,
  config: NumberingConfig | null,
  counter: NumberingCounter | null,
) {
  if ((config?.revision || 0) !== input.expectedRevision)
    throw new InvoiceNumberingError(
      "NUMBERING_CONFLICT",
      "Numerotarea a fost modificată. Reîncarcă și pregătește din nou previzualizarea.",
      409,
    );
  const parsed = parseLastNumber(input.lastVerifiedNumber);
  if (config?.hasAllocated && config.prefix !== input.prefix)
    throw invalid("Seria nu poate fi schimbată după prima alocare.");
  if (config && !input.reason)
    throw invalid("Completează motivul corecției numerotării.");
  if (
    counter?.allocationCount &&
    BigInt(parsed.number) < BigInt(counter.lastNumber)
  )
    throw invalid("Contorul nu poate fi micșorat după prima alocare.");
  const width = counter?.allocationCount ? counter.width : parsed.width;
  return {
    lastNumber: parsed.number,
    width,
    nextNumber: formatInvoiceNumber(
      input.prefix,
      nextInvoiceNumber(parsed.number),
      width,
    ),
  };
}
