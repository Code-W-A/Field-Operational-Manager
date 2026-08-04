import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

test("ClientContractsManager: assignment validation excludes selected contract id", () => {
  const source = read("components/client-contracts-manager.tsx")
  assert.match(
    source,
    /validateContractAssignment\(selectedContract\.number,\s*clientId,\s*selectedContract\.id\)/,
  )
})

test("ClientContractsManager: assigned contract links to its details page", () => {
  const source = read("components/client-contracts-manager.tsx")
  assert.match(source, /href=\{`\/dashboard\/contracte\/\$\{contract\.id\}`\}/)
  assert.match(source, /aria-label=\{`Deschide contractul \$\{contract\.name\}, \$\{contract\.number\}`\}/)
})
