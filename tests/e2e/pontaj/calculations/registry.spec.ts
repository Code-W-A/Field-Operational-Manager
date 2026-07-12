import { expect, test } from "@playwright/test"

import { PONTAJ_VECTORS, validatePontajVectorRegistry } from "../../data/pontaj-vectors"

test("registrul contine exact V01-V85, fara duplicate sau oracole lipsa", () => {
  expect(validatePontajVectorRegistry()).toBe(true)
  expect(PONTAJ_VECTORS.map((vector) => vector.id)).toEqual(
    Array.from({ length: 85 }, (_, index) => `V${String(index + 1).padStart(2, "0")}`),
  )
})
