import fs from "node:fs"
import path from "node:path"

const projectId = "demo-fom-pontaj-e2e"
Object.assign(process.env, {
  E2E_PONTAJ_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
})

async function main() {
  const { cleanupPontajRun, inspectRemainingRunResources } = await import("../../fixtures/cleanup")
  await cleanupPontajRun()
  await cleanupPontajRun()
  const remaining = await inspectRemainingRunResources()
  fs.mkdirSync(path.resolve("test-results"), { recursive: true })
  fs.writeFileSync(path.resolve("test-results/pontaj-stage5-cleanup-manual.json"), JSON.stringify({ remaining }, null, 2))
  if (Object.keys(remaining).length) throw new Error(`Pontaj cleanup left resources: ${JSON.stringify(remaining)}`)
  console.log(JSON.stringify({ cleanupRuns: 2, remaining }))
}

void main()
