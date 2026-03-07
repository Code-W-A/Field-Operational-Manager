import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { canViewByVisibility, normalizeVisibilityUsers } from "@/lib/crm/access"
import {
  getVisibleToRows,
  logCrmActivity,
  syncVisibleTo,
} from "@/lib/crm/activity"
import { rebuildOpportunitySearchIndex } from "@/lib/crm/opportunity-search-index"
import type {
  CrmCalendarEvent,
  CrmEmailLog,
  CrmInternalHandoff,
  CrmInternalNote,
  CrmFileAttachment,
  CrmNote,
  CrmTask,
  CrmVisibility,
  CreateCalendarEventInput,
  CreateEmailInput,
  CreateInternalHandoffInput,
  CreateInternalNoteInput,
  CreateStandaloneInternalNoteInput,
  CreateNoteInput,
  CreateTaskInput,
} from "@/lib/crm/types"
import { crmStorageProvider } from "@/lib/crm/storage/provider"

function toTimestamp(value?: Date) {
  return value ? Timestamp.fromDate(value) : null
}

function mapTask(docId: string, data: Record<string, unknown>): CrmTask {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    title: String(data.title || ""),
    status: (data.status as CrmTask["status"]) || "TODO",
    dueAt: (data.dueAt as CrmTask["dueAt"]) || undefined,
    reminderAt: (data.reminderAt as CrmTask["reminderAt"]) || undefined,
    assigneeId: typeof data.assigneeId === "string" ? data.assigneeId : undefined,
    createdById: String(data.createdById || ""),
    visibility: (data.visibility as CrmTask["visibility"]) || "GENERAL",
    visibleToUserIds: Array.isArray(data.visibleToUserIds) ? (data.visibleToUserIds as string[]) : [],
    automationKey: typeof data.automationKey === "string" ? data.automationKey : undefined,
    createdAt: (data.createdAt as CrmTask["createdAt"]) || undefined,
    updatedAt: (data.updatedAt as CrmTask["updatedAt"]) || undefined,
  }
}

export async function createCrmTask(input: CreateTaskInput) {
  const visibility = input.visibility || "PRIVATE"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, input.visibleToUserIds)

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.tasks), {
    opportunityId: input.opportunityId,
    title: input.title.trim(),
    status: input.status || "TODO",
    dueAt: toTimestamp(input.dueAt) || null,
    reminderAt: toTimestamp(input.reminderAt) || null,
    assigneeId: input.assigneeId || null,
    createdById: input.createdById,
    visibility,
    visibleToUserIds,
    automationKey: input.automationKey || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await syncVisibleTo({
    entityType: "TASK",
    entityId: ref.id,
    opportunityId: input.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: input.opportunityId,
    actorId: input.createdById,
    type: "TASK_CREATED",
    payload: {
      taskId: ref.id,
      task: {
        id: ref.id,
        title: input.title.trim(),
        status: input.status || "TODO",
        assigneeId: input.assigneeId || null,
        dueAt: input.dueAt?.toISOString() || null,
        reminderAt: input.reminderAt?.toISOString() || null,
        visibility,
        visibleToUserIds,
      },
    },
    visibility,
    visibleToUserIds,
  })

  await rebuildOpportunitySearchIndex(input.opportunityId)

  return ref.id
}

export async function createCrmTaskIfMissing(input: CreateTaskInput) {
  if (!input.automationKey) {
    return createCrmTask(input)
  }

  const existing = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.tasks),
      where("opportunityId", "==", input.opportunityId),
      where("automationKey", "==", input.automationKey),
      limit(1)
    )
  )

  if (!existing.empty) {
    return existing.docs[0].id
  }

  return createCrmTask(input)
}

export async function listCrmTasksForOpportunity(params: {
  opportunityId: string
  userId: string
  opportunityOwnerId: string
}) {
  const rows = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.tasks),
      where("opportunityId", "==", params.opportunityId),
      orderBy("createdAt", "desc"),
      limit(300)
    )
  )

  const visibleRows = await getVisibleToRows("TASK", params.opportunityId)

  return rows.docs
    .map((snap) => mapTask(snap.id, snap.data() as Record<string, unknown>))
    .filter((task) =>
      canViewByVisibility({
        visibility: task.visibility,
        creatorId: task.createdById,
        userId: params.userId,
        opportunityOwnerId: params.opportunityOwnerId,
        visibleToUserIds: task.visibleToUserIds,
        customVisibleRows: visibleRows.filter((row) => row.entityId === task.id),
      })
    )
}

