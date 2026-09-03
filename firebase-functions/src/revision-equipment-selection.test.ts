import assert from "node:assert/strict"
import test from "node:test"

import { selectRevisionEquipmentIdsForLocation } from "./revision-equipment-selection"

const locationEquipments = [
  { id: "eq-bariera", cod: "MR-R89-ENR" },
  { id: "eq-usa", cod: "MR-R89-US1" },
]

test("regresie contract mentenanță: revizia conține doar echipamentul bifat", () => {
  const result = selectRevisionEquipmentIdsForLocation({
    contractEquipmentIds: ["eq-bariera"],
    locationEquipments,
  })

  assert.deepEqual(result, ["eq-bariera"])
  assert.equal(result.includes("eq-usa"), false, "echipamentul debifat nu trebuie emis în revizie")
})

test("regresie contract mentenanță: locația fără echipamente bifate este omisă", () => {
  const result = selectRevisionEquipmentIdsForLocation({
    contractEquipmentIds: ["eq-din-alta-locatie"],
    locationEquipments,
  })

  assert.deepEqual(result, [], "generatorul va sări peste locație când intersecția este goală")
})

test("selecția legacy după cod rămâne compatibilă", () => {
  const result = selectRevisionEquipmentIdsForLocation({
    contractEquipmentIds: ["MR-R89-ENR"],
    locationEquipments,
  })

  assert.deepEqual(result, ["MR-R89-ENR"])
})

test("contractele legacy fără equipmentIds păstrează fallback-ul la locație", () => {
  const result = selectRevisionEquipmentIdsForLocation({
    contractEquipmentIds: undefined,
    locationEquipments,
  })

  assert.deepEqual(result, ["eq-bariera", "eq-usa"])
})
