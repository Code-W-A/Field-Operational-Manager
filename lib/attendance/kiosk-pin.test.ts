import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isKioskPinEligibleRole,
  isValidKioskPin,
  normalizeKioskPinInput,
  resolveKioskPinForSave,
} from "./kiosk-pin"

describe("isValidKioskPin", () => {
  it("accepts exactly 4 digits", () => {
    assert.equal(isValidKioskPin("1234"), true)
    assert.equal(isValidKioskPin("0000"), true)
  })

  it("rejects non-4-digit values", () => {
    assert.equal(isValidKioskPin(""), false)
    assert.equal(isValidKioskPin("123"), false)
    assert.equal(isValidKioskPin("12345"), false)
    assert.equal(isValidKioskPin("12a4"), false)
    assert.equal(isValidKioskPin("12 4"), false)
    assert.equal(isValidKioskPin(1234), false)
    assert.equal(isValidKioskPin(null), false)
  })
})

describe("normalizeKioskPinInput", () => {
  it("keeps only digits and truncates to 4", () => {
    assert.equal(normalizeKioskPinInput("12a34b5"), "1234")
    assert.equal(normalizeKioskPinInput(" 9 "), "9")
  })
})

describe("resolveKioskPinForSave", () => {
  it("stores valid pin for eligible roles", () => {
    assert.equal(resolveKioskPinForSave({ role: "tehnician", kioskPin: "4321" }), "4321")
    assert.equal(resolveKioskPinForSave({ role: "admin", kioskPin: "0001" }), "0001")
  })

  it("clears pin for ineligible roles or empty input", () => {
    assert.equal(resolveKioskPinForSave({ role: "client", kioskPin: "1234" }), null)
    assert.equal(resolveKioskPinForSave({ role: "tehnician", kioskPin: "" }), null)
    assert.equal(resolveKioskPinForSave({ role: "kiosk", kioskPin: "9999" }), null)
  })

  it("throws on invalid non-empty pin for eligible roles", () => {
    assert.throws(() => resolveKioskPinForSave({ role: "dispecer", kioskPin: "12" }), /4 cifre/)
  })
})

describe("isKioskPinEligibleRole", () => {
  it("matches kiosk roster roles", () => {
    assert.equal(isKioskPinEligibleRole("tehnician"), true)
    assert.equal(isKioskPinEligibleRole("client"), false)
  })
})
