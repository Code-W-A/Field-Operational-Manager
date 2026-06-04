/**
 * Regresii critice pentru Stare echipament pe dashboard.
 * Suitea completă: lib/utils/dashboard-equipment-status.test.ts
 */
import test from "node:test"
import assert from "node:assert/strict"

import { selectLatestEquipmentStatusWinners } from "@/lib/utils/dashboard-equipment-status"

const baseCfg = {
  equipmentStatusEnabled: true,
  equipmentStatusIncludeNonFunctional: true,
  equipmentStatusIncludePartiallyFunctional: true,
} as const

test("regression: updatedAt trap — older bad ticket with fresh updatedAt cannot block newer Functional", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      {
        id: "w-old-bad",
        clientId: "c1",
        locationId: "l1",
        echipamentId: "e1",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
        updatedAt: "2026-05-20T12:00:00.000Z",
      },
      {
        id: "w-new-good",
        clientId: "c1",
        locationId: "l1",
        echipamentId: "e1",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-05T08:00:00.000Z",
        updatedAt: "2026-05-05T09:00:00.000Z",
      },
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})

test("regression: archived Functional counts when merged like useDashboardStatus", () => {
  const activeLucrari = [
    {
      id: "w-active",
      clientId: "c1",
      locationId: "l1",
      echipamentId: "e1",
      statusEchipament: "Nefuncțional",
      createdAt: "2026-05-01T08:00:00.000Z",
    },
  ]
  const lucrariArhivate = [
    {
      id: "w-archived",
      clientId: "c1",
      locationId: "l1",
      echipamentId: "e1",
      statusLucrare: "Arhivată",
      statusEchipament: "Funcțional",
      createdAt: "2026-05-08T08:00:00.000Z",
    },
  ]

  const winners = selectLatestEquipmentStatusWinners([...activeLucrari, ...lucrariArhivate], baseCfg)
  assert.deepEqual(winners, [])
})
