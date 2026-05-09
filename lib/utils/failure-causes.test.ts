import test from "node:test"
import assert from "node:assert/strict"

import {
  FALLBACK_FAILURE_CAUSES,
  failureCauseOptionsFromSettings,
  resolveFailureCauseLabel,
} from "./failure-causes"

test("failureCauseOptionsFromSettings falls back when settings are empty", () => {
  assert.deepEqual(failureCauseOptionsFromSettings([]), FALLBACK_FAILURE_CAUSES)
})

test("failureCauseOptionsFromSettings maps configured settings", () => {
  const result = failureCauseOptionsFromSettings([
    { id: "cause-1", name: "Defect senzor", value: "Defect senzor" },
    { id: "cause-2", name: "Reglaj", value: "Reglaj" },
  ] as any)

  assert.deepEqual(result, [
    { id: "cause-1", label: "Defect senzor" },
    { id: "cause-2", label: "Reglaj" },
  ])
})

test("resolveFailureCauseLabel uses configured label and falls back to saved legacy label", () => {
  const options = [{ id: "cause-1", label: "Defect senzor" }]

  assert.equal(resolveFailureCauseLabel(options, "cause-1"), "Defect senzor")
  assert.equal(resolveFailureCauseLabel(options, "legacy-id", "Cauză legacy"), "Cauză legacy")
})
