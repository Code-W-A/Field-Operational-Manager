import assert from "node:assert/strict"
import test from "node:test"

import { validateHrRequestCreateInput, validateHrRequestPayload, validateMedicalDocumentFile } from "./request-validation"

test("rejects reversed and impossible date ranges", () => {
  assert.match(String(validateHrRequestPayload("CO", { kind: "CO", startDate: "2026-07-10", endDate: "2026-07-09" })), /început/i)
  assert.match(String(validateHrRequestPayload("CO", { kind: "CO", startDate: "2026-02-30", endDate: "2026-03-01" })), /valide/i)
})

test("requires a positive same-day IN interval", () => {
  assert.match(String(validateHrRequestPayload("IN", { kind: "IN", date: "2026-07-08", startTime: "12:00", endTime: "12:00" })), /sfârșit/i)
  assert.equal(validateHrRequestPayload("IN", { kind: "IN", date: "2026-07-08", startTime: "12:00", endTime: "13:00" }), null)
})

test("requires routing and a CM document before persistence", () => {
  assert.match(String(validateHrRequestCreateInput({ employeeId: "emp", requesterUid: "tech", sectorId: "dep", managerUid: "", kind: "CO", payload: { kind: "CO", startDate: "2026-07-08", endDate: "2026-07-08" } })), /șef/i)
  assert.match(String(validateHrRequestPayload("CM", { kind: "CM", startDate: "2026-07-08", endDate: "2026-07-08" })), /document/i)
})

test("accepts only non-empty PDF or image CM documents", () => {
  assert.equal(validateMedicalDocumentFile({ name: "aviz medical.pdf", type: "application/pdf", size: 1 }), null)
  assert.equal(validateMedicalDocumentFile({ name: "aviz.png", type: "image/png", size: 1 }), null)
  assert.match(String(validateMedicalDocumentFile({ name: "aviz.exe", type: "application/octet-stream", size: 1 })), /imagine sau un fișier PDF/i)
  assert.match(String(validateMedicalDocumentFile({ name: "aviz.pdf", type: "application/pdf", size: 0 })), /nu poate fi gol/i)
})
