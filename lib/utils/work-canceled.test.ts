import test from "node:test"
import assert from "node:assert/strict"

import { WORK_STATUS } from "./constants"
import { getLucrareDisplayStatus, isLucrareAnulata } from "./work-canceled"

test("isLucrareAnulata detects legacy canceled status", () => {
  assert.equal(isLucrareAnulata({ statusLucrare: WORK_STATUS.CANCELED }), true)
})

test("isLucrareAnulata detects archived ticket with anulat flag", () => {
  assert.equal(
    isLucrareAnulata({
      statusLucrare: WORK_STATUS.ARCHIVED,
      anulat: true,
      motivAnulare: "Client a renunțat",
    }),
    true,
  )
})

test("isLucrareAnulata returns false for active ticket", () => {
  assert.equal(isLucrareAnulata({ statusLucrare: WORK_STATUS.LISTED }), false)
})

test("getLucrareDisplayStatus shows Anulat for canceled archived ticket", () => {
  assert.equal(
    getLucrareDisplayStatus({
      statusLucrare: WORK_STATUS.ARCHIVED,
      anulat: true,
    }),
    WORK_STATUS.CANCELED,
  )
})

test("getLucrareDisplayStatus maps Finalizat to Raport generat", () => {
  assert.equal(getLucrareDisplayStatus({ statusLucrare: WORK_STATUS.COMPLETED }), "Raport generat")
})
