import type { CrmInboxCategory } from "./inbox-types"

const CATEGORY_RULES: Array<{ category: CrmInboxCategory; keywords: string[] }> = [
  { category: "OFERTA", keywords: ["oferta", "oferta", "quotation", "price"] },
  { category: "FACTURARE", keywords: ["factura", "factura", "invoice", "plata", "payment"] },
  { category: "SUPORT", keywords: ["problema", "problema", "error", "incident", "suport"] },
  { category: "INSTALARE", keywords: ["instalare", "montaj", "punere in functiune"] },
  { category: "ADMIN", keywords: ["document", "contract", "anexa", "cerere"] },
  { category: "SPAM", keywords: ["casino", "crypto", "loan", "free money"] },
]

export function normalizeInboxText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

export function categorizeCrmInboxMessage(subject: string, bodySnippet: string): CrmInboxCategory {
  const haystack = `${normalizeInboxText(subject)} ${normalizeInboxText(bodySnippet)}`.trim()

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(normalizeInboxText(keyword)))) {
      return rule.category
    }
  }

  return "UNCLASSIFIED"
}
