import assert from "node:assert/strict"
import test from "node:test"
import { parseCrmOfferConditions } from "./offer-conditions"

test("reads legacy snapshot labels regardless of case and preserves other conditions", () => {
  assert.deepEqual(parseCrmOfferConditions([
    "  PLATA: 100% în avans ", "Livrare : 10 zile", "Instalare: nu este inclusă",
    "Transport inclus", "Plata: condiție suplimentară",
  ]), {
    payment: "100% în avans", delivery: "10 zile", installation: "nu este inclusă",
    additional: ["Transport inclus", "Plata: condiție suplimentară"],
  })
})

test("missing conditions stay empty and are never filled with sample terms", () => {
  for (const value of [undefined, [], ["Plata:", "Livrare: ", "Instalare: \n"]]) {
    assert.deepEqual(parseCrmOfferConditions(value), { payment: "", delivery: "", installation: "", additional: [] })
  }
  assert.deepEqual(parseCrmOfferConditions(["Plata: numerar"]), { payment: "numerar", delivery: "", installation: "", additional: [] })
})
