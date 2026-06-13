import test from "node:test"
import assert from "node:assert/strict"

import { technicianHasUnfinishedWorkToday, type RemainingWorkTicket } from "@/lib/attendance/remaining-work"
import { WORK_STATUS } from "@/lib/utils/constants"

/**
 * Smoke test — reproduce exact reclamația clientului:
 * „după prima lucrare când am închis-o, mă depontează”.
 *
 * Tehnicianul are 3 lucrări azi. Închide prima (devine Finalizat), restul rămân Atribuite.
 * Înainte de fix: gate-ul verifica doar „În lucru” => 0 găsite => depontare prematură.
 * După fix: mai are lucrări Atribuite AZI => depontarea trebuie BLOCATĂ.
 */
test("smoke: după primul raport semnat, cu 2 lucrări rămase azi => depontare BLOCATĂ", () => {
  const now = new Date(2026, 5, 13, 11, 0, 0).getTime()
  const t = (h: number) => new Date(2026, 5, 13, h, 0, 0).getTime()

  const tickets: RemainingWorkTicket[] = [
    { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: t(10) }, // tocmai semnată
    { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: t(13) },
    { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: t(16) },
  ]

  assert.equal(technicianHasUnfinishedWorkToday(tickets, now), true)
})

test("smoke: la ultima lucrare a zilei (toate finalizate) => depontare PERMISĂ", () => {
  const now = new Date(2026, 5, 13, 17, 0, 0).getTime()
  const t = (h: number) => new Date(2026, 5, 13, h, 0, 0).getTime()

  const tickets: RemainingWorkTicket[] = [
    { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: t(10) },
    { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: t(13) },
    { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: t(16) },
  ]

  assert.equal(technicianHasUnfinishedWorkToday(tickets, now), false)
})
