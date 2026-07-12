import { spawn } from "node:child_process"

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

await run("npm", ["run", "build"])

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
