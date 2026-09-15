import type { OfferPdfInput } from "@/lib/utils/offer-pdf"
import { formatPreparedDate } from "@/lib/work-documents/shared"

export type OfferPdfProductRow = {
  name?: string
  quantity?: number
  price?: number
  total?: number
}

export type OfferVersionPdfSnapshot = {
  savedAt?: unknown
  savedBy?: string
  total?: number
  products?: OfferPdfProductRow[]
  vatPercent?: number
  adjustmentPercent?: number
  conditions?: string[]
}

export function buildOfferPdfInput(params: {
  lucrareId: string
  work: any
  fallbackWork?: any
  products: OfferPdfProductRow[]
  vatPercent: number
  adjustmentPercent: number
  preparedByFallback?: string
  preparedByOverride?: string
  offerNumber?: number
  conditions?: string[]
  /** Pentru teste sau versiuni istorice; implicit `new Date()` ca la trimitere. */
  preparedAtDate?: unknown
}): OfferPdfInput {
  const work = params.work || {}
  const fallback = params.fallbackWork || {}

  return {
    id: String(params.lucrareId),
    numarRaport: String(work?.numarRaport || fallback?.numarRaport || ""),
    offerNumber: typeof params.offerNumber === "number"
      ? params.offerNumber
      : Number(work?.offerSendCount || 0) + 1,
    client: work?.client || "",
    attentionTo: work?.persoanaContact || "",
    fromCompany: "NRG Access Systems SRL",
    products: (params.products || []).map((p) => ({
      name: p?.name || "",
      quantity: Number(p?.quantity || 0),
      price: Number(p?.price || 0),
    })),
    offerVAT: Number(params.vatPercent) || 0,
    adjustmentPercent: Number(params.adjustmentPercent) || 0,
    damages: [],
    conditions: Array.isArray(params.conditions)
      ? params.conditions
      : Array.isArray(work?.conditiiOferta)
        ? work.conditiiOferta
        : undefined,
    equipmentName: String(work?.echipament || ""),
    locationName: String(work?.locatie || ""),
    preparedBy: String(
      params.preparedByOverride || work?.preluatDe || fallback?.preluatDe || params.preparedByFallback || "",
    ),
    preparedAt: formatPreparedDate(params.preparedAtDate ?? new Date()),
    beneficiar: {
      name: String(work?.client || work?.clientInfo?.nume || ""),
      cui: String(work?.clientInfo?.cui || ""),
      reg: String(work?.clientInfo?.rc || ""),
      address: String(work?.clientInfo?.adresa || ""),
    },
  }
}

export function inferOfferVersionAdjustmentPercent(version: OfferVersionPdfSnapshot): number {
  if (typeof version.adjustmentPercent === "number" && Number.isFinite(version.adjustmentPercent)) {
    return version.adjustmentPercent
  }

  const subtotal = (version.products || []).reduce((sum, product) => {
    const rowTotal = Number(product?.total)
    return sum + (Number.isFinite(rowTotal) ? rowTotal : Number(product?.quantity || 0) * Number(product?.price || 0))
  }, 0)
  const savedTotal = Number(version.total)
  if (subtotal <= 0 || !Number.isFinite(savedTotal)) return 0

  const inferred = (1 - savedTotal / subtotal) * 100
  return Math.abs(inferred) < 0.000001 ? 0 : Math.round(inferred * 1_000_000) / 1_000_000
}

export function buildOfferVersionPdfInput(params: {
  lucrareId: string
  work: any
  fallbackWork?: any
  version: OfferVersionPdfSnapshot
  versionNumber: number
  fallbackVatPercent: number
}): OfferPdfInput {
  const { version } = params
  const vatPercent = typeof version.vatPercent === "number" && Number.isFinite(version.vatPercent)
    ? version.vatPercent
    : typeof params.work?.offerVAT === "number" && Number.isFinite(params.work.offerVAT)
      ? params.work.offerVAT
      : params.fallbackVatPercent

  return buildOfferPdfInput({
    lucrareId: params.lucrareId,
    work: params.work,
    fallbackWork: params.fallbackWork,
    products: version.products || [],
    vatPercent,
    adjustmentPercent: inferOfferVersionAdjustmentPercent(version),
    conditions: Array.isArray(version.conditions) ? version.conditions : params.work?.conditiiOferta,
    offerNumber: params.versionNumber,
    preparedByOverride: version.savedBy,
    preparedAtDate: version.savedAt,
  })
}

export function offerPdfAttachmentFileName(work: { numarRaport?: string; id?: string }, lucrareId: string): string {
  return `oferta_${String(work?.numarRaport || work?.id || lucrareId)}.pdf`
}

export function offerPdfPreviewFileName(work: { numarRaport?: string; id?: string }, lucrareId: string): string {
  return `oferta_${String(work?.numarRaport || work?.id || lucrareId)}_previzualizare.pdf`
}

export function offerPdfVersionFileName(
  work: { numarRaport?: string; id?: string },
  lucrareId: string,
  versionNumber: number,
): string {
  return `oferta_${String(work?.numarRaport || work?.id || lucrareId)}_versiunea_${versionNumber}.pdf`
}
