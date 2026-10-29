/** Shared by the editor and the issue route, before lossy normalization. */
export type OfferFieldErrors = Record<string, string>

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && !(typeof value === "string" && value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateCrmOfferForIssue(value: unknown): OfferFieldErrors {
  const input = record(value)
  const snapshot = record(input.snapshot)
  const errors: OfferFieldErrors = {}
  for (const [key, label] of [["subject", "Subiectul"], ["message", "Mesajul"]]) {
    if (!hasText(input[key])) errors[key] = `${label} este obligatoriu.`
  }
  if (!hasText(snapshot.validityText)) errors["snapshot.validityText"] = "Valabilitatea ofertei este obligatorie."
  if (!Array.isArray(snapshot.conditions) || !snapshot.conditions.some(hasText)) {
    errors["snapshot.conditions"] = "Condițiile comerciale sunt obligatorii."
  }
  if (!hasText(snapshot.comments)) errors["snapshot.comments"] = "Comentariile interne sunt obligatorii."
  for (const key of ["vatPercent", "adjustmentPercent"]) {
    if (finiteNumber(snapshot[key]) === null) errors[`snapshot.${key}`] = "Completați o valoare numerică validă."
  }
  for (const key of ["products", "optionalProducts"]) {
    const rows = snapshot[key]
    if (!Array.isArray(rows)) {
      if (key === "products" || rows !== undefined) errors[`snapshot.${key}`] = "Lista de produse este invalidă."
      continue
    }
    if (key === "products" && rows.length === 0) errors["snapshot.products"] = "Adăugați cel puțin un produs."
    rows.forEach((value, index) => {
      const row = record(value)
      const prefix = `snapshot.${key}.${index}`
      if (!hasText(row.name)) errors[`${prefix}.name`] = "Completați denumirea."
      if (!hasText(row.um)) errors[`${prefix}.um`] = "Completați unitatea de măsură."
      const quantity = finiteNumber(row.quantity)
      if (quantity === null || quantity <= 0) errors[`${prefix}.quantity`] = "Cantitatea trebuie să fie mai mare decât 0."
      const price = finiteNumber(row.price)
      if (price === null || price < 0) errors[`${prefix}.price`] = "Completați un preț mai mare sau egal cu 0."
    })
  }
  return errors
}
