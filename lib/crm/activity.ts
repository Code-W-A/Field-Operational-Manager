import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
  orderBy,
  limit,
  Timestamp,
  deleteDoc,
  doc,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import type { CrmActivityLog, CrmVisibility, CrmVisibleTo } from "@/lib/crm/types"
import { canViewByVisibility, normalizeVisibilityUsers } from "@/lib/crm/access"

export async function logCrmActivity(params: {
  opportunityId: string
  actorId: string
  type: string
  payload?: Record<string, unknown>
  visibility?: CrmVisibility
  visibleToUserIds?: string[]
}) {
  const visibility = params.visibility || "GENERAL"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, params.visibleToUserIds)

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.activityLogs), {
    opportunityId: params.opportunityId,
    actorId: params.actorId,
    type: params.type,
    payload: params.payload || {},
    visibility,
    visibleToUserIds,
    createdAt: serverTimestamp(),
  })

  await syncVisibleTo({
    entityType: "ACTIVITY",
    entityId: ref.id,
    opportunityId: params.opportunityId,
    userIds: visibleToUserIds,
  })

  return ref.id
}

export async function listCrmActivity(params: {
  opportunityId: string
  userId: string
  opportunityOwnerId: string
  pageSize?: number
}) {
  const rows = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.activityLogs),
      where("opportunityId", "==", params.opportunityId),
      orderBy("createdAt", "desc"),
      limit(params.pageSize || 200)
    )
  )

  const visibleRows = await getVisibleToRows("ACTIVITY", params.opportunityId)

  return rows.docs
    .map((snap) => ({ id: snap.id, ...(snap.data() as Omit<CrmActivityLog, "id">) }))
    .filter((row) =>
      canViewByVisibility({
        visibility: row.visibility,
        creatorId: row.actorId,
        opportunityOwnerId: params.opportunityOwnerId,
        userId: params.userId,
        visibleToUserIds: row.visibleToUserIds,
        customVisibleRows: visibleRows.filter((visibleRow) => visibleRow.entityId === row.id),
      })
    )
}

export async function syncVisibleTo(params: {
  entityType: CrmVisibleTo["entityType"]
  entityId: string
  opportunityId: string
  userIds: string[]
}) {
  const existing = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.visibleTo),
      where("entityType", "==", params.entityType),
      where("entityId", "==", params.entityId)
    )
  )

  const existingByUser = new Map<string, string>()
  existing.docs.forEach((docSnap) => {
    const row = docSnap.data() as CrmVisibleTo
    existingByUser.set(row.userId, docSnap.id)
  })

  const targetUsers = new Set(params.userIds)
  const operations: Promise<unknown>[] = []

  for (const [userId, docId] of existingByUser.entries()) {
    if (!targetUsers.has(userId)) {
      operations.push(deleteDoc(doc(db, CRM_COLLECTIONS.visibleTo, docId)))
    }
  }

  for (const userId of targetUsers) {
    if (!existingByUser.has(userId)) {
      operations.push(
        addDoc(collection(db, CRM_COLLECTIONS.visibleTo), {
          entityType: params.entityType,
          entityId: params.entityId,
          opportunityId: params.opportunityId,
          userId,
          createdAt: serverTimestamp(),
        })
      )
    }
  }

  await Promise.all(operations)
}

export async function getVisibleToRows(entityType: CrmVisibleTo["entityType"], opportunityId: string) {
  const rows = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.visibleTo),
      where("entityType", "==", entityType),
      where("opportunityId", "==", opportunityId)
    )
  )

  return rows.docs.map((snap) => ({ id: snap.id, ...(snap.data() as Omit<CrmVisibleTo, "id">) }))
}

export function getDateValue(dateValue: unknown) {
  if (!dateValue) return null
  if (dateValue instanceof Date) return dateValue
  if (dateValue instanceof Timestamp) return dateValue.toDate()
  if (typeof dateValue === "number") return new Date(dateValue)
  if (typeof dateValue === "string") return new Date(dateValue)

  const maybeDate = dateValue as { toDate?: () => Date }
  if (typeof maybeDate.toDate === "function") {
    return maybeDate.toDate()
  }

  return null
}
