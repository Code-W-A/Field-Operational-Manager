import { adminDb } from "@/lib/firebase/admin"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import {
  LEGACY_MISSING_FIELDS,
  OFFER_EVENT_LABELS,
  type OfferEvidencePack,
  type OfferEvidenceSummary,
  type OfferEvidenceTimelineItem,
  type OfferEventType,
} from "@/lib/offer/evidence-types"
import { OFFER_EVENTS_COLLECTION } from "@/lib/offer/offer-events.server"

const DEDUP_WINDOW_MS = 5000

function toIso(value: unknown): string | null {
  if (!value) return null
  try {
    if (typeof (value as { toDate?: () => Date }).toDate === "function") {
      const d = (value as { toDate: () => Date }).toDate()
      return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }
    const d = new Date(value as string | number | Date)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  } catch {
    return null
  }
}

function toMs(value: unknown): number | null {
  const iso = toIso(value)
  return iso ? new Date(iso).getTime() : null
}

function compareTimelineAsc(a: OfferEvidenceTimelineItem, b: OfferEvidenceTimelineItem): number {
  const aMs = toMs(a.at)
  const bMs = toMs(b.at)
  if (aMs == null && bMs == null) return a.id.localeCompare(b.id)
  if (aMs == null) return 1
  if (bMs == null) return -1
  return aMs - bMs
}

function compareTimelineDesc(a: OfferEvidenceTimelineItem, b: OfferEvidenceTimelineItem): number {
  const aMs = toMs(a.at)
  const bMs = toMs(b.at)
  if (aMs == null && bMs == null) return a.id.localeCompare(b.id)
  if (aMs == null) return 1
  if (bMs == null) return -1
  return bMs - aMs
}

function sameAvailableString(a: OfferEvidenceTimelineItem, b: OfferEvidenceTimelineItem, key: string): boolean {
  const left = a.available[key]
  const right = b.available[key]
  return typeof left === "string" && left.trim() !== "" && left === right
}

function preferTimelineItem(a: OfferEvidenceTimelineItem, b: OfferEvidenceTimelineItem): OfferEvidenceTimelineItem {
  if (a.dataTier === "complete" && b.dataTier === "legacy") return a
  if (a.dataTier === "legacy" && b.dataTier === "complete") return b
  if (!a.at && b.at) return b
  if (a.at && !b.at) return a
  return a
}

function labelForType(type: string): string {
  return OFFER_EVENT_LABELS[type] || type
}

function legacyItem(params: {
  id: string
  type: OfferEventType | string
  at: unknown
  available: Record<string, unknown>
  sourceRefs?: string[]
  extraMissing?: string[]
}): OfferEvidenceTimelineItem {
  const presentKeys = new Set(Object.keys(params.available).filter((k) => params.available[k] != null && params.available[k] !== ""))
  const at = toIso(params.at)
  const missing = [
    ...LEGACY_MISSING_FIELDS.filter((f) => !presentKeys.has(f)),
    ...(at ? [] : ["timestamp"]),
    ...(params.extraMissing || []),
  ]
  return {
    id: params.id,
    type: params.type,
    label: labelForType(String(params.type)),
    at,
    dataTier: "legacy",
    available: params.available,
    missing: missing.length ? Array.from(new Set(missing)) : undefined,
    sourceRefs: params.sourceRefs,
  }
}

function completeItemFromEvent(docId: string, data: Record<string, unknown>): OfferEvidenceTimelineItem {
  const type = String(data.type || "unknown")
  const payload = (data.payload && typeof data.payload === "object" ? data.payload : {}) as Record<string, unknown>
  return {
    id: `offerEvents/${docId}`,
    type,
    label: labelForType(type),
    at: toIso(data.createdAt) || toIso(data.eventAt),
    dataTier: "complete",
    available: {
      status: data.status,
      email: data.email,
      messageId: data.messageId,
      ip: data.ip,
      userAgent: data.userAgent,
      referer: data.referer,
      tokenHash: data.tokenHash,
      snapshotHash: data.snapshotHash,
      emailBodyHash: data.emailBodyHash,
      eventHash: data.eventHash,
      prevEventHash: data.prevEventHash,
      hashVersion: data.hashVersion,
      integrityWarning: data.integrityWarning,
      actorId: data.actorId,
      actorType: data.actorType,
      ...payload,
    },
    sourceRefs: [`offerEvents/${docId}`],
  }
}

