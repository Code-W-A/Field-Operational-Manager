import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(process.cwd(), "app/dashboard/lucrari/[id]/page.tsx"), "utf8")

test("linkul către lucrarea inițială e Link real (același tab / open in new tab)", () => {
  const labelStart = source.indexOf("Vezi lucrarea inițială")
  assert.ok(labelStart >= 0, "Nu a fost găsit textul „Vezi lucrarea inițială”")

  const buttonStart = source.lastIndexOf("<Button", labelStart)
  const buttonEnd = source.indexOf("</Button>", labelStart)
  const buttonBlock =
    buttonStart >= 0 && buttonEnd >= 0
      ? source.slice(buttonStart, buttonEnd + "</Button>".length)
      : undefined

  assert.ok(buttonBlock, "Nu a fost găsit butonul linkului către lucrarea inițială")
  assert.match(buttonBlock, /asChild/)
  assert.match(buttonBlock, /<Link href=\{relatedTicketUrl\(String\(lucrare\.lucrareOriginala\)\)\}>/)
  assert.doesNotMatch(buttonBlock, /target="_blank"/)
  assert.match(buttonBlock, /Vezi lucrarea inițială/)
})
