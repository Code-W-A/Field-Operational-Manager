import { test } from "@playwright/test"
import { PONTAJ_VECTORS } from "../../data/pontaj-vectors"
import { executeVector } from "./vector-runner"

for (const vector of PONTAJ_VECTORS.filter(({ id }) => [28, 29, 30, 31, 32, 33, 34].includes(Number(id.slice(1))))) {
  test(`CAL-${vector.id} ${vector.description}`, async () => executeVector(vector))
}
