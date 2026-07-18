import { mkdirSync } from "node:fs"
import path from "node:path"
import { spawn, spawnSync } from "node:child_process"
import http from "node:http"

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
  // An isolated process group lets teardown signal Firebase and every emulator child together.
  { cwd: emulatorWorkDir, env: process.env, stdio: ["inherit", "pipe", "pipe"], detached: true },
)

let readinessServer
let outputBuffer = ""
const descendantPids = new Set()

const rememberDescendants = (parentPid) => {
  const result = spawnSync("pgrep", ["-P", String(parentPid)], { encoding: "utf8" })
  for (const value of result.stdout?.trim().split(/\s+/) ?? []) {
    const pid = Number(value)
    if (!Number.isInteger(pid) || pid <= 0 || descendantPids.has(pid)) continue
    descendantPids.add(pid)
    rememberDescendants(pid)
  }
}

const signalDescendants = (signal) => {
  rememberDescendants(child.pid)
  for (const pid of descendantPids) {
    try {
      process.kill(pid, signal)
    } catch {
      // A descendant that already exited needs no further cleanup.
    }
  }
}

const forwardOutput = (stream, destination) => {
  stream.on("data", (chunk) => {
    destination.write(chunk)
    outputBuffer = `${outputBuffer}${chunk.toString()}`.slice(-16_384)
    if (!readinessServer && outputBuffer.includes("All emulators ready!")) {
      readinessServer = http
        .createServer((_request, response) => {
          response.writeHead(200, { "content-type": "text/plain" })
          response.end("ready\n")
        })
        .listen(4401, "127.0.0.1")
    }
  })
}

forwardOutput(child.stdout, process.stdout)
forwardOutput(child.stderr, process.stderr)

let shuttingDown = false
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) return
    shuttingDown = true
    readinessServer?.close()
    signalDescendants(signal)
    try {
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
    setTimeout(() => {
      signalDescendants("SIGKILL")
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {
        if (!child.killed) child.kill("SIGKILL")
      }
      process.exit(0)
    }, 8_000)
  })
}

child.on("exit", (code, signal) => {
  readinessServer?.close()
  process.exit(code ?? (signal ? 1 : 0))
})
