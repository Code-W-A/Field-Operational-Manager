import { test } from "@playwright/test"
import { PONTAJ_VECTORS } from "../../data/pontaj-vectors"
import { executeVector, validateCalendarOracle } from "./vector-runner"

for (const vector of PONTAJ_VECTORS.filter(({ id }) => Number(id.slice(1)) >= 64 && Number(id.slice(1)) <= 72)) {
  test(`CAL-${vector.id} ${vector.description}`, async () => {
    validateCalendarOracle()
    await executeVector(vector)
  })
}
