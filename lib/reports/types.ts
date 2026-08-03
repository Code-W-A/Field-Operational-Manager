export type AuditOutcome = "success" | "fail"
export type AuditCoverage = "complete" | "legacy_partial"

export interface AuditChange {
  field: string
  label: string
  before?: string
  after?: string
  presentation?: AuditChangePresentation
}

export type AuditChangeKind = "added" | "removed" | "changed"

export interface AuditValueItem {
  label: string
  value: string
}

export interface AuditValuePresentation {
  text: string
  empty: boolean
  items: AuditValueItem[]
}

export interface AuditChangePresentation {
  label: string
  kind: AuditChangeKind
  before: AuditValuePresentation
  after: AuditValuePresentation
}

export interface AuditEventPresentation {
  title: string
  description: string
  actionLabel: string
  moduleLabel: string
  entityLabel: string
  entityHref?: string
  changeCount: number
}

export interface AuditEvent {
  id: string
  occurredAt: string
  actorId: string
  actorName: string
  actorRole?: string
  module: string
  action: string
  outcome: AuditOutcome
  entityType: string
  entityId?: string
  entityLabel?: string
  summary: string
  changes: AuditChange[]
  source: string
  coverage: AuditCoverage
  presentation?: AuditEventPresentation
}

export interface UninvoicedReportRow {
  id: string
  ticketNumber: string
  client: string
  location: string
  workType: string
  interventionDate: string
  reportDate: string
  technicians: string[]
  workStatus: string
  invoiceStatus: string
  ageDays: number
  archived: boolean
  href: string
}

export interface ReportFacet {
  value: string
  label: string
}

export interface UninvoicedReportResponse {
  rows: UninvoicedReportRow[]
  total: number
  nextCursor: string | null
  generatedAt: string
  facets: {
    clients: ReportFacet[]
    workTypes: ReportFacet[]
    workStatuses: ReportFacet[]
  }
}

export interface ActivityReportResponse {
  rows: AuditEvent[]
  total: number
  nextCursor: string | null
  generatedAt: string
  coverageStartAt: string | null
  includesLegacyPartial: boolean
}

export interface ReportUserOption {
  id: string
  name: string
  email: string
  role: string
}