function dedupeTimeline(items: OfferEvidenceTimelineItem[]): OfferEvidenceTimelineItem[] {
  const sorted = [...items].sort(compareTimelineAsc)
  const kept: OfferEvidenceTimelineItem[] = []

  for (const item of sorted) {
    const duplicate = kept.find((existing) => {
      if (existing.type !== item.type) return false
      const existingMs = toMs(existing.at)
      const itemMs = toMs(item.at)
      const sameMessageId = sameAvailableString(existing, item, "messageId")
      const sameDatedEvent = existingMs != null && itemMs != null && Math.abs(existingMs - itemMs) <= DEDUP_WINDOW_MS
      if (!sameDatedEvent && !sameMessageId) return false

      const preferred = preferTimelineItem(existing, item)
      if (preferred !== existing) {
        const idx = kept.indexOf(existing)
        kept[idx] = preferred
      }
      return true
    })
    if (!duplicate) kept.push(item)
  }

  return kept.sort(compareTimelineDesc)
}

function buildIntegrity(items: OfferEvidenceTimelineItem[]) {
  const warnings: string[] = []
  const complete = [...items]
    .filter((item) => item.dataTier === "complete")
    .sort(compareTimelineAsc)

  let previousHash: string | null = null
  for (const item of complete) {
    const eventHash = typeof item.available.eventHash === "string" ? item.available.eventHash : ""
    const prevEventHash = typeof item.available.prevEventHash === "string" ? item.available.prevEventHash : null
    const source = item.sourceRefs?.[0] || item.id

    if (!eventHash) {
      warnings.push(`${source}: eveniment complet fără eventHash.`)
    }
    if (item.available.integrityWarning) {
      warnings.push(`${source}: ${String(item.available.integrityWarning)}`)
    }
    if (previousHash && prevEventHash && prevEventHash !== previousHash) {
      warnings.push(`${source}: prevEventHash nu corespunde evenimentului complet anterior din dosar.`)
    }
    if (eventHash) previousHash = eventHash
  }

  return { verified: warnings.length === 0, warnings }
}

function buildPackWarnings(params: {
  timeline: OfferEvidenceTimelineItem[]
  acceptedAt?: string | null
  acceptedSnapshot?: Record<string, unknown> | null
  sentAt?: string | null
}) {
  const warnings: string[] = []
  const hasComplete = params.timeline.some((item) => item.dataTier === "complete")
  const hasSent = params.timeline.some((item) => item.type === "OFFER_EMAIL_SENT")
  const hasAccepted = params.timeline.some((item) => item.type === "OFFER_ACCEPTED")

  if (!hasComplete) warnings.push("Dosarul este reconstruit doar din date istorice; lipsesc metadatele tehnice noi.")
  if (params.sentAt && !hasSent) warnings.push("Rezumatul indică o trimitere, dar timeline-ul nu are eveniment de email trimis.")
  if (params.acceptedAt && !hasAccepted) warnings.push("Rezumatul indică acceptare, dar timeline-ul nu are eveniment de acceptare.")
  if (params.acceptedAt && !params.acceptedSnapshot) warnings.push("Oferta este acceptată, dar snapshotul acceptat nu este disponibil.")
  const sentMs = toMs(params.sentAt)
  const acceptedMs = toMs(params.acceptedAt)
  if (sentMs != null && acceptedMs != null && sentMs > acceptedMs) {
    warnings.push("Ultima trimitere înregistrată este după acceptare; trimiterea inițială a ofertei acceptate nu are timestamp complet în datele istorice.")
  }

  return warnings
}

