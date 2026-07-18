import { pathToFileURL } from "node:url"

export const CURRENT_FIREBASE_PROJECT_ID = "field-operational-manager"

export function parseExplicitProjectArgument(argv) {
  const index = argv.indexOf("--project")
  if (index === -1 || !argv[index + 1] || argv[index + 1].startsWith("-")) return ""
  return String(argv[index + 1]).trim()
}

export function validateCurrentProjectDeploy({ projectId, allow }) {
  const errors = []
  if (!projectId) errors.push("An explicit --project value is required")
  if (["default", "production", "prod"].includes(String(projectId).toLowerCase())) {
    errors.push("Firebase aliases are forbidden")
  }
  if (projectId && projectId !== CURRENT_FIREBASE_PROJECT_ID) {
    errors.push("Only the owner-authorized current Firebase project is accepted")
  }
  if (allow !== "true") errors.push("ALLOW_CURRENT_FIREBASE_PROJECT_DEPLOY=true is required")
  return { ok: errors.length === 0, projectId, errors }
}

export function runCurrentProjectDeployGuard(argv = process.argv.slice(2), env = process.env) {
  const result = validateCurrentProjectDeploy({
    projectId: parseExplicitProjectArgument(argv),
    allow: env.ALLOW_CURRENT_FIREBASE_PROJECT_DEPLOY,
  })
  process.stdout.write(`${JSON.stringify({
    ok: result.ok,
    projectId: result.projectId || "<missing>",
    errors: result.errors,
  }, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCurrentProjectDeployGuard()
}
