export const LIVE_FIREBASE_PROJECT_ID = "field-operational-manager"

export function assertSafeFirebaseEmulatorProject(projectId: string | undefined): string {
  const normalized = String(projectId || "").trim()
  if (!normalized) {
    throw new Error("E2E_ABORT: Firebase project ID is missing")
  }
  if (normalized === LIVE_FIREBASE_PROJECT_ID || !normalized.startsWith("demo-")) {
    throw new Error(`E2E_ABORT: production Firebase project detected (${normalized})`)
  }
  return normalized
}

export function shouldUseFirebaseEmulators(): boolean {
  return process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
}