function buildSummaryFromWork(work: Record<string, unknown>): OfferEvidenceSummary {
  const lastOfferEmail = (work.lastOfferEmail || {}) as Record<string, unknown>
  const offerResponse = (work.offerResponse || {}) as Record<string, unknown>
  const acceptedSnapshot = (work.acceptedOfferSnapshot || work.offerActionSnapshot || null) as Record<string, unknown> | null

  return {
    sentAt: toIso(lastOfferEmail.sentAt),
    sentTo: Array.isArray(lastOfferEmail.to) ? (lastOfferEmail.to as string[]) : null,
    acceptedAt: offerResponse.status === "accept" ? toIso(offerResponse.at) : null,
    acceptedByEmail: offerResponse.status === "accept" ? String(offerResponse.verifiedEmail || "") || null : null,
    rejectedAt: offerResponse.status === "reject" ? toIso(offerResponse.at) : null,
    offerTotal:
      acceptedSnapshot && typeof acceptedSnapshot.total === "number"
        ? acceptedSnapshot.total
        : typeof work.offerTotal === "number"
          ? work.offerTotal
          : null,
    offerVersion: offerResponse.versionSavedAt ? String(offerResponse.versionSavedAt) : null,
    pdfUrl: (work.ofertaDocument as Record<string, unknown> | undefined)?.url
      ? String((work.ofertaDocument as Record<string, unknown>).url)
      : null,
    messageId: lastOfferEmail.messageId ? String(lastOfferEmail.messageId) : null,
    statusOferta: work.statusOferta ? String(work.statusOferta) : null,
  }
}

async function fetchOfferEventsByLucrare(lucrareId: string) {
  try {
    const snap = await adminDb
      .collection(OFFER_EVENTS_COLLECTION)
      .where("lucrareId", "==", lucrareId)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get()
    return snap.docs
  } catch {
    const snap = await adminDb.collection(OFFER_EVENTS_COLLECTION).where("lucrareId", "==", lucrareId).limit(200).get()
    return snap.docs.sort((a, b) => (toMs(b.data().createdAt) || 0) - (toMs(a.data().createdAt) || 0))
  }
}

async function fetchOfferEventsByOpportunity(opportunityId: string, offerId?: string) {
  try {
    if (offerId) {
      const snap = await adminDb
        .collection(OFFER_EVENTS_COLLECTION)
        .where("offerId", "==", offerId)
        .orderBy("createdAt", "desc")
        .limit(200)
        .get()
      return snap.docs
    }
    const snap = await adminDb
      .collection(OFFER_EVENTS_COLLECTION)
      .where("opportunityId", "==", opportunityId)
      .orderBy("createdAt", "desc")
      .limit(200)
      .get()
    return snap.docs
  } catch {
    const snap = await adminDb
      .collection(OFFER_EVENTS_COLLECTION)
      .where(offerId ? "offerId" : "opportunityId", "==", offerId || opportunityId)
      .limit(200)
      .get()
    return snap.docs.sort((a, b) => (toMs(b.data().createdAt) || 0) - (toMs(a.data().createdAt) || 0))
  }
}

