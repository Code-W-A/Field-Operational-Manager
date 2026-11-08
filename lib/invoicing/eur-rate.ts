import { XMLParser, XMLValidator } from "fast-xml-parser";
export class EurRateError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type EurReference =
  | {
      status: "available";
      quoteId: string;
      requestedDate: string;
      value?: string;
      rateDate?: string;
      source?: "BNR";
      sourceUrl?: string;
      fetchedAt?: string;
    }
  | {
      status: "omitted";
      requestedDate: string;
      confirmedBy?: string;
      confirmedAt?: string;
    };
export type EurQuote = Extract<EurReference, { status: "available" }> & {
  value: string;
  rateDate: string;
  source: "BNR";
  sourceUrl: string;
  fetchedAt: string;
};
export type BnrRate = { date: string; value: string };
export const BNR_BASE = "https://curs.bnr.ro";
export const eurError = (
  message: string,
  code = "EUR_RATE_UNAVAILABLE",
  status = 502,
) => new EurRateError(code, message, status);
export function eurCalendarDate(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v))
    throw eurError("Data cursului nu este validă.", "EUR_INVALID_DATE", 400);
  const d = new Date(v + "T12:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v)
    throw eurError("Data cursului nu este validă.", "EUR_INVALID_DATE", 400);
  return v;
}
export function parseEurReference(v: unknown): EurReference | undefined {
  if (v === undefined || v === null) return;
  const a = v as EurReference;
  const requestedDate = eurCalendarDate(a?.requestedDate);
  if (a.status === "omitted")
    return {
      status: "omitted",
      requestedDate,
      ...(typeof a.confirmedBy === "string" && a.confirmedBy.length <= 200
        ? { confirmedBy: a.confirmedBy }
        : {}),
      ...(typeof a.confirmedAt === "string" && a.confirmedAt.length <= 50
        ? { confirmedAt: a.confirmedAt }
        : {}),
    };
  if (
    a.status !== "available" ||
    typeof a.quoteId !== "string" ||
    !/^[a-f0-9]{64}$/.test(a.quoteId)
  )
    throw eurError("Referință EUR invalidă.", "EUR_INVALID_REFERENCE", 400);
  const result: EurReference = {
    status: "available",
    quoteId: a.quoteId,
    requestedDate,
  };
  for (const key of [
    "value",
    "rateDate",
    "source",
    "sourceUrl",
    "fetchedAt",
  ] as const) {
    const val = a[key];
    if (val !== undefined) {
      if (typeof val !== "string" || val.length > 300)
        throw eurError("Referință EUR invalidă.", "EUR_INVALID_REFERENCE", 400);
      (result as any)[key] = val;
    }
  }
  return result;
}
export function validEurValue(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^\d{1,9}(?:\.\d{1,8})?$/.test(v) &&
    /[1-9]/.test(v)
  );
}
export function isBnrUrl(s: string) {
  return (
    s === `${BNR_BASE}/nbrfxrates10days.xml` ||
    /^https:\/\/curs\.bnr\.ro\/files\/xml\/years\/nbrfxrates\d{4}\.xml$/.test(s)
  );
}
export function parseBnrXml(text: string): BnrRate[] {
  if (
    BufferlessBytes(text) > 2 * 1024 * 1024 ||
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    XMLValidator.validate(text) !== true
  )
    throw eurError("Răspuns XML BNR invalid.");
  let dataset: any;
  try {
    dataset = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      parseTagValue: false,
      parseAttributeValue: false,
      removeNSPrefix: true,
      processEntities: true,
    }).parse(text).DataSet;
  } catch {
    throw eurError("Răspuns XML BNR invalid.");
  }
  const body = dataset?.Body;
  if (body?.OrigCurrency !== "RON")
    throw eurError("BNR nu a confirmat exprimarea cursului în RON.");
  const cubes = Array.isArray(body.Cube)
      ? body.Cube
      : body.Cube
        ? [body.Cube]
        : [],
    byDate = new Map<string, string>();
  for (const cube of cubes) {
    const date = eurCalendarDate(cube["@date"]),
      rates = Array.isArray(cube.Rate)
        ? cube.Rate
        : cube.Rate
          ? [cube.Rate]
          : [],
      eur = rates.filter((r: any) => r?.["@currency"] === "EUR");
    if (eur.length > 1) throw eurError("Curs EUR duplicat în răspunsul BNR.");
    if (!eur.length) continue;
    const r = eur[0],
      value = String(r["#text"] ?? "").trim();
    if (
      (r["@multiplier"] !== undefined && r["@multiplier"] !== "1") ||
      !validEurValue(value)
    )
      throw eurError("Curs EUR sau multiplicator BNR invalid.");
    if (byDate.has(date) && byDate.get(date) !== value)
      throw eurError("Cursuri BNR contradictorii.");
    byDate.set(date, value);
  }
  if (!byDate.size) throw eurError("Cursul EUR lipsește din răspunsul BNR.");
  return [...byDate]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
const BufferlessBytes = (s: string) => new TextEncoder().encode(s).length;
export function selectBnrRate(rows: BnrRate[], requestedDate: string) {
  eurCalendarDate(requestedDate);
  return (
    rows
      .filter((r) => r.date <= requestedDate)
      .sort((a, b) => b.date.localeCompare(a.date))[0] || null
  );
}
export function eurReferenceText(ref: EurReference) {
  if (ref.status === "omitted")
    return "Curs EUR informativ: neînregistrat (omitere confirmată).";
  if (!validEurValue(ref.value) || !ref.rateDate || ref.source !== "BNR")
    throw eurError(
      "Referința EUR nu este completă.",
      "EUR_INVALID_REFERENCE",
      409,
    );
  const date = (s: string) => s.split("-").reverse().join(".");
  return `Curs EUR informativ BNR: 1 EUR = ${ref.value} RON; publicat la ${date(ref.rateDate)}; pentru factura din ${date(ref.requestedDate)}.`;
}
