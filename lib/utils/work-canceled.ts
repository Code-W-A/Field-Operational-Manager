import { WORK_STATUS } from "@/lib/utils/constants"
import { getWorkStatusClass } from "@/lib/utils/status-classes"

function eqInsensitive(a?: string, b?: string): boolean {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase()
}

/**
 * True dacă tichetul a fost anulat (status legacy „Anulat” sau arhivat cu flag/metadata anulare).
 */
export function isLucrareAnulata(lucrare: unknown): boolean {
  if (!lucrare || typeof lucrare !== "object") return false
  const l = lucrare as Record<string, unknown>
  const status = String(l.statusLucrare || "")
  if (eqInsensitive(status, WORK_STATUS.CANCELED)) return true
  if (l.anulat === true) return true
  if (String(l.motivAnulare || "").trim()) return true
  if (l.anulatAt) return true
  return false
}

/**
 * Etichetă afișată în badge-uri: „Anulat” are prioritate; „Finalizat” → „Raport generat”.
 */
export function getLucrareDisplayStatus(lucrare: unknown): string {
  if (!lucrare || typeof lucrare !== "object") return "-"
  const l = lucrare as Record<string, unknown>
  if (isLucrareAnulata(lucrare)) return WORK_STATUS.CANCELED
  const status = String(l.statusLucrare || "")
  if (eqInsensitive(status, WORK_STATUS.COMPLETED)) return "Raport generat"
  return status || "-"
}

/** Clasă CSS pentru badge pe baza statusului afișat (inclusiv „Anulat”). */
export function getLucrareStatusClass(lucrare: unknown): string {
  return getWorkStatusClass(getLucrareDisplayStatus(lucrare))
}
