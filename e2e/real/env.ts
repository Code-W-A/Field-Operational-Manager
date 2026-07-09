export type E2ERole = "admin" | "tech" | "kiosk"

export const REAL_AUTH_DIR = "e2e/.auth"

export const STORAGE_STATE: Record<E2ERole, string> = {
  admin: `${REAL_AUTH_DIR}/real-admin.json`,
  tech: `${REAL_AUTH_DIR}/real-tech.json`,
  kiosk: `${REAL_AUTH_DIR}/real-kiosk.json`,
}

export const DEFAULT_BASE_URL = "https://fom-nrg.vercel.app"

export function getBaseUrl() {
  return process.env.E2E_BASE_URL || DEFAULT_BASE_URL
}

function readRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getCredentials(role: E2ERole) {
  if (role === "admin") {
    return {
      email: readRequiredEnv("E2E_ADMIN_EMAIL"),
      password: readRequiredEnv("E2E_ADMIN_PASSWORD"),
      expectedUrl: /\/dashboard(?:$|[/?#])/,
    }
  }

  if (role === "tech") {
    return {
      email: readRequiredEnv("E2E_TECH_EMAIL"),
      password: readRequiredEnv("E2E_TECH_PASSWORD"),
      expectedUrl: /\/dashboard\/lucrari(?:$|[/?#])/,
    }
  }

  return {
    email: readRequiredEnv("E2E_KIOSK_EMAIL"),
    password: readRequiredEnv("E2E_KIOSK_PASSWORD"),
    expectedUrl: /\/kiosk(?:$|[/?#])/,
  }
}

export function requireMutatingEnabled() {
  if (process.env.E2E_RUN_MUTATING !== "true") {
    throw new Error("Mutating real DB E2E is disabled. Set E2E_RUN_MUTATING=true to run this spec.")
  }
}

export function isMutatingEnabled() {
  return process.env.E2E_RUN_MUTATING === "true"
}

export function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value || undefined
}

export function makeRunPrefix() {
  const fromEnv = process.env.E2E_RUN_PREFIX?.trim()
  if (fromEnv) return fromEnv
  return `E2E_RUN_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`
}
