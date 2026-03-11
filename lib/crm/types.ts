import type { Timestamp } from "firebase/firestore"
import {
  CRM_DIRECTIONS,
  CRM_INTERNAL_HANDOFF_STATUSES,
  CRM_INTERNAL_NOTE_STATUSES,
  CRM_PERMISSIONS,
  CRM_PRIORITIES,
  CRM_TASK_STATUSES,
  CRM_TASK_TYPES,
  CRM_VISIBILITIES,
  CRM_WORK_STATUSES,
  CRM_OPPORTUNITY_TYPES,
} from "@/lib/crm/constants"

export type CrmPermission = (typeof CRM_PERMISSIONS)[number]
export type CrmVisibility = (typeof CRM_VISIBILITIES)[number]
export type CrmPriority = (typeof CRM_PRIORITIES)[number]
export type CrmWorkStatus = (typeof CRM_WORK_STATUSES)[number]
export type CrmPipelineStage = string
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number]
export type CrmTaskType = (typeof CRM_TASK_TYPES)[number]
export type CrmEmailDirection = (typeof CRM_DIRECTIONS)[number]
export type CrmOpportunityType = (typeof CRM_OPPORTUNITY_TYPES)[number]
export type CrmInternalHandoffStatus = (typeof CRM_INTERNAL_HANDOFF_STATUSES)[number]
export type CrmInternalNoteStatus = (typeof CRM_INTERNAL_NOTE_STATUSES)[number]

export type FirestoreDateValue = Timestamp | Date | number | string | null | undefined

export interface CrmClient {
  id: string
  name: string
  type: string
  address: string
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
}

export interface CrmClientContact {
  id: string
  clientId: string
  name: string
  phone: string
  email?: string
  functie?: string
  label?: string
  locationName?: string
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
}

export interface CrmOpportunity {
  id: string
  number: number
  code: string
  title: string
  displayTitle: string
  clientId: string
  primaryContactId?: string
  ownerId: string
  priority: CrmPriority
  workStatus: CrmWorkStatus
  pipelineStage: CrmPipelineStage
  opportunityType: CrmOpportunityType
  amount?: number
  closeDate?: FirestoreDateValue
  wonAt?: FirestoreDateValue
  lostAt?: FirestoreDateValue
  lostReason?: string
  searchIndex?: string
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
  createdById: string
  updatedById?: string
  readUserIds: string[]
  editUserIds: string[]
}

export interface CrmOpportunityContact {
  id: string
  opportunityId: string
  contactId: string
  createdAt?: FirestoreDateValue
}

export interface CrmOpportunityAccess {
  id: string
  opportunityId: string
  userId: string
  permission: CrmPermission
  createdAt?: FirestoreDateValue
  createdById: string
}

export interface CrmTask {
  id: string
  opportunityId: string
  title: string
  status: CrmTaskStatus
  taskType?: CrmTaskType
  dueAt?: FirestoreDateValue
  assigneeId?: string
  createdById: string
  visibility: CrmVisibility
  visibleToUserIds: string[]
  automationKey?: string
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
}

export interface CrmNote {
  id: string
  opportunityId: string
  content: string
  createdById: string
  visibility: CrmVisibility
  visibleToUserIds: string[]
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
}

export interface CrmFileAttachment {
  id: string
  opportunityId: string
  internalCode?: string
  url: string
  storagePath?: string
  filename: string
  mime: string
  size: number
  uploadedById: string
  visibility: CrmVisibility
  visibleToUserIds: string[]
  createdAt?: FirestoreDateValue
}

export interface CrmEmailLog {
  id: string
  opportunityId: string
  direction: CrmEmailDirection
  subject: string
  from: string
  to: string[]
  bodySnippet: string
  sentAt?: FirestoreDateValue
  createdById: string
  visibility: CrmVisibility
  visibleToUserIds: string[]
  createdAt?: FirestoreDateValue
}

