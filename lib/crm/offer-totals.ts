/**
 * Totalurile ofertei CRM. Funcțiile primesc doar pozițiile facturabile, deci
 * opționalele nu pot ajunge în subtotal/total nici din greșeală.
 */

export interface OfferTotalsRow {
  quantity?: number | string | null
  price?: number | string | null
  total?: number | string | null
}

function toFiniteNumber(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function computeOfferSubtotal(rows: OfferTotalsRow[]): number {
  if (!Array.isArray(rows)) return 0
  return rows.reduce((sum, row) => {
    const lineTotal = toFiniteNumber(row?.total)
    return sum + (lineTotal || toFiniteNumber(row?.quantity) * toFiniteNumber(row?.price))
  }, 0)
}

export function parseAdjustmentPercent(value: string | number | null | undefined): number {
  const parsed = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : 0
}

export function applyAdjustment(subtotal: number, adjustmentPercent: number): number {
  return subtotal * (1 - adjustmentPercent / 100)
}
