import fs from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { TEST_ONLY_CHECKOUT_ADAPTER_MARKER } from "./checkout-fault-adapters"

function listBuildFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name)
    return entry.isDirectory() ? listBuildFiles(fullPath) : [fullPath]
  })
}

test("adaptoarele STO-013/STO-015/STO-018 nu sunt accesibile în buildul production-like", async () => {
  const buildFiles = [
    ...listBuildFiles(path.resolve(".next/static")),
    ...listBuildFiles(path.resolve(".next/server/app")),
  ].filter((file) => /\.(?:js|json|map)$/.test(file))

  expect(buildFiles.length).toBeGreaterThan(0)
  for (const file of buildFiles) {
    const content = fs.readFileSync(file, "utf8")
    expect(content).not.toContain(TEST_ONLY_CHECKOUT_ADAPTER_MARKER)
    expect(content).not.toContain("checkout-fault-adapters")
    expect(content).not.toContain("Injected hrTimesheets write failure")
    expect(content).not.toContain("Injected audit log failure")
  }
})