export interface CrmCalendarEvent {
  id: string
  opportunityId: string
  title: string
  startAt: FirestoreDateValue
  endAt: FirestoreDateValue
  location?: string
  reminderAt?: FirestoreDateValue
  createdById: string
  visibility: CrmVisibility
  visibleToUserIds: string[]
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
}

export interface CrmActivityLog {
  id: string
  opportunityId: string
  actorId: string
  type: string
  payload?: Record<string, unknown>
  visibility: CrmVisibility
  visibleToUserIds: string[]
  createdAt?: FirestoreDateValue
}

export interface CrmInternalHandoff {
  id: string
  opportunityId: string
  fromUserId: string
  toUserId: string
  amount: number
  currency: string
  handedOverAt: FirestoreDateValue
  note: string
  status: CrmInternalHandoffStatus
  confirmedAt?: FirestoreDateValue
  confirmedById?: string
  createdById: string
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
}

export interface CrmInternalNote {
  id: string
  opportunityId?: string
  fromUserId: string
  toUserId: string
  message: string
  context?: string
  dueAt?: FirestoreDateValue
  status: CrmInternalNoteStatus
  confirmationMessage?: string
  confirmedAt?: FirestoreDateValue
  confirmedById?: string
  createdById: string
  createdAt?: FirestoreDateValue
  updatedAt?: FirestoreDateValue
}

export interface CrmVisibleTo {
  id: string
  entityType: "TASK" | "NOTE" | "FILE" | "EMAIL" | "CALENDAR_EVENT" | "ACTIVITY"
  entityId: string
  opportunityId: string
  userId: string
  createdAt?: FirestoreDateValue
}

export interface CrmFilters {
  type?: CrmOpportunityType | "ALL"
  search?: string
  ownerId?: string | "ALL"
  priority?: CrmPriority | "ALL"
  pipelineStage?: CrmPipelineStage | "ALL"
  workStatus?: CrmWorkStatus | "ALL"
}

export interface CreateOpportunityInput {
  title: string
  clientId: string
  primaryContactId?: string
  ownerId: string
  assignedReadUserIds?: string[]
  createdById: string
  pipelineStage: CrmPipelineStage
  priority: CrmPriority
  workStatus?: CrmWorkStatus
  opportunityType: CrmOpportunityType
  amount?: number
  closeDate?: Date
  contactIds?: string[]
}

export interface CreateTaskInput {
  opportunityId: string
  title: string
  createdById: string
  assigneeId?: string
  status?: CrmTaskStatus
  taskType?: CrmTaskType
  dueAt?: Date
  visibility?: CrmVisibility
  visibleToUserIds?: string[]
  automationKey?: string
}

export interface CreateNoteInput {
  opportunityId: string
  content: string
  createdById: string
  visibility?: CrmVisibility
  visibleToUserIds?: string[]
}

export interface CreateEmailInput {
  opportunityId: string
  direction: CrmEmailDirection
  subject: string
  from: string
  to: string[]
  bodySnippet: string
  sentAt?: Date
  createdById: string
  visibility?: CrmVisibility
  visibleToUserIds?: string[]
}

export interface CreateCalendarEventInput {
  opportunityId: string
  title: string
  startAt: Date
  endAt: Date
  location?: string
  reminderAt?: Date
  createdById: string
  visibility?: CrmVisibility
  visibleToUserIds?: string[]
}

export interface CreateInternalHandoffInput {
  opportunityId: string
  fromUserId: string
  toUserId: string
  amount: number
  currency: string
  handedOverAt: Date
  note: string
  createdById: string
}

export interface CreateInternalNoteInput {
  opportunityId: string
  fromUserId: string
  toUserId: string
  message: string
  createdById: string
  context?: string
  dueAt?: Date
}

export interface CreateStandaloneInternalNoteInput {
  fromUserId: string
  toUserId: string
  message: string
  createdById: string
  context?: string
  dueAt?: Date
}

export interface CrmUserOption {
  uid: string
  displayName: string
  email: string
  role: string
}
