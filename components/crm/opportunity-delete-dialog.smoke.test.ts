import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

test("OpportunityDeleteAlertDialog exports a client component", async () => {
  const mod = await import("./opportunity-delete-dialog")
  assert.equal(typeof mod.OpportunityDeleteAlertDialog, "function")
})

test("CRM opportunity delete uses AlertDialog instead of window.confirm", () => {
  const listPage = readFileSync(path.join(root, "app/crm/opportunities/page.tsx"), "utf8")
  const detailLayout = readFileSync(path.join(root, "app/crm/opportunities/[id]/layout.tsx"), "utf8")
  assert.match(listPage, /OpportunityDeleteAlertDialog/)
  assert.match(detailLayout, /OpportunityDeleteAlertDialog/)
  assert.doesNotMatch(listPage, /window\.confirm/)
  assert.doesNotMatch(detailLayout, /window\.confirm/)
})