export async function listCrmTasksForOpportunityIds(params: {
  opportunityIds: string[]
  userId: string
  ownerByOpportunityId: Record<string, string>
}) {
  const items: CrmTask[] = []

  for (const opportunityId of params.opportunityIds) {
    const list = await listCrmTasksForOpportunity({
      opportunityId,
      userId: params.userId,
      opportunityOwnerId: params.ownerByOpportunityId[opportunityId] || params.userId,
    })
    items.push(...list)
  }

  return items
}

export async function updateCrmTask(params: {
  taskId: string
  actorId: string
  title?: string
  status?: CrmTask["status"]
  assigneeId?: string
  dueAt?: Date | null
  reminderAt?: Date | null
  visibility?: CrmVisibility
  visibleToUserIds?: string[]
}) {
  const taskRef = doc(db, CRM_COLLECTIONS.tasks, params.taskId)
  const taskSnap = await getDoc(taskRef)
  if (!taskSnap.exists()) throw new Error("Task-ul nu există")

  const task = mapTask(taskSnap.id, taskSnap.data() as Record<string, unknown>)
  const beforeTask = {
    id: task.id,
    title: task.title,
    status: task.status,
    assigneeId: task.assigneeId || null,
    dueAt: task.dueAt || null,
    reminderAt: task.reminderAt || null,
    visibility: task.visibility,
    visibleToUserIds: task.visibleToUserIds,
  }
  const visibility = params.visibility || task.visibility
  const visibleToUserIds = normalizeVisibilityUsers(visibility, params.visibleToUserIds || task.visibleToUserIds)

  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    visibility,
    visibleToUserIds,
  }

  if (typeof params.title === "string") payload.title = params.title.trim()
  if (params.status) payload.status = params.status
  if (typeof params.assigneeId === "string") payload.assigneeId = params.assigneeId || null
  if (params.dueAt instanceof Date) payload.dueAt = Timestamp.fromDate(params.dueAt)
  if (params.dueAt === null) payload.dueAt = null
  if (params.reminderAt instanceof Date) payload.reminderAt = Timestamp.fromDate(params.reminderAt)
  if (params.reminderAt === null) payload.reminderAt = null

  await updateDoc(taskRef, payload)

  await syncVisibleTo({
    entityType: "TASK",
    entityId: params.taskId,
    opportunityId: task.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: task.opportunityId,
    actorId: params.actorId,
    type: "TASK_UPDATED",
    payload: {
      taskId: params.taskId,
      before: beforeTask,
      changes: {
        title: typeof params.title === "string" ? params.title.trim() : undefined,
        status: params.status,
        assigneeId: typeof params.assigneeId === "string" ? params.assigneeId || null : undefined,
        dueAt:
          params.dueAt instanceof Date
            ? params.dueAt.toISOString()
            : params.dueAt === null
              ? null
              : undefined,
        reminderAt:
          params.reminderAt instanceof Date
            ? params.reminderAt.toISOString()
            : params.reminderAt === null
              ? null
              : undefined,
        visibility,
        visibleToUserIds,
      },
    },
  })

  await rebuildOpportunitySearchIndex(task.opportunityId)
}

export async function completeCrmTask(taskId: string, actorId: string) {
  await updateCrmTask({
    taskId,
    actorId,
    status: "DONE",
  })

  const taskSnap = await getDoc(doc(db, CRM_COLLECTIONS.tasks, taskId))
  if (taskSnap.exists()) {
    const task = mapTask(taskSnap.id, taskSnap.data() as Record<string, unknown>)
    await logCrmActivity({
      opportunityId: task.opportunityId,
      actorId,
      type: "TASK_COMPLETED",
      payload: {
        taskId,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          assigneeId: task.assigneeId || null,
          dueAt: task.dueAt || null,
        },
        completedAt: new Date().toISOString(),
      },
    })
  }
}

export async function deleteCrmTask(taskId: string, actorId: string) {
  const taskRef = doc(db, CRM_COLLECTIONS.tasks, taskId)
  const taskSnap = await getDoc(taskRef)
  if (!taskSnap.exists()) return

  const task = mapTask(taskSnap.id, taskSnap.data() as Record<string, unknown>)
  await deleteDoc(taskRef)

  await logCrmActivity({
    opportunityId: task.opportunityId,
    actorId,
    type: "TASK_DELETED",
    payload: {
      taskId,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
        assigneeId: task.assigneeId || null,
        dueAt: task.dueAt || null,
        reminderAt: task.reminderAt || null,
        visibility: task.visibility,
        visibleToUserIds: task.visibleToUserIds,
        createdById: task.createdById,
      },
    },
  })

  await rebuildOpportunitySearchIndex(task.opportunityId)
}

function mapNote(docId: string, data: Record<string, unknown>): CrmNote {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    content: String(data.content || ""),
    createdById: String(data.createdById || ""),
    visibility: (data.visibility as CrmNote["visibility"]) || "GENERAL",
    visibleToUserIds: Array.isArray(data.visibleToUserIds) ? (data.visibleToUserIds as string[]) : [],
    createdAt: (data.createdAt as CrmNote["createdAt"]) || undefined,
    updatedAt: (data.updatedAt as CrmNote["updatedAt"]) || undefined,
  }
}

