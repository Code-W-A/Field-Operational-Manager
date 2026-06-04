import type { OfferPdfInput } from "@/lib/utils/offer-pdf"
import { formatPreparedDate } from "@/lib/work-documents/shared"

export type OfferPdfProductRow = {
  name?: string
  quantity?: number
  price?: number
}

export function buildOfferPdfInput(params: {
  lucrareId: string
  work: any
  fallbackWork?: any
  products: OfferPdfProductRow[]
  vatPercent: number
  adjustmentPercent: number
  preparedByFallback?: string
  /** Pentru teste; implicit `new Date()` ca la trimitere. */
  preparedAtDate?: Date
}): OfferPdfInput {
  const work = params.work || {}
  const fallback = params.fallbackWork || {}

  return {
    id: String(params.lucrareId),
    numarRaport: String(work?.numarRaport || fallback?.numarRaport || ""),
    offerNumber: Number(work?.offerSendCount || 0) + 1,
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
    conditions: Array.isArray(work?.conditiiOferta) ? work.conditiiOferta : undefined,
    equipmentName: String(work?.echipament || ""),
    locationName: String(work?.locatie || ""),
    preparedBy: String(
      work?.preluatDe || fallback?.preluatDe || params.preparedByFallback || "",
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

export function offerPdfAttachmentFileName(work: { numarRaport?: string; id?: string }, lucrareId: string): string {
  return `oferta_${String(work?.numarRaport || work?.id || lucrareId)}.pdf`
}

export function offerPdfPreviewFileName(work: { numarRaport?: string; id?: string }, lucrareId: string): string {
  return `oferta_${String(work?.numarRaport || work?.id || lucrareId)}_previzualizare.pdf`
}
