import type { Employee } from "@/lib/hr/types"
import { buildKioskEligibleUsers, type KioskEligibleUser, type KioskEligibleRole, type KioskSourceUser } from "./kiosk-eligible-users"

export const KIOSK_ELIGIBLE_ROLES: KioskEligibleRole[] = ["tehnician", "admin", "dispecer"]

export async function loadKioskEligibleRoster(deps: {
  loadEmployees: () => Promise<Employee[]>
  loadUsersForRole: (role: KioskEligibleRole) => Promise<KioskSourceUser[]>
}): Promise<KioskEligibleUser[]> {
  const employees = await deps.loadEmployees()
  const usersByRole = await Promise.all(KIOSK_ELIGIBLE_ROLES.map((role) => deps.loadUsersForRole(role)))
  return buildKioskEligibleUsers({ employees, users: usersByRole.flat() })
}
