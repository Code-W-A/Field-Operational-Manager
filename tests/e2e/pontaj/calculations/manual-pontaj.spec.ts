import { test } from "@playwright/test"
import { PONTAJ_VECTORS } from "../../data/pontaj-vectors"
import { executeVector } from "./vector-runner"

for (const vector of PONTAJ_VECTORS.filter(({ id }) => Number(id.slice(1)) >= 37 && Number(id.slice(1)) <= 47)) {
  test(`CAL-${vector.id} ${vector.description}`, async () => executeVector(vector))
}