export async function buildLucrariEvidencePack(lucrareId: string): Promise<OfferEvidencePack> {
  const workRef = adminDb.collection("lucrari").doc(lucrareId)
  const [workSnap, auditSnap, logsSnap, emailSnap, offerEventsDocs] = await Promise.all([
    workRef.get(),
    workRef.collection("offerAudit").orderBy("createdAt", "asc").limit(200).get().catch(() => null),
    adminDb
      .collection("logs")
      .where("lucrareId", "==", lucrareId)
      .where("categorie", "==", "Portal ofertă")
      .limit(100)
      .get()
      .catch(() => null),
    adminDb.collection("emailEvents").where("lucrareId", "==", lucrareId).limit(50).get().catch(() => null),
    fetchOfferEventsByLucrare(lucrareId),
  ])

  const work = (workSnap.exists ? workSnap.data() : {}) as Record<string, unknown>
  const timeline: OfferEvidenceTimelineItem[] = []

  for (const doc of offerEventsDocs) {
    timeline.push(completeItemFromEvent(doc.id, doc.data() as Record<string, unknown>))
  }

  const versions = Array.isArray(work.offerVersions) ? work.offerVersions : []
  versions.forEach((version, index) => {
    const v = version as Record<string, unknown>
    timeline.push(
      legacyItem({
        id: `offerVersions/${index}`,
        type: "OFFER_PREPARED",
        at: v.savedAt,
        available: {
          savedAt: toIso(v.savedAt),
          savedBy: v.savedBy,
          total: v.total,
          productsCount: Array.isArray(v.products) ? v.products.length : 0,
        },
        sourceRefs: [`lucrari/${lucrareId}.offerVersions[${index}]`],
      }),
    )
  })

  if (work.offerPreparedAt) {
    timeline.push(
      legacyItem({
        id: "offerPreparedAt",
        type: "OFFER_PREPARED",
        at: work.offerPreparedAt,
        available: {
          savedBy: work.offerPreparedBy,
          savedAt: toIso(work.offerPreparedAt),
        },
        sourceRefs: [`lucrari/${lucrareId}.offerPreparedAt`],
      }),
    )
  }

  if (emailSnap) {
    emailSnap.docs
      .filter((doc) => String(doc.data().type || "") === "OFFER")
      .forEach((doc) => {
        const data = doc.data()
        timeline.push(
          legacyItem({
            id: `emailEvents/${doc.id}`,
            type: "OFFER_EMAIL_SENT",
            at: data.createdAt || data.updatedAt,
            available: {
              to: data.to,
              subject: data.subject,
              status: data.status,
              messageId: data.messageId,
            },
            sourceRefs: [`emailEvents/${doc.id}`],
          }),
        )
      })
  }

  if (work.lastOfferEmail) {
    const last = work.lastOfferEmail as Record<string, unknown>
    timeline.push(
      legacyItem({
        id: "lastOfferEmail",
        type: "OFFER_EMAIL_SENT",
        at: last.sentAt,
        available: {
          to: last.to,
          status: last.status,
          messageId: last.messageId,
        },
        sourceRefs: [`lucrari/${lucrareId}.lastOfferEmail`],
      }),
    )
  }

  if (auditSnap) {
    auditSnap.docs.forEach((doc) => {
      const data = doc.data()
      const action = String(data.action || "")
      let type: OfferEventType | string = "OFFER_LINK_OPENED"
      if (action === "send-code") type = "OFFER_CODE_SENT"
      else if (action === "verify-code") type = "OFFER_CODE_VERIFIED"
      else if (action.startsWith("respond-accept")) type = "OFFER_ACCEPTED"
      else if (action.startsWith("respond-reject")) type = "OFFER_REJECTED"
      else if (action === "link-open") type = "OFFER_LINK_OPENED"

      timeline.push(
        legacyItem({
          id: `offerAudit/${doc.id}`,
          type,
          at: data.createdAt,
          available: {
            action: data.action,
            status: data.status,
            email: data.email,
            tokenPreview: data.tokenPreview,
            details: data.details,
          },
          sourceRefs: [`lucrari/${lucrareId}/offerAudit/${doc.id}`],
        }),
      )
    })
  }

  const verification = (work.offerActionVerification || {}) as Record<string, unknown>
  if (verification.codeSentAt) {
    timeline.push(
      legacyItem({
        id: "verification.codeSentAt",
        type: "OFFER_CODE_SENT",
        at: verification.codeSentAt,
        available: { email: verification.email, codeSentAt: toIso(verification.codeSentAt) },
        sourceRefs: [`lucrari/${lucrareId}.offerActionVerification`],
      }),
    )
  }
  if (verification.verifiedAt || verification.lastVerifiedAt) {
    timeline.push(
      legacyItem({
        id: "verification.verifiedAt",
        type: "OFFER_CODE_VERIFIED",
        at: verification.verifiedAt || verification.lastVerifiedAt,
        available: {
          email: verification.email,
          verifiedAt: toIso(verification.verifiedAt || verification.lastVerifiedAt),
        },
        sourceRefs: [`lucrari/${lucrareId}.offerActionVerification`],
      }),
    )
  }

  const responses = Array.isArray(work.offerResponsesHistory)
    ? work.offerResponsesHistory
    : work.offerResponse
      ? [work.offerResponse]
      : []

  responses.forEach((row, index) => {
    const r = row as Record<string, unknown>
    const status = String(r.status || "")
    if (status !== "accept" && status !== "reject") return
    timeline.push(
      legacyItem({
        id: `offerResponsesHistory/${index}`,
        type: status === "accept" ? "OFFER_ACCEPTED" : "OFFER_REJECTED",
        at: r.at,
        available: {
          email: r.verifiedEmail,
          versionSavedAt: r.versionSavedAt,
          reason: r.reason,
          offerSendCountAtResponse: r.offerSendCountAtResponse,
        },
        sourceRefs: [`lucrari/${lucrareId}.offerResponsesHistory[${index}]`],
      }),
    )
  })

  if (logsSnap) {
    logsSnap.docs.forEach((doc) => {
      const data = doc.data()
      const actiune = String(data.actiune || "")
      if (actiune.includes("Trimitere ofertă")) {
        timeline.push(
          legacyItem({
            id: `logs/${doc.id}`,
            type: "OFFER_EMAIL_SENT",
            at: data.timestamp || data.createdAt,
            available: {
              actor: data.utilizator,
              details: data.detalii,
            },
            sourceRefs: [`logs/${doc.id}`],
          }),
        )
      }
    })
  }

  const acceptedSnapshot = (work.acceptedOfferSnapshot || null) as Record<string, unknown> | null
  const deduped = dedupeTimeline(timeline)
  const summary = buildSummaryFromWork(work)
  const integrity = buildIntegrity(deduped)
  const warnings = [...buildPackWarnings({ timeline: deduped, acceptedAt: summary.acceptedAt, acceptedSnapshot, sentAt: summary.sentAt }), ...integrity.warnings]

  return {
    source: "lucrari",
    lucrareId,
    generatedAt: new Date().toISOString(),
    summary,
    timeline: deduped,
    missingGlobal: deduped.some((i) => i.dataTier === "complete")
      ? undefined
      : [...LEGACY_MISSING_FIELDS],
    warnings: warnings.length ? Array.from(new Set(warnings)) : undefined,
    integrity,
    acceptedSnapshot,
  }
}