export async function createCrmNote(input: CreateNoteInput) {
  const visibility = input.visibility || "PRIVATE"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, input.visibleToUserIds)
  const content = input.content.trim()
  const preview = content.length > 160 ? `${content.slice(0, 157)}...` : content

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.notes), {
    opportunityId: input.opportunityId,
    content,
    createdById: input.createdById,
    visibility,
    visibleToUserIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await syncVisibleTo({
    entityType: "NOTE",
    entityId: ref.id,
    opportunityId: input.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: input.opportunityId,
    actorId: input.createdById,
    type: "NOTE_CREATED",
    payload: {
      noteId: ref.id,
      content,
      preview,
      visibility,
      visibleToUserIds,
    },
    visibility,
    visibleToUserIds,
  })

  await rebuildOpportunitySearchIndex(input.opportunityId)

  return ref.id
}

export async function listCrmNotes(params: {
  opportunityId: string
  userId: string
  opportunityOwnerId: string
}) {
  const rows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.notes), where("opportunityId", "==", params.opportunityId), orderBy("createdAt", "desc"), limit(300))
  )

  const visibleRows = await getVisibleToRows("NOTE", params.opportunityId)

  return rows.docs
    .map((snap) => mapNote(snap.id, snap.data() as Record<string, unknown>))
    .filter((note) =>
      canViewByVisibility({
        visibility: note.visibility,
        creatorId: note.createdById,
        userId: params.userId,
        opportunityOwnerId: params.opportunityOwnerId,
        visibleToUserIds: note.visibleToUserIds,
        customVisibleRows: visibleRows.filter((row) => row.entityId === note.id),
      })
    )
}

export async function updateCrmNoteVisibility(params: {
  noteId: string
  actorId: string
  visibility: CrmVisibility
  visibleToUserIds?: string[]
}) {
  const noteRef = doc(db, CRM_COLLECTIONS.notes, params.noteId)
  const noteSnap = await getDoc(noteRef)
  if (!noteSnap.exists()) throw new Error("Nota nu există")

  const note = mapNote(noteSnap.id, noteSnap.data() as Record<string, unknown>)
  const visibility = params.visibility
  const visibleToUserIds = normalizeVisibilityUsers(visibility, params.visibleToUserIds || note.visibleToUserIds)

  await updateDoc(noteRef, {
    visibility,
    visibleToUserIds,
    updatedAt: serverTimestamp(),
  })

  await syncVisibleTo({
    entityType: "NOTE",
    entityId: note.id,
    opportunityId: note.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: note.opportunityId,
    actorId: params.actorId,
    type: "NOTE_VISIBILITY_UPDATED",
    payload: {
      noteId: note.id,
      note: {
        id: note.id,
        content: note.content,
        createdById: note.createdById,
      },
      before: {
        visibility: note.visibility,
        visibleToUserIds: note.visibleToUserIds,
      },
      after: {
        visibility,
        visibleToUserIds,
      },
    },
    visibility,
    visibleToUserIds,
  })
}

export async function updateCrmNoteContent(params: {
  noteId: string
  actorId: string
  content: string
}) {
  const noteRef = doc(db, CRM_COLLECTIONS.notes, params.noteId)
  const noteSnap = await getDoc(noteRef)
  if (!noteSnap.exists()) throw new Error("Nota nu există")

  const note = mapNote(noteSnap.id, noteSnap.data() as Record<string, unknown>)
  const nextContent = params.content.trim()
  if (!nextContent) throw new Error("Conținutul notei nu poate fi gol")
  if (nextContent === note.content) return

  await updateDoc(noteRef, {
    content: nextContent,
    updatedAt: serverTimestamp(),
  })

  await logCrmActivity({
    opportunityId: note.opportunityId,
    actorId: params.actorId,
    type: "NOTE_UPDATED",
    payload: {
      noteId: note.id,
      before: {
        content: note.content,
      },
      after: {
        content: nextContent,
      },
    },
    visibility: note.visibility,
    visibleToUserIds: note.visibleToUserIds,
  })

  await rebuildOpportunitySearchIndex(note.opportunityId)
}

export async function deleteCrmNote(noteId: string, actorId: string) {
  const noteRef = doc(db, CRM_COLLECTIONS.notes, noteId)
  const noteSnap = await getDoc(noteRef)
  if (!noteSnap.exists()) return

  const note = mapNote(noteSnap.id, noteSnap.data() as Record<string, unknown>)
  await deleteDoc(noteRef)

  await logCrmActivity({
    opportunityId: note.opportunityId,
    actorId,
    type: "NOTE_DELETED",
    payload: {
      noteId,
      note: {
        id: note.id,
        content: note.content,
        visibility: note.visibility,
        visibleToUserIds: note.visibleToUserIds,
        createdById: note.createdById,
        createdAt: note.createdAt || null,
      },
    },
  })

  await rebuildOpportunitySearchIndex(note.opportunityId)
}

