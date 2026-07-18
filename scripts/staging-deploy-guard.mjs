import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const BUILTIN_PRODUCTION_PROJECTS = ["field-operational-manager"]
const BUILTIN_PRODUCTION_HOSTS = ["fom-nrg.vercel.app"]
const ALIASES_AND_PLACEHOLDERS = new Set([
  "default",
  "production",
  "prod",
  "staging",
  "stage",
  "your-project-id",
  "staging-project-id",
  "replace-me",
  "todo",
])

function list(value) {
  return String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean)
}

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0
}

export function validateStagingConfiguration(env, repository = {}) {
  const errors = []
  const projectId = String(env.FIREBASE_DEPLOY_PROJECT_ID || "").trim()
  const allowlist = list(env.STAGING_FIREBASE_PROJECT_ALLOWLIST)
  const productionProjects = new Set([...BUILTIN_PRODUCTION_PROJECTS, ...list(env.PRODUCTION_FIREBASE_PROJECT_DENYLIST)])
  const productionHosts = new Set([...BUILTIN_PRODUCTION_HOSTS, ...list(env.PRODUCTION_APP_HOST_DENYLIST)])

  if (!projectId) errors.push("FIREBASE_DEPLOY_PROJECT_ID must be explicit")
  if (ALIASES_AND_PLACEHOLDERS.has(projectId.toLowerCase())) errors.push("Firebase aliases and placeholders are forbidden")
  if (productionProjects.has(projectId)) errors.push("Production Firebase project is forbidden")
  if (!allowlist.includes(projectId)) errors.push("Firebase project is not in the explicit staging allowlist")
  if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId) errors.push("Public Firebase project must match the deploy target")
  if (env.APP_DEPLOYMENT_ENV !== "staging" || env.NEXT_PUBLIC_APP_ENV !== "staging" || env.STAGING_MARKER !== "true") {
    errors.push("Staging environment markers are incomplete")
  }
  if (env.VERCEL_ENV !== "preview") errors.push("Vercel environment must be preview")

  const authDomain = String(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "").trim().toLowerCase()
  if (!authDomain || !authDomain.includes(projectId.toLowerCase()) || !authDomain.endsWith(".firebaseapp.com")) {
    errors.push("Auth domain does not match the staging project")
  }
  const bucket = String(env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim().toLowerCase()
  if (!bucket || !bucket.includes(projectId.toLowerCase()) || !/\.(?:appspot\.com|firebasestorage\.app)$/.test(bucket)) {
    errors.push("Storage bucket does not match the staging project")
  }
  const functionsRegion = String(env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "").trim()
  const functionsBase = String(env.NEXT_PUBLIC_FUNCTIONS_BASE_URL || "").trim().toLowerCase()
  if (!functionsRegion || !functionsBase || !functionsBase.startsWith("https://") || !functionsBase.includes(projectId.toLowerCase()) || !functionsBase.includes(functionsRegion.toLowerCase())) {
    errors.push("Functions target does not match project and region")
  }

  let appHost = ""
  try {
    const appUrl = new URL(String(env.NEXT_PUBLIC_APP_URL || ""))
    appHost = appUrl.hostname.toLowerCase()
    if (appUrl.protocol !== "https:") errors.push("Staging app URL must use HTTPS")
  } catch {
    errors.push("Staging app URL is invalid")
  }
  if (productionHosts.has(appHost)) errors.push("Production app URL is forbidden")

  const mailMode = String(env.MAIL_TRANSPORT_MODE || "").trim()
  if (mailMode !== "disabled" && mailMode !== "sink") errors.push("Staging mail transport must be disabled or sink")
  if (mailMode === "sink" && list(env.MAIL_SINK_ALLOWED_DOMAINS).length === 0) errors.push("Mail sink requires an explicit domain allowlist")
  if (["EMAIL_SMTP_HOST", "EMAIL_SMTP_PORT", "EMAIL_USER", "EMAIL_PASSWORD", "SMTP_HOST", "SMTP_USER", "SMTP_PASS"].some((key) => nonempty(env[key]))) {
    errors.push("SMTP production-style configuration is forbidden in staging")
  }
  if (env.REVERSE_GEOCODE_MODE !== "disabled") errors.push("Reverse geocoding must remain disabled before staging approval")
  if (env.NEXT_PUBLIC_E2E_ENABLED !== "false") errors.push("Browser E2E controls must remain disabled")
  if (!nonempty(env.NEXT_PUBLIC_FIREBASE_API_KEY) || !nonempty(env.NEXT_PUBLIC_FIREBASE_APP_ID)) {
    errors.push("Public Firebase staging configuration is incomplete")
  }

  const approvedCommit = String(env.STAGING_APPROVED_COMMIT || "").trim()
  if (!approvedCommit || repository.commit !== approvedCommit) errors.push("Current commit is not the approved staging commit")
  if (env.STAGING_REQUIRE_CLEAN_WORKTREE !== "true" || repository.clean !== true) errors.push("A clean worktree is required")

  return { ok: errors.length === 0, errors, projectId, appHost, functionsRegion, mailMode }
}

function repositoryState() {
  return {
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    clean: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() === "",
  }
}

export function runStagingDeployGuard(env = process.env) {
  const result = validateStagingConfiguration(env, repositoryState())
  const summary = {
    ok: result.ok,
    projectId: result.projectId || "<missing>",
    appHost: result.appHost || "<missing>",
    functionsRegion: result.functionsRegion || "<missing>",
    mailMode: result.mailMode || "<missing>",
    errors: result.errors,
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStagingDeployGuard()
}