function buildCrmSummary(offer: Record<string, unknown>): OfferEvidenceSummary {
  const response = (offer.response || {}) as Record<string, unknown>
  const snapshot = (offer.snapshot || {}) as Record<string, unknown>
  return {
    sentAt: toIso(offer.sentAt),
    sentTo: offer.recipientEmail ? [String(offer.recipientEmail)] : null,
    acceptedAt: response.status === "accept" ? toIso(response.at) : null,
    acceptedByEmail: response.status === "accept" ? String(response.verifiedEmail || "") || null : null,
    rejectedAt: response.status === "reject" ? toIso(response.at) : null,
    offerTotal: typeof snapshot.total === "number" ? snapshot.total : null,
    offerVersion: offer.version != null ? String(offer.version) : null,
    pdfUrl: offer.pdfUrl ? String(offer.pdfUrl) : null,
    messageId: null,
    statusOferta: offer.status ? String(offer.status) : null,
  }
}

export async function buildCrmOfferEvidencePack(offerId: string): Promise<OfferEvidencePack | null> {
  const offerSnap = await adminDb.collection(CRM_COLLECTIONS.offers).doc(offerId).get()
  if (!offerSnap.exists) return null

  const offer = offerSnap.data() as Record<string, unknown>
  const opportunityId = String(offer.opportunityId || "")
  const timeline: OfferEvidenceTimelineItem[] = []

  const offerEventsDocs = await fetchOfferEventsByOpportunity(opportunityId, offerId)
  for (const doc of offerEventsDocs) {
    timeline.push(completeItemFromEvent(doc.id, doc.data() as Record<string, unknown>))
  }

  if (offer.sentAt) {
    timeline.push(
      legacyItem({
        id: "crm_offer_sent",
        type: "OFFER_EMAIL_SENT",
        at: offer.sentAt,
        available: {
          recipientEmail: offer.recipientEmail,
          subject: offer.subject,
          version: offer.version,
          total: (offer.snapshot as Record<string, unknown> | undefined)?.total,
          pdfUrl: offer.pdfUrl,
        },
        sourceRefs: [`crm_offers/${offerId}`],
      }),
    )
  }

  const verification = (offer.verification || {}) as Record<string, unknown>
  if (verification.codeSentAt) {
    timeline.push(
      legacyItem({
        id: "crm_verification.codeSentAt",
        type: "OFFER_CODE_SENT",
        at: verification.codeSentAt,
        available: { email: verification.email },
        sourceRefs: [`crm_offers/${offerId}.verification`],
      }),
    )
  }
  if (verification.verifiedAt || verification.lastVerifiedAt) {
    timeline.push(
      legacyItem({
        id: "crm_verification.verifiedAt",
        type: "OFFER_CODE_VERIFIED",
        at: verification.verifiedAt || verification.lastVerifiedAt,
        available: { email: verification.email },
        sourceRefs: [`crm_offers/${offerId}.verification`],
      }),
    )
  }

  const response = (offer.response || {}) as Record<string, unknown>
  if (response.status === "accept" || response.status === "reject") {
    timeline.push(
      legacyItem({
        id: "crm_offer_response",
        type: response.status === "accept" ? "OFFER_ACCEPTED" : "OFFER_REJECTED",
        at: response.at,
        available: {
          email: response.verifiedEmail,
          reason: response.reason,
          version: offer.version,
        },
        sourceRefs: [`crm_offers/${offerId}.response`],
      }),
    )
  }

  const activitySnap = await adminDb
    .collection(CRM_COLLECTIONS.activityLogs)
    .where("opportunityId", "==", opportunityId)
    .limit(100)
    .get()
    .catch(() => null)

  if (activitySnap) {
    activitySnap.docs.forEach((doc) => {
      const data = doc.data()
      const type = String(data.type || "")
      if (!["OFFER_SENT", "OFFER_ACCEPTED", "OFFER_REJECTED"].includes(type)) return
      const payload = (data.payload || {}) as Record<string, unknown>
      if (payload.offerId && String(payload.offerId) !== offerId) return
      const mapped =
        type === "OFFER_SENT"
          ? "OFFER_EMAIL_SENT"
          : type === "OFFER_ACCEPTED"
            ? "OFFER_ACCEPTED"
            : "OFFER_REJECTED"
      timeline.push(
        legacyItem({
          id: `crm_activity/${doc.id}`,
          type: mapped,
          at: data.createdAt,
          available: { ...payload, actorId: data.actorId },
          sourceRefs: [`crm_activity_logs/${doc.id}`],
        }),
      )
    })
  }

  const deduped = dedupeTimeline(timeline)
  const summary = buildCrmSummary(offer)
  const acceptedSnapshot = response.status === "accept" ? ((offer.snapshot as Record<string, unknown>) ?? null) : null
  const integrity = buildIntegrity(deduped)
  const warnings = [
    ...buildPackWarnings({ timeline: deduped, acceptedAt: summary.acceptedAt, acceptedSnapshot, sentAt: summary.sentAt }),
    ...integrity.warnings,
  ]
  return {
    source: "crm",
    opportunityId,
    offerId,
    generatedAt: new Date().toISOString(),
    summary,
    timeline: deduped,
    missingGlobal: deduped.some((i) => i.dataTier === "complete") ? undefined : [...LEGACY_MISSING_FIELDS],
    warnings: warnings.length ? Array.from(new Set(warnings)) : undefined,
    integrity,
    acceptedSnapshot,
  }
}