function mapInternalNote(docId: string, data: Record<string, unknown>): CrmInternalNote {
  return {
    id: docId,
    opportunityId: typeof data.opportunityId === "string" ? data.opportunityId : undefined,
    fromUserId: String(data.fromUserId || ""),
    toUserId: String(data.toUserId || ""),
    message: String(data.message || ""),
    context: typeof data.context === "string" ? data.context : undefined,
    dueAt: (data.dueAt as CrmInternalNote["dueAt"]) || undefined,
    status: (data.status as CrmInternalNote["status"]) || "PENDING",
    confirmationMessage: typeof data.confirmationMessage === "string" ? data.confirmationMessage : undefined,
    confirmedAt: (data.confirmedAt as CrmInternalNote["confirmedAt"]) || undefined,
    confirmedById: typeof data.confirmedById === "string" ? data.confirmedById : undefined,
    createdById: String(data.createdById || ""),
    createdAt: (data.createdAt as CrmInternalNote["createdAt"]) || undefined,
    updatedAt: (data.updatedAt as CrmInternalNote["updatedAt"]) || undefined,
  }
}

export async function createCrmInternalNote(input: CreateInternalNoteInput) {
  const message = input.message.trim()
  const context = input.context?.trim() || null

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.internalNotes), {
    opportunityId: input.opportunityId,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    message,
    context,
    dueAt: toTimestamp(input.dueAt) || null,
    status: "PENDING",
    confirmationMessage: null,
    confirmedAt: null,
    confirmedById: null,
    createdById: input.createdById,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await logCrmActivity({
    opportunityId: input.opportunityId,
    actorId: input.createdById,
    type: "INTERNAL_NOTE_CREATED",
    payload: {
      internalNoteId: ref.id,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      message,
      context,
      dueAt: input.dueAt ? input.dueAt.toISOString() : null,
      status: "PENDING",
    },
  })

  await rebuildOpportunitySearchIndex(input.opportunityId)

  return ref.id
}

export async function createCrmInternalNoteStandalone(input: CreateStandaloneInternalNoteInput) {
  const message = input.message.trim()
  const context = input.context?.trim() || null

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.internalNotes), {
    opportunityId: null,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    message,
    context,
    dueAt: toTimestamp(input.dueAt) || null,
    status: "PENDING",
    confirmationMessage: null,
    confirmedAt: null,
    confirmedById: null,
    createdById: input.createdById,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return ref.id
}

function getInternalNoteCreatedAtMs(note: CrmInternalNote) {
  const createdAt =
    note.createdAt instanceof Timestamp
      ? note.createdAt.toDate()
      : note.createdAt instanceof Date
        ? note.createdAt
        : note.createdAt
          ? new Date(note.createdAt as string | number)
          : null
  return createdAt?.getTime() || 0
}

function sortInternalNotesDesc(rows: CrmInternalNote[]) {
  return [...rows].sort((left, right) => {
    return getInternalNoteCreatedAtMs(right) - getInternalNoteCreatedAtMs(left)
  })
}

export async function listCrmInternalNotes(params: {
  opportunityId: string
  userId: string
  opportunityOwnerId: string
}) {
  if (!params.userId || !params.opportunityOwnerId) return []

  const rows = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.internalNotes),
      where("opportunityId", "==", params.opportunityId),
      limit(300)
    )
  )

  return rows.docs
    .map((snap) => mapInternalNote(snap.id, snap.data() as Record<string, unknown>))
    .sort((left, right) => getInternalNoteCreatedAtMs(left) - getInternalNoteCreatedAtMs(right))
}

export async function listCrmInternalNotesStandalone(params: {
  userId: string
  mailbox: "INBOX" | "SENT" | "ALL"
  status?: "PENDING" | "CONFIRMED" | "ALL"
}) {
  const statusFilter = params.status && params.status !== "ALL" ? params.status : null
  const runQuery = async (field: "toUserId" | "fromUserId") => {
    const clauses = [
      where(field, "==", params.userId),
      where("opportunityId", "==", null),
    ]
    if (statusFilter) clauses.push(where("status", "==", statusFilter))

    const rows = await getDocs(
      query(collection(db, CRM_COLLECTIONS.internalNotes), ...clauses, limit(300))
    )
    return sortInternalNotesDesc(rows.docs.map((snap) => mapInternalNote(snap.id, snap.data() as Record<string, unknown>)))
  }

  if (params.mailbox === "INBOX") {
    return runQuery("toUserId")
  }

  if (params.mailbox === "SENT") {
    return runQuery("fromUserId")
  }

  const [inboxRows, sentRows] = await Promise.all([runQuery("toUserId"), runQuery("fromUserId")])
  const deduped = new Map<string, CrmInternalNote>()
  ;[...inboxRows, ...sentRows].forEach((row) => {
    deduped.set(row.id, row)
  })
  return sortInternalNotesDesc(Array.from(deduped.values()))
}

