import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

test("Nu se facturează: Contract abonament remains selectable and is saved as reason", () => {
  const dialog = read("components/no-invoice-reason-dialog.tsx")
  const upload = read("components/document-upload.tsx")

  assert.match(dialog, /value:\s*"contract-abonament",\s*label:\s*"Contract abonament"/)
  assert.doesNotMatch(upload, /Motivul „Contract abonament” este permis doar/)
  assert.doesNotMatch(
    upload,
    /reason\s*===\s*"Contract abonament"[\s\S]*lucrare\?\.tipLucrare\s*!==\s*"Intervenție în contract"/,
  )
  assert.match(upload, /statusFacturare:\s*"Nu se facturează"/)
  assert.match(upload, /motivNefacturare:\s*reason/)
})
