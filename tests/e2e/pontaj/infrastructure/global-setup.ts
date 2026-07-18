import fs from "node:fs"
import path from "node:path"

import { emulatorHealthCheck } from "../../fixtures/firebase-admin"
import { cleanupPontajRun } from "../../fixtures/cleanup"
import { RUN_ID, seedMinimalPontajFixture } from "../../fixtures/pontaj-minimal"
import { resetRunManifest } from "../../fixtures/run-manifest"

export default async function globalSetup() {
  await emulatorHealthCheck()
  await cleanupPontajRun()
  await seedMinimalPontajFixture({ auth: true })
  resetRunManifest()

  const resultDir = path.resolve("test-results")
  fs.mkdirSync(resultDir, { recursive: true })
  fs.writeFileSync(path.join(resultDir, "pontaj-stage5-run.json"), JSON.stringify({ runId: RUN_ID }, null, 2))
}
