import fs from "node:fs"
import path from "node:path"

import { cleanupPontajRun, inspectRemainingRunResources } from "../../fixtures/cleanup"

export default async function globalTeardown() {
  await cleanupPontajRun()
  await cleanupPontajRun()
  const remaining = await inspectRemainingRunResources()
  const resultFile = path.resolve("test-results/pontaj-stage5-cleanup.json")
  fs.mkdirSync(path.dirname(resultFile), { recursive: true })
  fs.writeFileSync(resultFile, JSON.stringify({ remaining }, null, 2))
  if (Object.keys(remaining).length) throw new Error(`Pontaj cleanup left resources: ${JSON.stringify(remaining)}`)
}
