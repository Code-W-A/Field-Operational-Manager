import { getEmployeeFullName, type Employee } from "@/lib/hr/types"

export type KioskEligibleRole = "tehnician" | "admin" | "dispecer"

export interface KioskSourceUser {
  uid: string
  role?: string
  email?: string
  displayName?: string
  kioskPin?: string
}

export interface KioskEligibleUser {
  uid: string
  displayName: string
  role: KioskEligibleRole
  email: string
  photoURL?: string
  kioskPin?: string
}

function isKioskEligibleRole(role: unknown): role is KioskEligibleRole {
  return role === "tehnician" || role === "admin" || role === "dispecer"
}

/**
 * Build the kiosk roster using active HR employees that are linked to users with eligible roles.
 * Rules:
 * - employee.active must be true
 * - employee.userUid must map to a users doc
 * - users role must be tehnician/admin/dispecer
 * - user email must be present (required for password verification)
 * - deduplicate by uid
 */
export function buildKioskEligibleUsers(params: { employees: Employee[]; users: KioskSourceUser[] }): KioskEligibleUser[] {
  const usersByUid = new Map<string, KioskSourceUser>()
  for (const user of params.users) {
    const uid = String(user.uid || "").trim()
    if (!uid) continue
    const role = String(user.role || "").trim()
    if (!isKioskEligibleRole(role)) continue
    const email = String(user.email || "").trim()
    if (!email) continue
    usersByUid.set(uid, { ...user, uid, role, email })
  }

  const deduped = new Map<string, KioskEligibleUser>()

  for (const employee of params.employees) {
    if (!employee?.active) continue
    const userUid = String(employee.userUid || "").trim()
    if (!userUid) continue

    const matched = usersByUid.get(userUid)
    if (!matched) continue
    if (!isKioskEligibleRole(matched.role)) continue

    const pin = String(matched.kioskPin || "").trim()
    const candidate: KioskEligibleUser = {
      uid: userUid,
      displayName: getEmployeeFullName(employee) || String(matched.displayName || "").trim() || "Salariat",
      role: matched.role,
      email: String(matched.email || "").trim(),
      photoURL: employee.photoURL,
      ...(pin ? { kioskPin: pin } : {}),
    }

    const existing = deduped.get(userUid)
    if (!existing) {
      deduped.set(userUid, candidate)
      continue
    }

    // Keep deterministic best candidate when duplicate employee rows point to the same user.
    if (!existing.photoURL && candidate.photoURL) {
      deduped.set(userUid, candidate)
      continue
    }

    if (candidate.displayName.localeCompare(existing.displayName, "ro") < 0) {
      deduped.set(userUid, candidate)
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.displayName.localeCompare(b.displayName, "ro"))
}
