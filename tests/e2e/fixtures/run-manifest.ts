import fs from "node:fs"
import path from "node:path"

import { RUN_ID } from "./pontaj-minimal"

const manifestPath = path.resolve("test-results/pontaj-stage6-manifest.json")

export function resetRunManifest() {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify({ runId: RUN_ID, resources: [] }, null, 2))
}

export function recordRunResource(resource: { collection: string; id: string; vectorId?: string }) {
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { runId: RUN_ID, resources: [] }
  manifest.resources.push(resource)
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}
