import { WORK_STATUS } from "@/lib/utils/constants"
import { localDayBounds } from "@/lib/attendance/auto-pontaj-schedule"

/**
 * Statusuri care indică o lucrare încă neterminată — prezența uneia AZI trebuie
 * să blocheze depontarea automată la raport semnat (depontăm doar la ultima lucrare a zilei).
 */
export const BLOCKING_WORK_STATUSES: ReadonlySet<string> = new Set<string>([
  WORK_STATUS.LISTED, // "Listată"
  WORK_STATUS.ASSIGNED, // "Atribuită"
  WORK_STATUS.IN_PROGRESS, // "În lucru"
  WORK_STATUS.WAITING, // "În așteptare"
  WORK_STATUS.POSTPONED, // "Amânată"
])

export type RemainingWorkTicket = {
  statusLucrare: string
  /** Momentul intervenției (ms) sau null dacă lipsește/neparsabil. */
  interventionMs: number | null
}

function normalizeStatus(value: string | undefined | null): string {
  return String(value ?? "").trim()
}

/**
 * Pur (fără Firestore): true dacă tehnicianul mai are cel puțin o lucrare neterminată
 * programată în ziua locală a lui `nowMs`. Lucrările cu status terminal
 * (Finalizat/Arhivată/Anulat/Fără semnătură) sau din alte zile nu blochează.
 */
export function technicianHasUnfinishedWorkToday(
  tickets: RemainingWorkTicket[],
  nowMs: number = Date.now(),
): boolean {
  if (!Array.isArray(tickets) || tickets.length === 0) return false

  const { startMs, endMs } = localDayBounds(nowMs)

  return tickets.some((ticket) => {
    if (!BLOCKING_WORK_STATUSES.has(normalizeStatus(ticket.statusLucrare))) return false
    const ms = ticket.interventionMs
    if (typeof ms !== "number" || !Number.isFinite(ms)) return false
    return ms >= startMs && ms <= endMs
  })
}
