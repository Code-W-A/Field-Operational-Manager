import { test } from "@playwright/test"
import { PONTAJ_VECTORS } from "../../data/pontaj-vectors"
import { executeVector } from "./vector-runner"

for (const vector of PONTAJ_VECTORS.filter(({ id }) => [21, 22, 23, 24, 25, 26, 27, 35, 36, 85].includes(Number(id.slice(1))))) {
  test(`CAL-${vector.id} ${vector.description}`, async () => executeVector(vector))
}
