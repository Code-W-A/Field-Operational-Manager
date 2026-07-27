import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  isKioskPinEligibleRole,
  isValidKioskPin,
  normalizeKioskPinInput,
  normalizeStoredKioskPin,
  resolveKioskPinForSave,
} from "./kiosk-pin"

describe("isValidKioskPin", () => {
  it("accepts exactly 4 digits including leading zeros", () => {
    assert.equal(isValidKioskPin("1234"), true)
    assert.equal(isValidKioskPin("0000"), true)
    assert.equal(isValidKioskPin("0400"), true)
  })

  it("rejects non-4-digit values", () => {
    assert.equal(isValidKioskPin(""), false)
    assert.equal(isValidKioskPin("123"), false)
    assert.equal(isValidKioskPin("12345"), false)
    assert.equal(isValidKioskPin("12a4"), false)
    assert.equal(isValidKioskPin("12 4"), false)
    assert.equal(isValidKioskPin(1234), false)
    assert.equal(isValidKioskPin(400), false)
    assert.equal(isValidKioskPin(null), false)
  })
})

describe("normalizeKioskPinInput", () => {
  it("keeps only digits and truncates to 4", () => {
    assert.equal(normalizeKioskPinInput("12a34b5"), "1234")
    assert.equal(normalizeKioskPinInput(" 9 "), "9")
    assert.equal(normalizeKioskPinInput("0400"), "0400")
  })
})

describe("normalizeStoredKioskPin", () => {
  it("preserves 4-digit strings with leading zeros", () => {
    assert.equal(normalizeStoredKioskPin("0400"), "0400")
    assert.equal(normalizeStoredKioskPin("0000"), "0000")
    assert.equal(normalizeStoredKioskPin("1234"), "1234")
  })

  it("recovers leading zeros lost by number coercion", () => {
    assert.equal(normalizeStoredKioskPin(400), "0400")
    assert.equal(normalizeStoredKioskPin(0), "0000")
    assert.equal(normalizeStoredKioskPin(1), "0001")
    assert.equal(normalizeStoredKioskPin(1234), "1234")
  })

  it("pads short digit strings left from coerced storage", () => {
    assert.equal(normalizeStoredKioskPin("400"), "0400")
    assert.equal(normalizeStoredKioskPin("4"), "0004")
  })

  it("returns null for empty or invalid values", () => {
    assert.equal(normalizeStoredKioskPin(null), null)
    assert.equal(normalizeStoredKioskPin(undefined), null)
    assert.equal(normalizeStoredKioskPin(""), null)
    assert.equal(normalizeStoredKioskPin("12a4"), null)
    assert.equal(normalizeStoredKioskPin(12.5), null)
    assert.equal(normalizeStoredKioskPin(10000), null)
  })
})

describe("resolveKioskPinForSave", () => {
  it("stores valid pin for eligible roles and keeps leading zeros", () => {
    assert.equal(resolveKioskPinForSave({ role: "tehnician", kioskPin: "4321" }), "4321")
    assert.equal(resolveKioskPinForSave({ role: "admin", kioskPin: "0001" }), "0001")
    assert.equal(resolveKioskPinForSave({ role: "admin", kioskPin: "0400" }), "0400")
  })

  it("clears pin for ineligible roles or empty input", () => {
    assert.equal(resolveKioskPinForSave({ role: "client", kioskPin: "1234" }), null)
    assert.equal(resolveKioskPinForSave({ role: "tehnician", kioskPin: "" }), null)
    assert.equal(resolveKioskPinForSave({ role: "kiosk", kioskPin: "9999" }), null)
  })

  it("throws on invalid non-empty pin for eligible roles", () => {
    assert.throws(() => resolveKioskPinForSave({ role: "dispecer", kioskPin: "12" }), /4 cifre/)
    assert.throws(() => resolveKioskPinForSave({ role: "dispecer", kioskPin: "400" }), /4 cifre/)
  })
})

describe("isKioskPinEligibleRole", () => {
  it("matches kiosk roster roles", () => {
    assert.equal(isKioskPinEligibleRole("tehnician"), true)
    assert.equal(isKioskPinEligibleRole("client"), false)
  })
})
