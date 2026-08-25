import type { OfferItem } from "@/lib/utils/offer-pdf"

/**
 * Convertește pozițiile dintr-un snapshot Firestore în itemi pentru PDF.
 * Acceptă și denumirile vechi (denumire/cantitate/pretUnitar) din lucrări.
 */
export function toOfferPdfItems(rows: unknown): OfferItem[] {
  if (!Array.isArray(rows)) return []
  return rows.map((row: any) => ({
    name: String(row?.name || row?.denumire || ""),
    quantity: Number(row?.quantity || row?.cantitate || 0),
    price: Number(row?.price || row?.pretUnitar || 0),
    um: row?.um ? String(row.um) : undefined,
  }))
}
