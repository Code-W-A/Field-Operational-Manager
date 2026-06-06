import fs from "node:fs"
import path from "node:path"

const authFile = path.join(__dirname, ".auth", "admin.json")

/** E2E folosește auto-auth admin în MockDataContext; nu e nevoie de login UI. */
async function globalSetup() {
  fs.mkdirSync(path.dirname(authFile), { recursive: true })
  fs.writeFileSync(
    authFile,
    JSON.stringify({ cookies: [], origins: [] }),
    "utf8",
  )
}

export default globalSetup