export async function confirmCrmInternalNote(params: {
  noteId: string
  actorId: string
  confirmationMessage?: string
  canOverrideRecipient?: boolean
}) {
  const noteRef = doc(db, CRM_COLLECTIONS.internalNotes, params.noteId)
  const noteSnap = await getDoc(noteRef)
  if (!noteSnap.exists()) throw new Error("Nota internă nu există")

  const note = mapInternalNote(noteSnap.id, noteSnap.data() as Record<string, unknown>)
  if (note.status === "CONFIRMED") return

  const canConfirm = note.toUserId === params.actorId || params.canOverrideRecipient === true
  if (!canConfirm) {
    throw new Error("Doar destinatarul poate confirma nota internă")
  }

  const confirmationMessage = params.confirmationMessage?.trim() || null

  await updateDoc(noteRef, {
    status: "CONFIRMED",
    confirmationMessage,
    confirmedAt: serverTimestamp(),
    confirmedById: params.actorId,
    updatedAt: serverTimestamp(),
  })

  if (note.opportunityId) {
    await logCrmActivity({
      opportunityId: note.opportunityId,
      actorId: params.actorId,
      type: "INTERNAL_NOTE_CONFIRMED",
      payload: {
        internalNoteId: note.id,
        fromUserId: note.fromUserId,
        toUserId: note.toUserId,
        message: note.message,
        confirmationMessage,
        confirmedById: params.actorId,
        status: "CONFIRMED",
        confirmedAt: new Date().toISOString(),
      },
    })

    await rebuildOpportunitySearchIndex(note.opportunityId)
  }
}

function mapInternalHandoff(docId: string, data: Record<string, unknown>): CrmInternalHandoff {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    fromUserId: String(data.fromUserId || ""),
    toUserId: String(data.toUserId || ""),
    amount: Number(data.amount || 0),
    currency: String(data.currency || "RON"),
    handedOverAt: data.handedOverAt as CrmInternalHandoff["handedOverAt"],
    note: String(data.note || ""),
    status: (data.status as CrmInternalHandoff["status"]) || "IN_ASTEPTARE",
    confirmedAt: (data.confirmedAt as CrmInternalHandoff["confirmedAt"]) || undefined,
    confirmedById: typeof data.confirmedById === "string" ? data.confirmedById : undefined,
    createdById: String(data.createdById || ""),
    createdAt: (data.createdAt as CrmInternalHandoff["createdAt"]) || undefined,
    updatedAt: (data.updatedAt as CrmInternalHandoff["updatedAt"]) || undefined,
  }
}

export async function createCrmInternalHandoff(input: CreateInternalHandoffInput) {
  const handoffAt = Timestamp.fromDate(input.handedOverAt)

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.internalHandoffs), {
    opportunityId: input.opportunityId,
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    amount: input.amount,
    currency: input.currency.trim().toUpperCase() || "RON",
    handedOverAt: handoffAt,
    note: input.note.trim(),
    status: "IN_ASTEPTARE",
    confirmedAt: null,
    confirmedById: null,
    createdById: input.createdById,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await logCrmActivity({
    opportunityId: input.opportunityId,
    actorId: input.createdById,
    type: "INTERNAL_HANDOFF_CREATED",
    payload: {
      handoffId: ref.id,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amount: input.amount,
      currency: input.currency.trim().toUpperCase() || "RON",
      handedOverAt: input.handedOverAt.toISOString(),
      note: input.note.trim(),
      status: "IN_ASTEPTARE",
    },
  })

  await rebuildOpportunitySearchIndex(input.opportunityId)

  return ref.id
}

export async function listCrmInternalHandoffs(params: { opportunityId: string }) {
  const rows = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.internalHandoffs),
      where("opportunityId", "==", params.opportunityId),
      orderBy("createdAt", "desc"),
      limit(300)
    )
  )

  return rows.docs.map((snap) => mapInternalHandoff(snap.id, snap.data() as Record<string, unknown>))
}

