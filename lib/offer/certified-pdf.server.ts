import { getStorage } from "firebase-admin/storage"
import { adminApp } from "@/lib/firebase/admin"
import { formatOfferResponseProofText, generateOfferPdf, type OfferPdfInput, type OfferResponseProof } from "@/lib/utils/offer-pdf"
import { toOfferPdfItems } from "@/lib/offer/offer-pdf-items"
import type { OfferResponseCertifiedPdf } from "@/lib/offer/evidence-types"

function toIso(value: unknown): string {
  try {
    if (value && typeof (value as { toDate?: () => Date }).toDate === "function") {
      return (value as { toDate: () => Date }).toDate().toISOString()
    }
    const date = value instanceof Date ? value : new Date(value as string | number | Date)
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function safeFilePart(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80) || "oferta"
}

const mapProducts = toOfferPdfItems

function formatPreparedDate(value: unknown): string {
  const date = value ? new Date(toIso(value)) : new Date()
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`
}

async function uploadCertifiedPdf(params: {
  blob: Blob
  storagePath: string
  filename: string
}): Promise<{ storagePath: string; filename: string; mime: "application/pdf"; size: number }> {
  const buffer = Buffer.from(await params.blob.arrayBuffer())
  const envBucket = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim()
  const storage = getStorage(adminApp)
  const bucket = envBucket ? storage.bucket(envBucket) : storage.bucket()
  await bucket.file(params.storagePath).save(buffer, {
    metadata: {
      contentType: "application/pdf",
      contentDisposition: `inline; filename="${params.filename.replace(/"/g, "_")}"`,
    },
    resumable: false,
  })
  return {
    storagePath: params.storagePath,
    filename: params.filename,
    mime: "application/pdf",
    size: buffer.length,
  }
}

export function buildCertifiedPdfRecord(params: {
  action: "accept" | "reject"
  actedAt: unknown
  verifiedEmail: string
  reason?: string
  storagePath: string
  filename: string
  size: number
  sourceVersion?: string
}): OfferResponseCertifiedPdf {
  const proof: OfferResponseProof = {
    action: params.action,
    actedAt: toIso(params.actedAt),
    verifiedEmail: params.verifiedEmail,
    reason: params.reason,
  }
  return {
    action: params.action,
    actedAt: toIso(params.actedAt),
    verifiedEmail: params.verifiedEmail,
    reason: params.reason || undefined,
    renderedProofText: formatOfferResponseProofText(proof),
    storagePath: params.storagePath,
    filename: params.filename,
    mime: "application/pdf",
    size: params.size,
    generatedAt: new Date().toISOString(),
    sourceVersion: params.sourceVersion || undefined,
  }
}

export async function generateCertifiedLucrariOfferPdf(params: {
  lucrareId: string
  work: Record<string, any>
  action: "accept" | "reject"
}): Promise<OfferResponseCertifiedPdf | null> {
  const work = params.work || {}
  const response = work.offerResponse || {}
  const snapshot = work.acceptedOfferSnapshot || work.offerActionSnapshot || null
  const products = mapProducts(snapshot?.products || work.products)
  if (!products.length) return null

  const actedAt = response.at || work.offerActionUsedAt || new Date()
  const verifiedEmail = String(response.verifiedEmail || work.offerActionVerification?.email || "").trim().toLowerCase()
  const sourceVersion = String(response.versionSavedAt || snapshot?.savedAt || work.offerActionVersionSavedAt || "").trim()
  const input: OfferPdfInput = {
    id: params.lucrareId,
    numarRaport: String(work.numarRaport || work.nrLucrare || ""),
    offerNumber: Number(work.offerSendCount || 0) || undefined,
    client: String(work.client || work.clientInfo?.nume || ""),
    attentionTo: String(work.persoanaContact || ""),
    fromCompany: "NRG Access Systems SRL",
    products,
    offerVAT: Number(snapshot?.vat ?? work.offerVAT ?? 0),
    adjustmentPercent: Number(snapshot?.adjustmentPercent ?? work.offerAdjustmentPercent ?? 0),
    conditions: Array.isArray(work.conditiiOferta) ? work.conditiiOferta : undefined,
    equipmentName: String(work.echipament || ""),
    locationName: String(work.locatie || ""),
    preparedBy: String(work.offerPreparedBy || work.preluatDe || ""),
    preparedAt: formatPreparedDate(work.offerPreparedAt || sourceVersion || new Date()),
    beneficiar: {
      name: String(work.client || work.clientInfo?.nume || ""),
      cui: String(work.clientInfo?.cui || ""),
      reg: String(work.clientInfo?.rc || ""),
      address: String(work.clientInfo?.adresa || ""),
    },
    responseProof: {
      action: params.action,
      actedAt: toIso(actedAt),
      verifiedEmail,
      reason: params.action === "reject" ? String(response.reason || "").trim() || undefined : undefined,
    },
  }

  const blob = await generateOfferPdf(input)
  const fileBase = safeFilePart(work.numarRaport || work.nrLucrare || params.lucrareId)
  const filename = `oferta_dovada_${fileBase}_${params.action}.pdf`
  const storagePath = `tichete/${params.lucrareId}/oferta-dovada/${Date.now()}_${filename}`
  const uploaded = await uploadCertifiedPdf({ blob, filename, storagePath })
  return buildCertifiedPdfRecord({
    action: params.action,
    actedAt,
    verifiedEmail,
    reason: input.responseProof?.reason,
    storagePath: uploaded.storagePath,
    filename: uploaded.filename,
    size: uploaded.size,
    sourceVersion,
  })
}

