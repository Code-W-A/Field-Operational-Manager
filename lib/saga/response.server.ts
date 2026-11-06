import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  SagaError,
  type SagaReadInput,
  type SagaReadResult,
} from "./contracts";
export function parseSagaResponse(
  input: SagaReadInput,
  text: string,
  checkedAt: string,
  secrets: string[],
): SagaReadResult {
  const invalid = () =>
    new SagaError(
      "INVALID_RESPONSE",
      "SAGA a returnat un răspuns care nu poate fi interpretat. Nu a fost presupus un stoc zero.",
      502,
    );
  const result: SagaReadResult = {
    kind: input.kind,
    code: input.code,
    checkedAt,
    warehouse: input.warehouse || null,
    date: input.date || null,
  };
  // Only allowlisted scalar fields leave the server. Never return raw upstream errors/XML.
  const scalar = (value: unknown, max = 1000) => {
    if (typeof value !== "string" && typeof value !== "number") throw invalid();
    let s = String(value).trim();
    for (const secret of secrets)
      if (secret) s = s.split(secret).join("[redactat]");
    if (s.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s))
      throw invalid();
    return s;
  };
  if (input.kind === "stock") {
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      throw invalid();
    }
    if (!json || (json.success ?? json.Success) !== true)
      throw new SagaError(
        "SAGA_REJECTED",
        "SAGA nu a confirmat consultarea. Verifică articolul, gestiunea și data.",
        502,
      );
    const quantity = scalar(json.data ?? json.Data, 80).replace(",", ".");
    if (!/^-?\d+(?:\.\d+)?$/.test(quantity)) throw invalid();
    return { ...result, quantity };
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true)
    throw invalid();
  let article: Record<string, unknown>;
  try {
    article = new XMLParser({
      parseTagValue: false,
      ignoreAttributes: true,
      processEntities: true,
    }).parse(text).Articol;
  } catch {
    throw invalid();
  }
  if (!article || typeof article !== "object" || Array.isArray(article))
    throw invalid();
  const name = scalar(article.Denumire),
    unit = scalar(article.UM);
  if (!name || !unit) throw invalid();
  const numeric = (value: unknown) => {
    const s = scalar(value ?? "", 80).replace(",", ".");
    if (s && !/^\d+(?:\.\d+)?$/.test(s)) throw invalid();
    return s;
  };
  return {
    ...result,
    article: {
      name,
      unit,
      vat: numeric(article.TVA),
      price: numeric(article.Pret_Vanzare1),
    },
  };
}
