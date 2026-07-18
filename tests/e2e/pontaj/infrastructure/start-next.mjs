import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env: process.env, stdio: "inherit" })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} oprit cu ${signal}`))
      else if (code === 0) resolve()
      else reject(new Error(`${command} a ieșit cu codul ${code ?? 1}`))
    })
  })
}

const mayReuseBuild = process.env.PONTAJ_REUSE_NEXT_BUILD === "true"
if (!mayReuseBuild || !existsSync(path.resolve(".next/BUILD_ID"))) {
  await run("npm", ["run", "build"])
}

const server = spawn("npm", ["run", "start", "--", "--hostname", "127.0.0.1", "--port", "3100"], {
  env: process.env,
  stdio: "inherit",
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal))
}

server.on("error", (error) => {
  throw error
})
server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