export async function generateCertifiedCrmOfferPdf(params: {
  offerId: string
  opportunity: Record<string, any>
  offer: Record<string, any>
  action: "accept" | "reject"
}): Promise<OfferResponseCertifiedPdf | null> {
  const offer = params.offer || {}
  const opportunity = params.opportunity || {}
  const response = offer.response || {}
  const snapshot = offer.snapshot || {}
  const products = mapProducts(snapshot.products)
  if (!products.length) return null

  const actedAt = response.at || offer.actionUsedAt || new Date()
  const verifiedEmail = String(response.verifiedEmail || offer.verification?.email || "").trim().toLowerCase()
  const sourceVersion = offer.version != null ? String(offer.version) : ""
  const input: OfferPdfInput = {
    id: params.offerId,
    numarRaport: String(opportunity.code || opportunity.internalCode || params.offerId),
    offerNumber: Number(offer.version || 0) || undefined,
    client: String(opportunity.clientName || opportunity.title || ""),
    attentionTo: String(offer.recipientName || ""),
    fromCompany: "NRG Access Systems SRL",
    products,
    optionalProducts: mapProducts(snapshot.optionalProducts),
    offerVAT: Number(snapshot.vatPercent || 0),
    adjustmentPercent: Number(snapshot.adjustmentPercent || 0),
    conditions: Array.isArray(snapshot.conditions) ? snapshot.conditions : undefined,
    locationName: String(opportunity.displayTitle || opportunity.title || ""),
    preparedBy: String(offer.createdByName || offer.createdById || ""),
    preparedAt: formatPreparedDate(offer.sentAt || offer.createdAt || new Date()),
    beneficiar: {
      name: String(opportunity.clientName || opportunity.title || ""),
      cui: String(opportunity.clientCui || ""),
      address: String(opportunity.clientAddress || ""),
    },
    responseProof: {
      action: params.action,
      actedAt: toIso(actedAt),
      verifiedEmail,
      reason: params.action === "reject" ? String(response.reason || "").trim() || undefined : undefined,
    },
  }

  const blob = await generateOfferPdf(input)
  const fileBase = safeFilePart(opportunity.code || params.offerId)
  const filename = `crm_oferta_dovada_${fileBase}_v${sourceVersion || "1"}_${params.action}.pdf`
  const storagePath = `crm/opportunities/${String(offer.opportunityId || params.opportunity.id || "unknown")}/offer-certified/${Date.now()}_${filename}`
  const uploaded = await uploadCertifiedPdf({ blob, filename, storagePath })
  return buildCertifiedPdfRecord({
    action: params.action,
    actedAt,
    verifiedEmail,
    reason: input.responseProof?.reason,
    storagePath: uploaded.storagePath,
    filename: uploaded.filename,
    size: uploaded.size,
    sourceVersion,
  })
}
