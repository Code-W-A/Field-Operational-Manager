import { auth } from "@/lib/firebase/config"
import type { CrmOffer, IssueCrmOfferInput, SaveCrmOfferDraftInput } from "@/lib/crm/types"

async function firebaseBearerHeader(): Promise<Record<string, string>> {
  const user = auth.currentUser
  if (!user) return {}
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

function normalizeOfferStatus(value: unknown): CrmOffer["status"] {
  if (value === "DRAFT" || value === "SENT" || value === "ACCEPTED" || value === "REJECTED" || value === "EXPIRED") {
    return value
  }
  return "DRAFT"
}

function mapOffer(docId: string, data: Record<string, unknown>): CrmOffer {
  return {
    id: docId,
    opportunityId: String(data.opportunityId || ""),
    version: Number(data.version || 0),
    status: normalizeOfferStatus(data.status),
    snapshot: (data.snapshot as CrmOffer["snapshot"]) || {
      products: [],
      vatPercent: 0,
      adjustmentPercent: 0,
      conditions: [],
      comments: "",
      subtotal: 0,
      total: 0,
    },
    recipientEmail: typeof data.recipientEmail === "string" ? data.recipientEmail : undefined,
    recipientName: typeof data.recipientName === "string" ? data.recipientName : undefined,
    subject: typeof data.subject === "string" ? data.subject : undefined,
    message: typeof data.message === "string" ? data.message : undefined,
    pdfUrl: typeof data.pdfUrl === "string" ? data.pdfUrl : undefined,
    pdfStoragePath: typeof data.pdfStoragePath === "string" ? data.pdfStoragePath : undefined,
    pdfFilename: typeof data.pdfFilename === "string" ? data.pdfFilename : undefined,
    pdfMime: typeof data.pdfMime === "string" ? data.pdfMime : undefined,
    pdfSize: typeof data.pdfSize === "number" ? data.pdfSize : undefined,
    actionToken: typeof data.actionToken === "string" ? data.actionToken : undefined,
    actionExpiresAt: (data.actionExpiresAt as CrmOffer["actionExpiresAt"]) || undefined,
    actionUsedAt: (data.actionUsedAt as CrmOffer["actionUsedAt"]) || undefined,
    verification: (data.verification as CrmOffer["verification"]) || undefined,
    response: (data.response as CrmOffer["response"]) || undefined,
    sentAt: (data.sentAt as CrmOffer["sentAt"]) || undefined,
    createdById: String(data.createdById || ""),
    createdAt: (data.createdAt as CrmOffer["createdAt"]) || undefined,
    updatedAt: (data.updatedAt as CrmOffer["updatedAt"]) || undefined,
  }
}

export async function listCrmOffers(opportunityId: string) {
  if (!opportunityId) return []

  const query = new URLSearchParams({ opportunityId })
  const response = await fetch(`/api/crm/offers?${query.toString()}`, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: await firebaseBearerHeader(),
  })

  const data = (await response.json().catch(() => null)) as
    | {
        ok?: boolean
        error?: string
        items?: Array<{ id: string } & Record<string, unknown>>
      }
    | null

  if (!response.ok || !data?.ok || !Array.isArray(data.items)) {
    throw new Error(data?.error || "Nu s-au putut încărca ofertele.")
  }

  return data.items.map((row) => mapOffer(String(row.id || ""), row))
}

export async function saveCrmOfferDraft(input: SaveCrmOfferDraftInput) {
  if (!input.opportunityId) throw new Error("opportunityId este obligatoriu")

  const response = await fetch("/api/crm/offers", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(await firebaseBearerHeader()) },
    body: JSON.stringify({
      offerId: input.offerId,
      opportunityId: input.opportunityId,
      snapshot: input.snapshot,
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName,
      subject: input.subject,
      message: input.message,
    }),
  })

  const data = (await response.json().catch(() => null)) as
    | {
        ok?: boolean
        error?: string
        offerId?: string
      }
    | null

  if (!response.ok || !data?.ok || !data.offerId) {
    throw new Error(data?.error || "Nu s-a putut salva draftul.")
  }

  return data.offerId
}

export async function issueCrmOffer(input: IssueCrmOfferInput) {
  if (!auth.currentUser) {
    throw new Error("Trebuie să fii autentificat pentru a emite oferta.")
  }
  const response = await fetch("/api/crm/offers/issue", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(await firebaseBearerHeader()) },
    body: JSON.stringify(input),
  })

  const data = (await response.json().catch(() => null)) as
    | {
        ok?: boolean
        error?: string
        offerId?: string
        version?: number
        publicUrl?: string
      }
    | null

  if (!response.ok || !data?.ok || !data.offerId) {
    throw new Error(data?.error || "Nu s-a putut emite oferta.")
  }

  return {
    offerId: data.offerId,
    version: Number(data.version || 0),
    publicUrl: String(data.publicUrl || ""),
  }
}
