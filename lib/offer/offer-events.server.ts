import type { NextRequest } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import type { OfferEventActorType, OfferEventSource, OfferEventType } from "@/lib/offer/evidence-types"
import {
  buildOfferEventDocument,
  hashOfferEmailBody,
  hashOfferSnapshot,
} from "@/lib/offer/offer-event-integrity"
import { extractOfferRequestMeta } from "@/lib/offer/request-meta.server"

export const OFFER_EVENTS_COLLECTION = "offerEvents"
export { hashOfferEmailBody, hashOfferSnapshot } from "@/lib/offer/offer-event-integrity"

export type LogOfferEventInput = {
  type: OfferEventType
  source: OfferEventSource
  status?: string
  lucrareId?: string | null
  opportunityId?: string | null
  offerId?: string | null
  actorId?: string | null
  actorType?: OfferEventActorType
  email?: string | null
  token?: string | null
  snapshot?: unknown
  messageId?: string | null
  payload?: Record<string, unknown> | null
  emailBodyHtml?: string | null
  emailBodyStoragePath?: string | null
  ip?: string | null
  userAgent?: string | null
  referer?: string | null
  integrityWarning?: string | null
}

async function findPreviousEventHash(input: LogOfferEventInput): Promise<{ hash: string | null; warning: string | null }> {
  const candidates: Array<["offerId" | "lucrareId" | "opportunityId", string | null | undefined]> = [
    ["offerId", input.offerId],
    ["lucrareId", input.lucrareId],
    ["opportunityId", input.opportunityId],
  ]
  const candidate = candidates.find(([, value]) => typeof value === "string" && value.trim())
  if (!candidate) return { hash: null, warning: "Nu există identificator de entitate pentru hash-chain." }

  try {
    const [field, value] = candidate
    const snap = await adminDb
      .collection(OFFER_EVENTS_COLLECTION)
      .where(field, "==", String(value).trim())
      .orderBy("createdAt", "desc")
      .limit(1)
      .get()
    const hash = snap.docs[0]?.data()?.eventHash
    return { hash: typeof hash === "string" && hash ? hash : null, warning: null }
  } catch (error) {
    console.warn("[offer/events] Previous hash lookup failed", error)
    return { hash: null, warning: "Nu s-a putut citi evenimentul anterior pentru hash-chain." }
  }
}

export async function logOfferEvent(input: LogOfferEventInput, request?: NextRequest | null): Promise<string | null> {
  try {
    const requestMeta = extractOfferRequestMeta(request)
    const prev = await findPreviousEventHash(input)
    const integrityWarning = [input.integrityWarning, prev.warning].filter(Boolean).join(" | ") || null
  const eventInput = integrityWarning ? { ...input, integrityWarning } : input
    const doc = {
      ...(await buildOfferEventDocument(eventInput, requestMeta, prev.hash, new Date().toISOString())),
      createdAt: FieldValue.serverTimestamp(),
    }

    const ref = await adminDb.collection(OFFER_EVENTS_COLLECTION).add(doc)
    return ref.id
  } catch (error) {
    console.warn("[offer/events] Logging failed", error)
    return null
  }
}
