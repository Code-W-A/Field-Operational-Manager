import { parseCrmOfferConditions } from "@/lib/crm/offer-conditions"

const hasText = (value: unknown) => typeof value === "string" && value.trim().length > 0
const number = (value: unknown): number | null => {
  if (typeof value !== "number" && !hasText(value)) return null
  const parsed = Number(typeof value === "string" ? value.replace(",", ".") : value)
  return Number.isFinite(parsed) ? parsed : null
}

/** Validate before normalization: blank numeric inputs must not become zero. */
export function validateTicketOfferForSend(snapshot: any): Record<string, string> {
  const errors: Record<string, string> = {}
  const terms = parseCrmOfferConditions(snapshot?.conditions)
  for (const [key, label] of [["payment", "plată"], ["delivery", "livrare"], ["installation", "instalare"]] as const) {
    if (!hasText(terms[key])) errors[`conditions.${key}`] = `Completați termenul de ${label}.`
  }
  const vat = number(snapshot?.vat)
  if (vat === null || vat < 0 || vat > 100) errors.vat = "Completați un TVA valid (0–100%)."
  const adjustment = number(snapshot?.adjustmentPercent)
  if (adjustment === null || adjustment < 0 || adjustment > 100) errors.adjustmentPercent = "Completați discountul (0–100%; 0 dacă nu se aplică)."
  if (!Array.isArray(snapshot?.products) || !snapshot.products.length) errors.products = "Adăugați cel puțin un produs."
  else snapshot.products.forEach((row: any, index: number) => {
    const prefix = `products.${index}`
    if (!hasText(row?.name)) errors[`${prefix}.name`] = `Produsul ${index + 1}: completați denumirea.`
    if (!hasText(row?.um)) errors[`${prefix}.um`] = `Produsul ${index + 1}: completați unitatea de măsură.`
    const quantity = number(row?.quantity)
    if (quantity === null || quantity <= 0) errors[`${prefix}.quantity`] = `Produsul ${index + 1}: cantitatea trebuie să fie mai mare decât 0.`
    const price = number(row?.price)
    if (price === null || price < 0) errors[`${prefix}.price`] = `Produsul ${index + 1}: completați un preț mai mare sau egal cu 0.`
  })
  return errors
}
