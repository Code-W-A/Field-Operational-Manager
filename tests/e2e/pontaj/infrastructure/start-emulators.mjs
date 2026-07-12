import { mkdirSync } from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"

const repositoryRoot = process.cwd()
const emulatorWorkDir = "/private/tmp/fom-pontaj-stage5-emulators"
mkdirSync(emulatorWorkDir, { recursive: true })

const functionsBuild = spawnSync("npm", ["--prefix", path.join(repositoryRoot, "firebase-functions"), "run", "build"], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: "inherit",
})
if (functionsBuild.status !== 0) process.exit(functionsBuild.status ?? 1)

const child = spawn(
  "firebase",
  [
    "emulators:start",
    "--config",
    path.join(repositoryRoot, "firebase.json"),
    "--project",
    "demo-fom-pontaj-e2e",
    "--only",
    "auth,firestore,functions,storage,pubsub",
  ],
  { cwd: emulatorWorkDir, env: process.env, stdio: "inherit", detached: true },
)

let shuttingDown = false
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    try {
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
    setTimeout(() => process.exit(0), 2_000).unref()
  })
}

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0))
})
