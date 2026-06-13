import type { RemainingWorkTicket } from "@/lib/attendance/remaining-work"
import { WORK_STATUS } from "@/lib/utils/constants"

export type RemainingWorkScenario = {
  id: string
  label: string
  /** Momentul de referință (ms) pentru decizie. */
  nowMs: number
  tickets: RemainingWorkTicket[]
  /** true = depontarea automată trebuie BLOCATĂ (mai are lucrări azi). */
  expectedBlocked: boolean
}

/**
 * Scenarii deterministe pentru E2E, construite relativ la `nowMs` ca să fie stabile indiferent de data rulării.
 * Reproduc reclamația clientului și cazul corect (ultima lucrare a zilei).
 */
export function buildRemainingWorkScenarios(nowMs: number = Date.now()): RemainingWorkScenario[] {
  const base = new Date(nowMs)
  const todayAt = (h: number, m = 0) =>
    new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0).getTime()

  return [
    {
      id: "remaining-work",
      label: "Primul raport semnat, dar mai are 2 lucrări Atribuite azi",
      nowMs,
      tickets: [
        { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: todayAt(10) },
        { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: todayAt(13) },
        { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: todayAt(16) },
      ],
      expectedBlocked: true,
    },
    {
      id: "last-work",
      label: "Ultima lucrare a zilei (toate finalizate)",
      nowMs,
      tickets: [
        { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: todayAt(10) },
        { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: todayAt(13) },
        { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: todayAt(16) },
      ],
      expectedBlocked: false,
    },
  ]
}
