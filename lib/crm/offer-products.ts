import type { CrmOfferProduct } from "@/lib/crm/types"

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Normalizează liniile de produse dintr-un snapshot de ofertă.
 * `dropEmptyNames` se folosește pentru opționale, ca rândurile necompletate să nu ajungă în PDF.
 */
export function normalizeOfferProducts(
  value: unknown,
  options: { dropEmptyNames?: boolean } = {},
): CrmOfferProduct[] {
  if (!Array.isArray(value)) return []

  const rows = value
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null
      const item = row as Record<string, unknown>
      const quantity = normalizeNumber(item.quantity, 0)
      const price = normalizeNumber(item.price, 0)
      return {
        id: normalizeString(item.id),
        name: normalizeString(item.name),
        um: normalizeString(item.um) || "buc",
        quantity,
        price,
        total: normalizeNumber(item.total, quantity * price),
      }
    })
    .filter((row): row is CrmOfferProduct => Boolean(row))

  return options.dropEmptyNames ? rows.filter((row) => row.name.length > 0) : rows
}
