import type {
  CrmOpportunity,
  CrmPermission,
  CrmVisibility,
  CrmVisibleTo,
} from "@/lib/crm/types"

export function hasOpportunityViewAccess(
  opportunity: Pick<CrmOpportunity, "ownerId" | "readUserIds" | "editUserIds">,
  userId: string,
  explicitPermissions: CrmPermission[] = []
) {
  if (!userId) return false
  if (opportunity.ownerId === userId) return true
  if (opportunity.readUserIds?.includes(userId)) return true
  if (opportunity.editUserIds?.includes(userId)) return true
  return explicitPermissions.includes("VIEW") || explicitPermissions.includes("EDIT")
}

export function hasOpportunityEditAccess(
  opportunity: Pick<CrmOpportunity, "ownerId" | "editUserIds">,
  userId: string,
  explicitPermissions: CrmPermission[] = []
) {
  if (!userId) return false
  if (opportunity.ownerId === userId) return true
  if (opportunity.editUserIds?.includes(userId)) return true
  return explicitPermissions.includes("EDIT")
}

export function canViewByVisibility(params: {
  visibility: CrmVisibility
  creatorId: string
  userId: string
  opportunityOwnerId: string
  visibleToUserIds?: string[]
  customVisibleRows?: CrmVisibleTo[]
}) {
  const { visibility, creatorId, userId, opportunityOwnerId, visibleToUserIds = [], customVisibleRows = [] } = params

  if (!userId) return false

  if (visibility === "GENERAL") return true
  if (visibility === "PRIVATE") {
    return creatorId === userId || opportunityOwnerId === userId
  }

  if (visibleToUserIds.includes(userId)) return true
  return customVisibleRows.some((row) => row.userId === userId)
}

export function normalizeVisibilityUsers(visibility: CrmVisibility, userIds: string[] | undefined) {
  if (visibility !== "CUSTOM") return []
  const unique = new Set((userIds || []).filter(Boolean))
  return Array.from(unique)
}