export async function confirmCrmInternalHandoff(params: {
  handoffId: string
  actorId: string
  canOverrideRecipient?: boolean
}) {
  const handoffRef = doc(db, CRM_COLLECTIONS.internalHandoffs, params.handoffId)
  const handoffSnap = await getDoc(handoffRef)
  if (!handoffSnap.exists()) throw new Error("Înregistrarea nu există")

  const handoff = mapInternalHandoff(handoffSnap.id, handoffSnap.data() as Record<string, unknown>)
  if (handoff.status === "CONFIRMAT") return

  const canConfirm = handoff.toUserId === params.actorId || params.canOverrideRecipient === true
  if (!canConfirm) {
    throw new Error("Doar destinatarul poate confirma primirea")
  }

  await updateDoc(handoffRef, {
    status: "CONFIRMAT",
    confirmedAt: serverTimestamp(),
    confirmedById: params.actorId,
    updatedAt: serverTimestamp(),
  })

  await logCrmActivity({
    opportunityId: handoff.opportunityId,
    actorId: params.actorId,
    type: "INTERNAL_HANDOFF_CONFIRMED",
    payload: {
      handoffId: handoff.id,
      fromUserId: handoff.fromUserId,
      toUserId: handoff.toUserId,
      amount: handoff.amount,
      currency: handoff.currency,
      note: handoff.note,
      confirmedAt: new Date().toISOString(),
    },
  })

  await rebuildOpportunitySearchIndex(handoff.opportunityId)
}

function mapEmail(docId: string, data: Record<string, unknown>): CrmEmailLog {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    direction: (data.direction as CrmEmailLog["direction"]) || "OUT",
    subject: String(data.subject || ""),
    from: String(data.from || ""),
    to: Array.isArray(data.to) ? (data.to as string[]) : [],
    bodySnippet: String(data.bodySnippet || ""),
    sentAt: (data.sentAt as CrmEmailLog["sentAt"]) || undefined,
    createdById: String(data.createdById || ""),
    visibility: (data.visibility as CrmEmailLog["visibility"]) || "GENERAL",
    visibleToUserIds: Array.isArray(data.visibleToUserIds) ? (data.visibleToUserIds as string[]) : [],
    createdAt: (data.createdAt as CrmEmailLog["createdAt"]) || undefined,
  }
}

export async function createCrmEmail(input: CreateEmailInput) {
  const visibility = input.visibility || "PRIVATE"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, input.visibleToUserIds)

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.emails), {
    opportunityId: input.opportunityId,
    direction: input.direction,
    subject: input.subject.trim(),
    from: input.from.trim(),
    to: input.to,
    bodySnippet: input.bodySnippet.trim(),
    sentAt: input.sentAt ? Timestamp.fromDate(input.sentAt) : serverTimestamp(),
    createdById: input.createdById,
    visibility,
    visibleToUserIds,
    createdAt: serverTimestamp(),
  })

  await syncVisibleTo({
    entityType: "EMAIL",
    entityId: ref.id,
    opportunityId: input.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: input.opportunityId,
    actorId: input.createdById,
    type: "EMAIL_LOGGED",
    payload: {
      emailId: ref.id,
      direction: input.direction,
      subject: input.subject,
      from: input.from,
      to: input.to,
      bodySnippet: input.bodySnippet,
      sentAt: input.sentAt?.toISOString() || null,
    },
    visibility,
    visibleToUserIds,
  })

  await rebuildOpportunitySearchIndex(input.opportunityId)

  return ref.id
}

export async function listCrmEmails(params: {
  opportunityId: string
  userId: string
  opportunityOwnerId: string
}) {
  const rows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.emails), where("opportunityId", "==", params.opportunityId), orderBy("createdAt", "desc"), limit(300))
  )

  const visibleRows = await getVisibleToRows("EMAIL", params.opportunityId)

  return rows.docs
    .map((snap) => mapEmail(snap.id, snap.data() as Record<string, unknown>))
    .filter((email) =>
      canViewByVisibility({
        visibility: email.visibility,
        creatorId: email.createdById,
        userId: params.userId,
        opportunityOwnerId: params.opportunityOwnerId,
        visibleToUserIds: email.visibleToUserIds,
        customVisibleRows: visibleRows.filter((row) => row.entityId === email.id),
      })
    )
}

function mapCalendarEvent(docId: string, data: Record<string, unknown>): CrmCalendarEvent {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    title: String(data.title || ""),
    startAt: data.startAt as CrmCalendarEvent["startAt"],
    endAt: data.endAt as CrmCalendarEvent["endAt"],
    location: typeof data.location === "string" ? data.location : undefined,
    reminderAt: (data.reminderAt as CrmCalendarEvent["reminderAt"]) || undefined,
    createdById: String(data.createdById || ""),
    visibility: (data.visibility as CrmCalendarEvent["visibility"]) || "GENERAL",
    visibleToUserIds: Array.isArray(data.visibleToUserIds) ? (data.visibleToUserIds as string[]) : [],
    createdAt: (data.createdAt as CrmCalendarEvent["createdAt"]) || undefined,
    updatedAt: (data.updatedAt as CrmCalendarEvent["updatedAt"]) || undefined,
  }
}

