export const DEFAULT_OFFER_VAT_PERCENT = 21
export const OFFERS_DEFAULT_VAT_SETTING_ID = "offers_default_vat_percent"

/** Normalizează o valoare de cotă TVA (%) la un număr >= 0. */
export function normalizeVatPercent(value: unknown, fallback = DEFAULT_OFFER_VAT_PERCENT): number {
  if (value === null || value === undefined || value === "") return fallback
  const n = typeof value === "number" ? value : Number(String(value).trim().replace(",", "."))
  if (!Number.isFinite(n) || n < 0) return fallback
  return n
}

/**
 * Cota TVA globală din Setări → Sistem (`offers_default_vat_percent`).
 * Fallback: 21.
 */
export async function getDefaultOfferVatPercent(): Promise<number> {
  try {
    const { getPredefinedSettingValue } = await import("@/lib/firebase/predefined-settings")
    const value = await getPredefinedSettingValue(OFFERS_DEFAULT_VAT_SETTING_ID)
    return normalizeVatPercent(value, DEFAULT_OFFER_VAT_PERCENT)
  } catch {
    return DEFAULT_OFFER_VAT_PERCENT
  }
}
