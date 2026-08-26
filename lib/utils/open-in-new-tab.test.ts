import test from "node:test"
import assert from "node:assert/strict"

import { isPrimaryUnmodifiedClick, preventMiddleClickAutoscroll } from "@/lib/utils/open-in-new-tab"

test("click stânga nemodificat e primary", () => {
  assert.equal(isPrimaryUnmodifiedClick({ button: 0, metaKey: false, ctrlKey: false }), true)
})

test("Ctrl/Cmd+click și click pe rotită nu sunt primary", () => {
  assert.equal(isPrimaryUnmodifiedClick({ button: 0, metaKey: true, ctrlKey: false }), false)
  assert.equal(isPrimaryUnmodifiedClick({ button: 0, metaKey: false, ctrlKey: true }), false)
  assert.equal(isPrimaryUnmodifiedClick({ button: 1, metaKey: false, ctrlKey: false }), false)
})

test("mousedown pe rotită e anulat ca să nu pornească autoscroll", () => {
  let prevented = false
  preventMiddleClickAutoscroll(
    { button: 1, preventDefault: () => { prevented = true } },
    true,
  )
  assert.equal(prevented, true)
})

test("mousedown pe rotită nu e anulat dacă rândul nu are URL", () => {
  let prevented = false
  preventMiddleClickAutoscroll(
    { button: 1, preventDefault: () => { prevented = true } },
    false,
  )
  assert.equal(prevented, false)
})
