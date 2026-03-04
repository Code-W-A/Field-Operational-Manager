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
import type {
  CrmCalendarEvent,
  CrmEmailLog,
  CrmFileAttachment,
  CrmNote,
  CrmTask,
  CrmVisibility,
  CreateCalendarEventInput,
  CreateEmailInput,
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
  const visibility = input.visibility || "GENERAL"
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
      title: input.title,
      assigneeId: input.assigneeId || null,
      dueAt: input.dueAt?.toISOString() || null,
    },
    visibility,
    visibleToUserIds,
  })

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
      changes: payload,
    },
  })
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
        title: task.title,
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
      title: task.title,
    },
  })
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
  const visibility = input.visibility || "GENERAL"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, input.visibleToUserIds)

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.notes), {
    opportunityId: input.opportunityId,
    content: input.content.trim(),
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
    },
    visibility,
    visibleToUserIds,
  })

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
    },
  })
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
  const visibility = input.visibility || "GENERAL"
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
    },
    visibility,
    visibleToUserIds,
  })

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
  const visibility = input.visibility || "GENERAL"
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
    },
    visibility,
    visibleToUserIds,
  })

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
      title: event.title,
    },
  })
}

function mapFile(docId: string, data: Record<string, unknown>): CrmFileAttachment {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
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

  const visibility = params.visibility || "GENERAL"
  const visibleToUserIds = normalizeVisibilityUsers(visibility, params.visibleToUserIds)

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.files), {
    opportunityId: params.opportunityId,
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
      filename: uploadResult.filename,
      size: uploadResult.size,
    },
    visibility,
    visibleToUserIds,
  })

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
      filename: fileRow.filename,
    },
  })
}
