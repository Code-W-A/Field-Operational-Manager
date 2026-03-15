export const CRM_INBOX_ACCOUNT = "fom@nrg-acces.ro"
export const CRM_INBOX_PROVIDER = "imap" as const

export const CRM_INBOX_STATUSES = ["NEW", "IN_PROGRESS", "DONE", "IGNORED"] as const
export const CRM_INBOX_CATEGORIES = ["OFERTA", "FACTURARE", "SUPORT", "INSTALARE", "ADMIN", "SPAM", "UNCLASSIFIED"] as const
export const CRM_INBOX_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const
export const CRM_INBOX_LINK_STATES = ["LINKED", "UNLINKED"] as const

export type CrmInboxProvider = typeof CRM_INBOX_PROVIDER
export type CrmInboxStatus = (typeof CRM_INBOX_STATUSES)[number]
export type CrmInboxCategory = (typeof CRM_INBOX_CATEGORIES)[number]
export type CrmInboxPriority = (typeof CRM_INBOX_PRIORITIES)[number]
export type CrmInboxLinkState = (typeof CRM_INBOX_LINK_STATES)[number]
export type CrmInboxLinkMethod = "subject_code" | "sender_contact" | "manual_existing" | "created_from_email"
export type CrmInboxRecommendationReason = "subject_code" | "sender_contact"

export type CrmInboxDateValue =
  | Date
  | string
  | number
  | null
  | undefined
  | { toDate?: () => Date }

export interface CrmInboxMessage {
  id: string
  provider: CrmInboxProvider
  account: string
  messageId: string
  providerMessageId?: string
  threadId?: string
  from: string
  to: string[]
  cc?: string[]
  subject: string
  bodySnippet: string
  receivedAt: CrmInboxDateValue
  status: CrmInboxStatus
  category: CrmInboxCategory
  assignedToUserId?: string
  assignedTeam?: string
  priority?: CrmInboxPriority
  opportunityId?: string
  opportunityCode?: string
  linkedAt?: CrmInboxDateValue
  linkedByUserId?: string
  linkMethod?: CrmInboxLinkMethod
  crmEmailId?: string
  createdAt?: CrmInboxDateValue
  updatedAt?: CrmInboxDateValue
}

export interface CrmInboxOpportunitySummary {
  id: string
  code?: string
  title?: string
  clientId?: string
  clientName?: string
  updatedAt?: CrmInboxDateValue
}

export interface CrmInboxOpportunityRecommendation extends CrmInboxOpportunitySummary {
  reason: CrmInboxRecommendationReason
}

export interface CrmInboxMessageListItem extends CrmInboxMessage {
  linkedOpportunity?: CrmInboxOpportunitySummary
  recommendedOpportunities: CrmInboxOpportunityRecommendation[]
  subjectOpportunityCode?: string
  draftClientId?: string
}

export interface CrmInboxIngestInput {
  messageId?: string
  providerMessageId?: string
  threadId?: string
  from: string
  to: string[] | string
  cc?: string[] | string
  subject?: string
  bodySnippet?: string
  receivedAt: CrmInboxDateValue
}

export interface CrmInboxListFilters {
  status?: CrmInboxStatus
  category?: CrmInboxCategory
  assignedToUserId?: string
  linkState?: CrmInboxLinkState
  limit?: number
}

export interface CrmInboxUpdateInput {
  id: string
  status?: CrmInboxStatus
  category?: CrmInboxCategory
  assignedToUserId?: string | null
  assignedTeam?: string | null
  priority?: CrmInboxPriority | null
}

export interface CrmInboxIngestResult {
  inserted: number
  updated: number
  skipped: number
  errors: Array<{ index: number; reason: string }>
}

export interface CrmInboxLinkInput {
  inboxMessageId: string
  opportunityId: string
  actorId: string
  linkMethod: CrmInboxLinkMethod
}
