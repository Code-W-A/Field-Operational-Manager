import { NextResponse, type NextRequest } from "next/server"
import { getStorage } from "firebase-admin/storage"
import { adminApp, adminDb } from "@/lib/firebase/admin"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { hasOpportunityViewAccess } from "@/lib/crm/access"

function safeFilename(value: string) {
  return String(value || "oferta-dovada.pdf").replace(/[\r\n"]/g, "_").slice(0, 180)
}

async function canViewOpportunity(opportunityId: string, userId: string) {
  const [opportunitySnap, accessRows] = await Promise.all([
    adminDb.collection(CRM_COLLECTIONS.opportunities).doc(opportunityId).get(),
    adminDb
      .collection(CRM_COLLECTIONS.opportunityAccess)
      .where("opportunityId", "==", opportunityId)
      .where("userId", "==", userId)
      .limit(5)
      .get(),
  ])
  if (!opportunitySnap.exists) return false
  const data = opportunitySnap.data() as Record<string, unknown>
  const opportunity = {
    ownerId: String(data.ownerId || ""),
    readUserIds: Array.isArray(data.readUserIds) ? (data.readUserIds as string[]) : [],
    editUserIds: Array.isArray(data.editUserIds) ? (data.editUserIds as string[]) : [],
  }
  const permissions = accessRows.docs.map((row) => String(row.data().permission || "VIEW"))
  return hasOpportunityViewAccess(opportunity, userId, permissions as ("VIEW" | "EDIT")[])
}

export async function GET(request: NextRequest, context: { params: Promise<{ offerId: string }> }) {
  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], request)
    if (!session.uid) return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })

    const { offerId: rawOfferId } = await context.params
    const offerId = String(rawOfferId || "").trim()
    if (!offerId) return NextResponse.json({ error: "offerId lipsă" }, { status: 400 })

    const offerSnap = await adminDb.collection(CRM_COLLECTIONS.offers).doc(offerId).get()
    if (!offerSnap.exists) return NextResponse.json({ error: "Oferta nu există" }, { status: 404 })
    const offer = offerSnap.data() as Record<string, any>
    const opportunityId = String(offer.opportunityId || "").trim()
    if (!opportunityId || !(await canViewOpportunity(opportunityId, session.uid))) {
      return NextResponse.json({ error: "Oportunitatea nu există sau nu ai acces la ea." }, { status: 404 })
    }

    const pdf = offer.responseCertifiedPdf || {}
    const storagePath = String(pdf.storagePath || "").trim()
    if (!storagePath) return NextResponse.json({ error: "PDF dovadă indisponibil" }, { status: 404 })

    const envBucket = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim()
    const storage = getStorage(adminApp)
    const bucket = envBucket ? storage.bucket(envBucket) : storage.bucket()
    const fileRef = bucket.file(storagePath)
    const [exists] = await fileRef.exists()
    if (!exists) return NextResponse.json({ error: "Fișierul nu există în Storage" }, { status: 404 })

    const filename = safeFilename(String(pdf.filename || `oferta-dovada-${offerId}.pdf`))
    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      version: "v4",
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: `inline; filename="${filename}"`,
    })

    return NextResponse.redirect(signedUrl, 302)
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Eroare la descărcarea PDF-ului dovadă" },
      { status: 500 },
    )
  }
}