export async function createCrmCalendarEvent(input: CreateCalendarEventInput) {
  const visibility = input.visibility || "PRIVATE"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, input.visibleToUserIds)

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.calendarEvents), {
    opportunityId: input.opportunityId,
    title: input.title.trim(),
    startAt: Timestamp.fromDate(input.startAt),
    endAt: Timestamp.fromDate(input.endAt),
    location: input.location?.trim() || "",
    reminderAt: toTimestamp(input.reminderAt) || null,
    createdById: input.createdById,
    visibility,
    visibleToUserIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await syncVisibleTo({
    entityType: "CALENDAR_EVENT",
    entityId: ref.id,
    opportunityId: input.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: input.opportunityId,
    actorId: input.createdById,
    type: "CALENDAR_EVENT_CREATED",
    payload: {
      eventId: ref.id,
      title: input.title,
      startAt: input.startAt.toISOString(),
      endAt: input.endAt.toISOString(),
      location: input.location || "",
      reminderAt: input.reminderAt?.toISOString() || null,
    },
    visibility,
    visibleToUserIds,
  })

  await rebuildOpportunitySearchIndex(input.opportunityId)

  return ref.id
}

export async function listCrmCalendarEvents(params: {
  opportunityId: string
  userId: string
  opportunityOwnerId: string
}) {
  const rows = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.calendarEvents),
      where("opportunityId", "==", params.opportunityId),
      orderBy("startAt", "asc"),
      limit(300)
    )
  )

  const visibleRows = await getVisibleToRows("CALENDAR_EVENT", params.opportunityId)

  return rows.docs
    .map((snap) => mapCalendarEvent(snap.id, snap.data() as Record<string, unknown>))
    .filter((event) =>
      canViewByVisibility({
        visibility: event.visibility,
        creatorId: event.createdById,
        userId: params.userId,
        opportunityOwnerId: params.opportunityOwnerId,
        visibleToUserIds: event.visibleToUserIds,
        customVisibleRows: visibleRows.filter((row) => row.entityId === event.id),
      })
    )
}

export async function deleteCrmCalendarEvent(eventId: string, actorId: string) {
  const eventRef = doc(db, CRM_COLLECTIONS.calendarEvents, eventId)
  const eventSnap = await getDoc(eventRef)
  if (!eventSnap.exists()) return

  const event = mapCalendarEvent(eventSnap.id, eventSnap.data() as Record<string, unknown>)
  await deleteDoc(eventRef)

  await logCrmActivity({
    opportunityId: event.opportunityId,
    actorId,
    type: "CALENDAR_EVENT_DELETED",
    payload: {
      eventId,
      event: {
        id: event.id,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        location: event.location || "",
        reminderAt: event.reminderAt || null,
        visibility: event.visibility,
        visibleToUserIds: event.visibleToUserIds,
      },
    },
  })

  await rebuildOpportunitySearchIndex(event.opportunityId)
}

function mapFile(docId: string, data: Record<string, unknown>): CrmFileAttachment {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    internalCode: typeof data.internalCode === "string" ? data.internalCode : undefined,
    url: String(data.url || ""),
    storagePath: typeof data.storagePath === "string" ? data.storagePath : undefined,
    filename: String(data.filename || ""),
    mime: String(data.mime || "application/octet-stream"),
    size: Number(data.size || 0),
    uploadedById: String(data.uploadedById || ""),
    visibility: (data.visibility as CrmFileAttachment["visibility"]) || "GENERAL",
    visibleToUserIds: Array.isArray(data.visibleToUserIds) ? (data.visibleToUserIds as string[]) : [],
    createdAt: (data.createdAt as CrmFileAttachment["createdAt"]) || undefined,
  }
}

