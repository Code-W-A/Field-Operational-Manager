import fs from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"

import { TEST_ONLY_CHECKOUT_ADAPTER_MARKER } from "./checkout-fault-adapters"
import { TEST_ONLY_CONDICA_ADAPTER_MARKER } from "../condica/condica-fault-adapter"

function listBuildFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name)
    return entry.isDirectory() ? listBuildFiles(fullPath) : [fullPath]
  })
}

test("adaptoarele STO și CON nu sunt accesibile în buildul production-like", async () => {
  const buildFiles = [
    ...listBuildFiles(path.resolve(".next/static")),
    ...listBuildFiles(path.resolve(".next/server/app")),
  ].filter((file) => /\.(?:js|json|map)$/.test(file))

  expect(buildFiles.length).toBeGreaterThan(0)
  expect(buildFiles.some((file) => file.includes(`${path.sep}server${path.sep}app${path.sep}e2e${path.sep}`))).toBe(false)
  expect(buildFiles.some((file) => file.includes(`${path.sep}server${path.sep}app${path.sep}api${path.sep}e2e${path.sep}`))).toBe(false)
  expect(buildFiles.some((file) => file.includes(`${path.sep}seed-hr-reminder-test${path.sep}`))).toBe(false)
  for (const file of buildFiles) {
    const content = fs.readFileSync(file, "utf8")
    expect(content).not.toContain(TEST_ONLY_CHECKOUT_ADAPTER_MARKER)
    expect(content).not.toContain(TEST_ONLY_CONDICA_ADAPTER_MARKER)
    expect(content).not.toContain("checkout-fault-adapters")
    expect(content).not.toContain("condica-fault-adapter")
    expect(content).not.toContain("Injected hrTimesheets write failure")
    expect(content).not.toContain("Injected audit log failure")
    expect(content).not.toContain("Injected Condica atomic commit failure")
    expect(content).not.toContain("E2E attendance fixture")
    expect(content).not.toContain("seed-hr-reminder-test")
  }
})
