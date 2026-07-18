export class ScheduledWorksAuthorizationError extends Error {
  readonly code: "unauthenticated" | "permission-denied" | "invalid-argument"

  constructor(code: ScheduledWorksAuthorizationError["code"], message: string) {
    super(message)
    this.code = code
  }
}

export function requireScheduledWorksAdmin(
  uid: string | undefined,
  user: Record<string, unknown> | undefined,
) {
  if (!uid) {
    throw new ScheduledWorksAuthorizationError("unauthenticated", "Authentication is required.")
  }
  if (user?.role !== "admin") {
    throw new ScheduledWorksAuthorizationError("permission-denied", "Admin role is required.")
  }
}

export function parseScheduledWorksInput(data: unknown): { contractId: string } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new ScheduledWorksAuthorizationError("invalid-argument", "Invalid request payload.")
  }
  const row = data as Record<string, unknown>
  if (Object.keys(row).some((key) => key !== "contractId")) {
    throw new ScheduledWorksAuthorizationError("invalid-argument", "Invalid request payload.")
  }
  if (typeof row.contractId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.contractId)) {
    throw new ScheduledWorksAuthorizationError("invalid-argument", "Invalid contractId.")
  }
  return { contractId: row.contractId }
}
