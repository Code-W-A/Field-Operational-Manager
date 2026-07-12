import { test } from "@playwright/test"
import { PONTAJ_VECTORS } from "../../data/pontaj-vectors"
import { executeVector } from "./vector-runner"

for (const vector of PONTAJ_VECTORS.filter(({ id }) => Number(id.slice(1)) >= 73 && Number(id.slice(1)) <= 84)) {
  test(`CAL-${vector.id} ${vector.description}`, async () => executeVector(vector))
}
