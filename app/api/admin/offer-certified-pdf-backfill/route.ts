import { NextResponse, type NextRequest } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { adminDb } from "@/lib/firebase/admin"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import { generateCertifiedCrmOfferPdf, generateCertifiedLucrariOfferPdf } from "@/lib/offer/certified-pdf.server"

type BackfillResult = {
  checked: number
  generated: number
  skipped: number
  failed: Array<{ id: string; reason: string }>
}

function hasCertifiedPdf(data: Record<string, any>) {
  return Boolean(data?.responseCertifiedPdf?.storagePath)
}

async function backfillLucrari(limit: number): Promise<BackfillResult> {
  const result: BackfillResult = { checked: 0, generated: 0, skipped: 0, failed: [] }
  const statuses: Array<"accept" | "reject"> = ["accept", "reject"]
  for (const status of statuses) {
    const snap = await adminDb.collection("lucrari").where("offerResponse.status", "==", status).limit(limit).get()
    for (const doc of snap.docs) {
      result.checked += 1
      const data = doc.data() as Record<string, any>
      if (hasCertifiedPdf(data)) {
        result.skipped += 1
        continue
      }
      if (!data.acceptedOfferSnapshot && !data.offerActionSnapshot) {
        result.skipped += 1
        result.failed.push({ id: doc.id, reason: "snapshot_lipsa" })
        continue
      }
      try {
        const responseCertifiedPdf = await generateCertifiedLucrariOfferPdf({
          lucrareId: doc.id,
          work: data,
          action: status,
        })
        if (!responseCertifiedPdf) {
          result.skipped += 1
          result.failed.push({ id: doc.id, reason: "pdf_negenerat_fara_produse" })
          continue
        }
        await doc.ref.set(
          {
            responseCertifiedPdf,
            offerPipelineStage: status === "accept" ? "OFERTA_ACCEPTATA" : "OFERTA_REFUZATA",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        )
        result.generated += 1
      } catch (error) {
        result.failed.push({ id: doc.id, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  return result
}

async function backfillCrm(limit: number): Promise<BackfillResult> {
  const result: BackfillResult = { checked: 0, generated: 0, skipped: 0, failed: [] }
  const statuses: Array<"ACCEPTED" | "REJECTED"> = ["ACCEPTED", "REJECTED"]
  for (const status of statuses) {
    const snap = await adminDb.collection(CRM_COLLECTIONS.offers).where("status", "==", status).limit(limit).get()
    for (const doc of snap.docs) {
      result.checked += 1
      const data = doc.data() as Record<string, any>
      if (hasCertifiedPdf(data)) {
        result.skipped += 1
        continue
      }
      if (!data.snapshot) {
        result.skipped += 1
        result.failed.push({ id: doc.id, reason: "snapshot_lipsa" })
        continue
      }
      try {
        const opportunityId = String(data.opportunityId || "")
        const opportunitySnap = opportunityId ? await adminDb.collection(CRM_COLLECTIONS.opportunities).doc(opportunityId).get() : null
        const responseCertifiedPdf = await generateCertifiedCrmOfferPdf({
          offerId: doc.id,
          opportunity: opportunitySnap?.exists ? { id: opportunitySnap.id, ...opportunitySnap.data() } : {},
          offer: { id: doc.id, ...data },
          action: status === "ACCEPTED" ? "accept" : "reject",
        })
        if (!responseCertifiedPdf) {
          result.skipped += 1
          result.failed.push({ id: doc.id, reason: "pdf_negenerat_fara_produse" })
          continue
        }
        await doc.ref.set({ responseCertifiedPdf, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        result.generated += 1
      } catch (error) {
        result.failed.push({ id: doc.id, reason: error instanceof Error ? error.message : String(error) })
      }
    }
  }
  return result
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["admin"], request)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const target = body.target === "crm" || body.target === "lucrari" || body.target === "all" ? body.target : "all"
    const limit = Math.min(Math.max(Number(body.limit || 25), 1), 100)

    const lucrari = target === "crm" ? null : await backfillLucrari(limit)
    const crm = target === "lucrari" ? null : await backfillCrm(limit)
    return NextResponse.json({ ok: true, target, limit, lucrari, crm })
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backfill PDF dovadă eșuat" },
      { status: 500 },
    )
  }
}
