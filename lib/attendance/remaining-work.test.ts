import test from "node:test"
import assert from "node:assert/strict"

import {
  BLOCKING_WORK_STATUSES,
  technicianHasUnfinishedWorkToday,
  type RemainingWorkTicket,
} from "@/lib/attendance/remaining-work"
import { WORK_STATUS } from "@/lib/utils/constants"

const NOW = new Date(2026, 5, 13, 14, 0, 0).getTime() // 13 iunie 2026, 14:00 local
const todayAt = (h: number, m: number) => new Date(2026, 5, 13, h, m, 0, 0).getTime()
const yesterday = new Date(2026, 5, 12, 10, 0, 0).getTime()
const tomorrow = new Date(2026, 5, 14, 10, 0, 0).getTime()

test("listă goală => false (nu blochează)", () => {
  assert.equal(technicianHasUnfinishedWorkToday([], NOW), false)
})

test("tichet 'Atribuită' azi => true (reproduce bug-ul: nu trebuie depontat)", () => {
  const tickets: RemainingWorkTicket[] = [{ statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: todayAt(16, 0) }]
  assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), true)
})

test("toate statusurile blocante azi => true", () => {
  for (const status of BLOCKING_WORK_STATUSES) {
    const tickets: RemainingWorkTicket[] = [{ statusLucrare: status, interventionMs: todayAt(15, 0) }]
    assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), true, `status blocant: ${status}`)
  }
})

test("toate azi sunt terminale (Finalizat/Arhivată/Anulat/Fără semnătură) => false", () => {
  const tickets: RemainingWorkTicket[] = [
    { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: todayAt(9, 0) },
    { statusLucrare: WORK_STATUS.ARCHIVED, interventionMs: todayAt(10, 0) },
    { statusLucrare: WORK_STATUS.CANCELED, interventionMs: todayAt(11, 0) },
    { statusLucrare: WORK_STATUS.NO_SIGNATURE, interventionMs: todayAt(12, 0) },
  ]
  assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), false)
})

test("tichet neterminat dar pe altă zi (ieri/mâine) => false", () => {
  const tickets: RemainingWorkTicket[] = [
    { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: yesterday },
    { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: tomorrow },
  ]
  assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), false)
})

test("doar tichetul tocmai finalizat azi => false (permite depontarea)", () => {
  const tickets: RemainingWorkTicket[] = [{ statusLucrare: WORK_STATUS.COMPLETED, interventionMs: todayAt(13, 30) }]
  assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), false)
})

test("mix: 1 finalizat azi + 1 atribuit azi => true", () => {
  const tickets: RemainingWorkTicket[] = [
    { statusLucrare: WORK_STATUS.COMPLETED, interventionMs: todayAt(9, 0) },
    { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: todayAt(17, 0) },
  ]
  assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), true)
})

test("interventionMs lipsă/neparsabil => nu blochează", () => {
  const tickets: RemainingWorkTicket[] = [
    { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: null },
    { statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: Number.NaN },
  ]
  assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), false)
})

test("granița de zi: 23:59 azi blochează, 00:00 mâine nu", () => {
  const lastMinuteToday = new Date(2026, 5, 13, 23, 59, 0, 0).getTime()
  const firstMinuteTomorrow = new Date(2026, 5, 14, 0, 0, 0, 0).getTime()
  assert.equal(
    technicianHasUnfinishedWorkToday([{ statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: lastMinuteToday }], NOW),
    true,
  )
  assert.equal(
    technicianHasUnfinishedWorkToday([{ statusLucrare: WORK_STATUS.ASSIGNED, interventionMs: firstMinuteTomorrow }], NOW),
    false,
  )
})

test("status cu spații în jur este normalizat", () => {
  const tickets: RemainingWorkTicket[] = [{ statusLucrare: `  ${WORK_STATUS.IN_PROGRESS}  `, interventionMs: todayAt(15, 0) }]
  assert.equal(technicianHasUnfinishedWorkToday(tickets, NOW), true)
})
