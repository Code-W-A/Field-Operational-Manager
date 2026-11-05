export type CrmOfferTerms = {
  payment: string
  delivery: string
  installation: string
  additional: string[]
}

/** Read existing snapshots without dropping custom or repeated conditions. */
export function parseCrmOfferConditions(value: unknown): CrmOfferTerms {
  const terms: CrmOfferTerms = { payment: "", delivery: "", installation: "", additional: [] }
  const keys = { plata: "payment", livrare: "delivery", instalare: "installation" } as const
  const seen = new Set<string>()
  for (const row of Array.isArray(value) ? value : []) {
    if (typeof row !== "string" || !row.trim()) continue
    const match = row.trim().match(/^(plata|livrare|instalare)\s*:\s*([\s\S]*)$/i)
    if (match && !seen.has(match[1].toLowerCase())) {
      const prefix = match[1].toLowerCase() as keyof typeof keys
      terms[keys[prefix]] = match[2].trim()
      seen.add(prefix)
    } else {
      terms.additional.push(row.trim())
    }
  }
  return terms
}
