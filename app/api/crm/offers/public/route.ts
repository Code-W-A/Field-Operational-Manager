import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"

function toDate(value: unknown): Date | null {
  if (!value) return null
  try {
    if (typeof (value as { toDate?: () => Date }).toDate === "function") {
      const date = (value as { toDate: () => Date }).toDate()
      return Number.isNaN(date.getTime()) ? null : date
    }
    const date = new Date(value as string | number | Date)
    return Number.isNaN(date.getTime()) ? null : date
  } catch {
    return null
  }
}

type PublicStatus = "ready" | "used" | "expired" | "invalid"

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const offerId = String(params.get("offerId") || "").trim()
    const token = String(params.get("token") || "").trim()

    if (!offerId || !token) {
      return NextResponse.json(
        { status: "invalid", message: "Parametri lipsă sau nevalizi." },
        { status: 400 }
      )
    }

    const offerRef = adminDb.collection(CRM_COLLECTIONS.offers).doc(offerId)
    const offerSnap = await offerRef.get()
    if (!offerSnap.exists) {
      return NextResponse.json(
        { status: "invalid", message: "Oferta nu a fost găsită." },
        { status: 404 }
      )
    }

    const data = offerSnap.data() as Record<string, unknown>
    if (String(data.actionToken || "") !== token) {
      return NextResponse.json(
        { status: "invalid", message: "Link invalid. Contactați operatorul." },
        { status: 400 }
      )
    }

    let status: PublicStatus = "ready"
    let message = ""
    if (data.actionUsedAt || data.status === "ACCEPTED" || data.status === "REJECTED") {
      status = "used"
      message = "Oferta a fost deja acceptată sau refuzată."
    } else {
      const expiresAt = toDate(data.actionExpiresAt)
      if (expiresAt && Date.now() > expiresAt.getTime()) {
        status = "expired"
        message = "Link expirat. Contactați operatorul pentru o ofertă nouă."
      }
    }

    return NextResponse.json({
      status,
      message,
      offer: {
        id: offerSnap.id,
        opportunityId: String(data.opportunityId || ""),
        version: Number(data.version || 0),
        offerStatus: String(data.status || ""),
        subject: String(data.subject || ""),
        message: String(data.message || ""),
        recipientEmail: String(data.recipientEmail || ""),
        pdfUrl: String(data.pdfUrl || ""),
        snapshot: data.snapshot || null,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "invalid",
        message: error instanceof Error ? error.message : "Eroare server.",
      },
      { status: 500 }
    )
  }
}
