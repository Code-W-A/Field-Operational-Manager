import test from "node:test"
import assert from "node:assert/strict"

import { selectLatestEquipmentStatusWinners } from "@/lib/utils/dashboard-equipment-status"

test("smoke: equipment status bucket reflects latest ticket by createdAt, deduplicates, and respects toggles", () => {
  const works = [
    {
      id: "w1-old",
      clientId: "c1",
      locationId: "l1",
      echipamentId: "e1",
      locatie: "Hala 1",
      echipament: "Chiller 1",
      statusEchipament: "Nefuncțional",
      createdAt: "2026-05-01T08:00:00.000Z",
      updatedAt: "2026-05-01T09:00:00.000Z",
    },
    {
      id: "w1-new",
      clientId: "c1",
      locationId: "l1",
      echipamentId: "e1",
      locatie: "Hala 1",
      echipament: "Chiller 1",
      statusEchipament: "Funcțional",
      createdAt: "2026-05-02T08:00:00.000Z",
      updatedAt: "2026-05-02T09:00:00.000Z",
    },
    {
      id: "w2",
      clientId: "c1",
      locationId: "l1",
      echipamentId: "e2",
      locatie: "Hala 1",
      echipament: "Ventilator 2",
      statusEchipament: "Parțial funcțional",
      createdAt: "2026-05-02T10:00:00.000Z",
      updatedAt: "2026-05-02T11:00:00.000Z",
    },
    {
      id: "w3",
      clientId: "c2",
      locationId: "l2",
      echipamentId: "e3",
      locatie: "Hala 2",
      echipament: "Pompa 3",
      statusEchipament: "Nefuncțional",
      createdAt: "2026-05-02T12:00:00.000Z",
      updatedAt: "2026-05-02T13:00:00.000Z",
    },
  ]

  const allEnabled = selectLatestEquipmentStatusWinners(works, {
    equipmentStatusEnabled: true,
    equipmentStatusIncludeNonFunctional: true,
    equipmentStatusIncludePartiallyFunctional: true,
  })
  assert.deepEqual(
    allEnabled.map((x) => ({ id: x.work.id, status: x.status })),
    [
      { id: "w2", status: "Parțial funcțional" },
      { id: "w3", status: "Nefuncțional" },
    ],
  )

  const noPartial = selectLatestEquipmentStatusWinners(works, {
    equipmentStatusEnabled: true,
    equipmentStatusIncludeNonFunctional: true,
    equipmentStatusIncludePartiallyFunctional: false,
  })
  assert.deepEqual(noPartial.map((x) => x.work.id), ["w3"])

  const disabled = selectLatestEquipmentStatusWinners(works, {
    equipmentStatusEnabled: false,
    equipmentStatusIncludeNonFunctional: true,
    equipmentStatusIncludePartiallyFunctional: true,
  })
  assert.deepEqual(disabled, [])
})
