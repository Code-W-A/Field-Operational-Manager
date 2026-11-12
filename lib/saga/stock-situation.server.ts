import { XMLParser, XMLValidator } from "fast-xml-parser";
import { SagaError } from "./contracts";
import type { SagaStockSituation } from "./stock-situation";

export function parseStockSituation(
  xml: string,
  period: { start: string; end: string },
  checkedAt: string,
  secrets: string[],
): SagaStockSituation {
  const invalid = () =>
    new SagaError(
      "INVALID_RESPONSE",
      "Raportul stocurilor SAGA nu poate fi interpretat.",
      502,
    );
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw invalid();
  const parsed = new XMLParser({
    parseTagValue: false,
    removeNSPrefix: true,
    trimValues: true,
  }).parse(xml);
  if (!Object.prototype.hasOwnProperty.call(parsed, "Situatie"))
    throw invalid();
  const raw = parsed.Situatie?.LinieSituatieXML;
  const rows = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  if (rows.length > 50000) throw invalid();
  const text = (value: unknown, required = false) => {
    if (value == null && !required) return "";
    if (
      typeof value !== "string" ||
      value.length > 1000 ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      throw invalid();
    if (required && !value.trim()) throw invalid();
    return secrets.reduce(
      (s, secret) => (secret ? s.split(secret).join("[redactat]") : s),
      value.trim(),
    );
  };
  const decimal = (value: unknown, required = false) => {
    const number = text(value, required).replace(",", ".");
    if (number && !/^-?\d{1,18}(?:\.\d{1,8})?$/.test(number)) throw invalid();
    return number;
  };
  const seen = new Set<string>();
  return {
    ...period,
    checkedAt,
    rows: rows.map((r: Record<string, unknown>) => {
      if (!r || typeof r !== "object" || Array.isArray(r)) throw invalid();
      const row = {
        code: text(r.COD_ART, true),
        name: text(r.DENUMIRE, true),
        typeCode: text(r.TIP, true),
        typeName: text(r.DEN_TIP, true),
        warehouseCode: text(r.GESTIUNE, true),
        warehouseName: text(r.DEN_GEST, true),
        unit: text(r.UM),
        vat: decimal(r.TVA),
        quantity: decimal(r.CANT_FIN, true),
        available: decimal(r.DISPONIBIL),
      };
      const key = JSON.stringify([row.code, row.typeCode, row.warehouseCode]);
      if (seen.has(key)) throw invalid();
      seen.add(key);
      return row;
    }),
  };
}

export function stockSituationPeriod(now: number) {
  const end = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  return { start: `${end.slice(0, 4)}-01-01`, end };
}
