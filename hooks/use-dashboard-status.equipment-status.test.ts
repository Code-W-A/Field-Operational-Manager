import test from "node:test"
import assert from "node:assert/strict"

import { selectLatestEquipmentStatusWinners } from "@/lib/utils/dashboard-equipment-status"

const baseCfg = {
  equipmentStatusEnabled: true,
  equipmentStatusIncludeNonFunctional: true,
  equipmentStatusIncludePartiallyFunctional: true,
} as const

test("unit: keeps one row per equipment using latest status timestamp (updatedAt > createdAt)", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      {
        id: "w-old",
        clientId: "c1",
        locationId: "l1",
        echipamentId: "e1",
        locatie: "Loc 1",
        echipament: "Compresor A",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
        updatedAt: "2026-05-01T09:00:00.000Z",
      },
      {
        id: "w-new",
        clientId: "c1",
        locationId: "l1",
        echipamentId: "e1",
        locatie: "Loc 1",
        echipament: "Compresor A",
        statusEchipament: "Parțial funcțional",
        createdAt: "2026-05-02T08:00:00.000Z",
        updatedAt: "2026-05-02T10:00:00.000Z",
      },
    ],
    baseCfg,
  )

  assert.equal(winners.length, 1)
  assert.equal(winners[0].work.id, "w-new")
  assert.equal(winners[0].status, "Parțial funcțional")
})

test("unit: excludes equipment when latest status becomes Functional", () => {
  const winners = selectLatestEquipmentStatusWinners(
    [
      {
        id: "w-nonfunctional",
        clientId: "c1",
        locationId: "l1",
        echipamentId: "e1",
        locatie: "Loc 1",
        echipament: "Pompa A",
        statusEchipament: "Nefuncțional",
        createdAt: "2026-05-01T08:00:00.000Z",
        updatedAt: "2026-05-01T09:00:00.000Z",
      },
      {
        id: "w-functional",
        clientId: "c1",
        locationId: "l1",
        echipamentId: "e1",
        locatie: "Loc 1",
        echipament: "Pompa A",
        statusEchipament: "Funcțional",
        createdAt: "2026-05-03T08:00:00.000Z",
        updatedAt: "2026-05-03T09:00:00.000Z",
      },
    ],
    baseCfg,
  )

  assert.deepEqual(winners, [])
})