export async function buildCrmOpportunityEvidencePack(opportunityId: string): Promise<OfferEvidencePack> {
  const offersSnap = await adminDb
    .collection(CRM_COLLECTIONS.offers)
    .where("opportunityId", "==", opportunityId)
    .limit(50)
    .get()

  const packs = await Promise.all(
    offersSnap.docs
      .filter((doc) => String(doc.data().status || "") !== "DRAFT")
      .map((doc) => buildCrmOfferEvidencePack(doc.id)),
  )

  const validPacks = packs.filter(Boolean) as OfferEvidencePack[]
  const timeline = dedupeTimeline(validPacks.flatMap((p) => p.timeline))

  const latestSent = validPacks
    .map((p) => p.summary.sentAt)
    .filter(Boolean)
    .sort()
    .reverse()[0]

  const acceptedPack = validPacks.find((p) => p.summary.acceptedAt)
  const packIntegrityWarnings = validPacks.flatMap((p) => p.integrity?.warnings || [])
  const integrity = { verified: packIntegrityWarnings.length === 0, warnings: Array.from(new Set(packIntegrityWarnings)) }
  const warnings = [
    ...validPacks.flatMap((p) => p.warnings || []),
    ...buildPackWarnings({
      timeline,
      acceptedAt: acceptedPack?.summary.acceptedAt,
      acceptedSnapshot: acceptedPack?.acceptedSnapshot || null,
      sentAt: latestSent || null,
    }),
  ]

  return {
    source: "crm",
    opportunityId,
    generatedAt: new Date().toISOString(),
    summary: acceptedPack?.summary || validPacks[0]?.summary || {},
    timeline,
    missingGlobal: timeline.some((i) => i.dataTier === "complete") ? undefined : [...LEGACY_MISSING_FIELDS],
    warnings: warnings.length ? Array.from(new Set(warnings)) : undefined,
    integrity,
    acceptedSnapshot: acceptedPack?.acceptedSnapshot || null,
  }
}