export async function uploadCrmFile(params: {
  opportunityId: string
  file: File
  uploadedById: string
  visibility?: CrmVisibility
  visibleToUserIds?: string[]
}) {
  const uploadResult = await crmStorageProvider.uploadOpportunityFile({
    opportunityId: params.opportunityId,
    file: params.file,
  })

  const visibility = params.visibility || "PRIVATE"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, params.visibleToUserIds)
  const [opportunitySnap, existingFilesSnap] = await Promise.all([
    getDoc(doc(db, CRM_COLLECTIONS.opportunities, params.opportunityId)),
    getDocs(query(collection(db, CRM_COLLECTIONS.files), where("opportunityId", "==", params.opportunityId), limit(1000))),
  ])
  const opportunityCode = opportunitySnap.exists() ? String(opportunitySnap.data().code || "OP") : "OP"
  const internalCode = `${opportunityCode}.A${existingFilesSnap.size + 1}`

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.files), {
    opportunityId: params.opportunityId,
    internalCode,
    url: uploadResult.url,
    storagePath: uploadResult.path,
    filename: uploadResult.filename,
    mime: uploadResult.mime,
    size: uploadResult.size,
    uploadedById: params.uploadedById,
    visibility,
    visibleToUserIds,
    createdAt: serverTimestamp(),
  })

  await syncVisibleTo({
    entityType: "FILE",
    entityId: ref.id,
    opportunityId: params.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: params.opportunityId,
    actorId: params.uploadedById,
    type: "FILE_UPLOADED",
    payload: {
      fileId: ref.id,
      internalCode,
      filename: uploadResult.filename,
      size: uploadResult.size,
      mime: uploadResult.mime,
      url: uploadResult.url,
      storagePath: uploadResult.path,
      files: [
        {
          id: ref.id,
          internalCode,
          filename: uploadResult.filename,
          size: uploadResult.size,
          mime: uploadResult.mime,
          url: uploadResult.url,
          storagePath: uploadResult.path,
        },
      ],
    },
    visibility,
    visibleToUserIds,
  })

  await rebuildOpportunitySearchIndex(params.opportunityId)

  return ref.id
}

export async function listCrmFiles(params: {
  opportunityId: string
  userId: string
  opportunityOwnerId: string
}) {
  const rows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.files), where("opportunityId", "==", params.opportunityId), orderBy("createdAt", "desc"), limit(300))
  )

  const visibleRows = await getVisibleToRows("FILE", params.opportunityId)

  return rows.docs
    .map((snap) => mapFile(snap.id, snap.data() as Record<string, unknown>))
    .filter((file) =>
      canViewByVisibility({
        visibility: file.visibility,
        creatorId: file.uploadedById,
        userId: params.userId,
        opportunityOwnerId: params.opportunityOwnerId,
        visibleToUserIds: file.visibleToUserIds,
        customVisibleRows: visibleRows.filter((row) => row.entityId === file.id),
      })
    )
}

export async function updateCrmFileVisibility(params: {
  fileId: string
  actorId: string
  visibility: CrmVisibility
  visibleToUserIds?: string[]
}) {
  const fileRef = doc(db, CRM_COLLECTIONS.files, params.fileId)
  const fileSnap = await getDoc(fileRef)
  if (!fileSnap.exists()) throw new Error("Fișierul nu există")

  const fileRow = mapFile(fileSnap.id, fileSnap.data() as Record<string, unknown>)
  const visibility = params.visibility
  const visibleToUserIds = normalizeVisibilityUsers(visibility, params.visibleToUserIds || fileRow.visibleToUserIds)

  await updateDoc(fileRef, {
    visibility,
    visibleToUserIds,
  })

  await syncVisibleTo({
    entityType: "FILE",
    entityId: fileRow.id,
    opportunityId: fileRow.opportunityId,
    userIds: visibleToUserIds,
  })

  await logCrmActivity({
    opportunityId: fileRow.opportunityId,
    actorId: params.actorId,
    type: "FILE_VISIBILITY_UPDATED",
    payload: {
      fileId: fileRow.id,
      file: {
        id: fileRow.id,
        internalCode: fileRow.internalCode || null,
        filename: fileRow.filename,
        uploadedById: fileRow.uploadedById,
      },
      before: {
        visibility: fileRow.visibility,
        visibleToUserIds: fileRow.visibleToUserIds,
      },
      after: {
        visibility,
        visibleToUserIds,
      },
    },
    visibility,
    visibleToUserIds,
  })
}

export async function deleteCrmFile(params: { fileId: string; actorId: string }) {
  const fileRef = doc(db, CRM_COLLECTIONS.files, params.fileId)
  const fileSnap = await getDoc(fileRef)
  if (!fileSnap.exists()) return

  const fileRow = mapFile(fileSnap.id, fileSnap.data() as Record<string, unknown>)

  if (fileRow.storagePath) {
    await crmStorageProvider.deleteOpportunityFile(fileRow.storagePath)
  }

  await deleteDoc(fileRef)

  await logCrmActivity({
    opportunityId: fileRow.opportunityId,
    actorId: params.actorId,
    type: "FILE_DELETED",
    payload: {
      fileId: params.fileId,
      file: {
        id: fileRow.id,
        filename: fileRow.filename,
        mime: fileRow.mime,
        size: fileRow.size,
        url: fileRow.url,
        storagePath: fileRow.storagePath || "",
        uploadedById: fileRow.uploadedById,
        visibility: fileRow.visibility,
        visibleToUserIds: fileRow.visibleToUserIds,
      },
    },
  })

  await rebuildOpportunitySearchIndex(fileRow.opportunityId)
}
