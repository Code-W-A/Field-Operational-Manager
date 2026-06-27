export type OfferEventType =
  | "OFFER_PREPARED"
  | "OFFER_TOKEN_MINTED"
  | "OFFER_EMAIL_SENT"
  | "OFFER_LINK_OPENED"
  | "OFFER_CODE_SENT"
  | "OFFER_CODE_VERIFIED"
  | "OFFER_ACCEPTED"
  | "OFFER_REJECTED"
  | "OFFER_TOKEN_REISSUED"
  | "OFFER_CONFIRMATION_SENT"
  | "OFFER_ERROR_REPORTED"

export type OfferEventSource = "lucrari" | "crm"
export type OfferEventActorType = "staff" | "portal_client" | "system"
export type OfferEvidenceDataTier = "legacy" | "complete"

export interface OfferEventRecord {
  type: OfferEventType
  source: OfferEventSource
  dataTier: "complete"
  lucrareId?: string | null
  opportunityId?: string | null
  offerId?: string | null
  actorId?: string | null
  actorType: OfferEventActorType
  status: string
  email?: string | null
  tokenHash?: string | null
  snapshotHash?: string | null
  messageId?: string | null
  ip?: string | null
  userAgent?: string | null
  referer?: string | null
  payload?: Record<string, unknown> | null
  emailBodyStoragePath?: string | null
  emailBodyHash?: string | null
  eventAt?: string | null
  eventHash?: string | null
  prevEventHash?: string | null
  hashVersion?: number
  integrityWarning?: string | null
  createdAt?: unknown
}

export interface OfferEvidenceTimelineItem {
  id: string
  type: OfferEventType | string
  label: string
  at: string | null
  dataTier: OfferEvidenceDataTier
  available: Record<string, unknown>
  missing?: string[]
  sourceRefs?: string[]
}

export interface OfferEvidenceSummary {
  sentAt?: string | null
  sentTo?: string[] | null
  acceptedAt?: string | null
  acceptedByEmail?: string | null
  rejectedAt?: string | null
  offerTotal?: number | null
  offerVersion?: string | null
  pdfUrl?: string | null
  messageId?: string | null
  statusOferta?: string | null
}

export interface OfferEvidencePack {
  source: OfferEventSource
  lucrareId?: string | null
  opportunityId?: string | null
  offerId?: string | null
  generatedAt: string
  summary: OfferEvidenceSummary
  timeline: OfferEvidenceTimelineItem[]
  missingGlobal?: string[]
  warnings?: string[]
  integrity?: {
    verified: boolean
    warnings: string[]
  }
  acceptedSnapshot?: Record<string, unknown> | null
}

export const OFFER_EVENT_LABELS: Record<string, string> = {
  OFFER_PREPARED: "Ofertă pregătită",
  OFFER_TOKEN_MINTED: "Link acțiune generat",
  OFFER_EMAIL_SENT: "Email ofertă trimis",
  OFFER_LINK_OPENED: "Link ofertă deschis",
  OFFER_CODE_SENT: "Cod validare trimis",
  OFFER_CODE_VERIFIED: "Cod validare confirmat",
  OFFER_ACCEPTED: "Ofertă acceptată",
  OFFER_REJECTED: "Ofertă refuzată",
  OFFER_TOKEN_REISSUED: "Link reemis",
  OFFER_CONFIRMATION_SENT: "Email confirmare trimis",
  OFFER_ERROR_REPORTED: "Eroare raportată (portal)",
}

export const LEGACY_MISSING_FIELDS = ["ip", "userAgent", "referer", "emailBody", "emailBodyHash", "snapshotHash"] as const
