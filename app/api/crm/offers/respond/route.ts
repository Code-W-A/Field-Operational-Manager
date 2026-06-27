import { NextResponse, type NextRequest } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import { CRM_COLLECTIONS, CRM_PIPELINE_STAGE_LABELS, isPipelineStageAllowedForOpportunityType } from "@/lib/crm/constants"
import { logOfferEvent } from "@/lib/offer/offer-events.server"

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

type RespondResult =
  | {
      kind: "success"
      offerId: string
      version: number
      opportunityId: string
      action: "accept" | "reject"
      actorId: string
      fromStage: string
      toStage: string | null
    }
  | {
      kind: "error"
      status: "invalid" | "used" | "expired" | "verification_required" | "verification_invalid"
      statusCode: number
      message: string
    }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const offerId = String(body?.offerId || "").trim()
    const token = String(body?.token || "").trim()
    const action = body?.action === "accept" || body?.action === "reject" ? body.action : null
    const reason = String(body?.reason || "").trim()
    const verificationProof = String(body?.verificationProof || "").trim()

    if (!offerId || !token || !action) {
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau nevalizi." }, { status: 400 })
    }
    if (!verificationProof) {
      return NextResponse.json(
        { status: "verification_required", message: "Este necesară reverificarea în doi pași." },
        { status: 403 }
      )
    }

    const now = new Date()
    const crypto = await import("crypto")
    const proofHash = crypto.createHash("sha256").update(verificationProof).digest("hex")
    const offerRef = adminDb.collection(CRM_COLLECTIONS.offers).doc(offerId)

    const txResult = await adminDb.runTransaction<RespondResult>(async (tx) => {
      const offerSnap = await tx.get(offerRef)
      if (!offerSnap.exists) {
        return { kind: "error", status: "invalid", statusCode: 404, message: "Oferta nu există." }
      }

      const offerData = offerSnap.data() as Record<string, unknown>
      if (String(offerData.actionToken || "") !== token) {
        return { kind: "error", status: "invalid", statusCode: 400, message: "Link invalid sau utilizat." }
      }

      if (offerData.actionUsedAt || offerData.status === "ACCEPTED" || offerData.status === "REJECTED") {
        return { kind: "error", status: "used", statusCode: 409, message: "Oferta a fost deja procesată." }
      }

      const actionExpiresAt = toDate(offerData.actionExpiresAt)
      if (actionExpiresAt && now.getTime() > actionExpiresAt.getTime()) {
        tx.update(offerRef, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() })
        return { kind: "error", status: "expired", statusCode: 410, message: "Link expirat." }
      }

      const verification = (offerData.verification || {}) as Record<string, unknown>
      const storedProofHash = String(verification.responseProofHash || "")
      const proofExpiresAt = toDate(verification.responseProofExpiresAt)
      const proofUsedAt = toDate(verification.responseProofUsedAt)

      if (!storedProofHash || !proofExpiresAt) {
        return {
          kind: "error",
          status: "verification_required",
          statusCode: 403,
          message: "Verificarea în doi pași trebuie refăcută.",
        }
      }
      if (proofUsedAt) {
        return {
          kind: "error",
          status: "verification_invalid",
          statusCode: 403,
          message: "Dovada de verificare a fost deja folosită.",
        }
      }
      if (Date.now() > proofExpiresAt.getTime()) {
        return {
          kind: "error",
          status: "verification_required",
          statusCode: 403,
          message: "Verificarea în doi pași a expirat. Solicită un cod nou.",
        }
      }
      if (storedProofHash !== proofHash) {
        return {
          kind: "error",
          status: "verification_invalid",
          statusCode: 403,
          message: "Dovada de verificare este invalidă.",
        }
      }

      const opportunityId = String(offerData.opportunityId || "")
      const opportunityRef = adminDb.collection(CRM_COLLECTIONS.opportunities).doc(opportunityId)
      const opportunitySnap = await tx.get(opportunityRef)
      const opportunityData = (opportunitySnap.data() || {}) as Record<string, unknown>
      const opportunityType = String(opportunityData.opportunityType || "")
      const fromStage = String(opportunityData.pipelineStage || "")
      const targetStage = action === "accept" ? "OFERTA_ACCEPTATA" : "OFERTA_REFUZATA"
      const canMoveStage = opportunitySnap.exists && isPipelineStageAllowedForOpportunityType(opportunityType, targetStage)

      tx.update(offerRef, {
        status: action === "accept" ? "ACCEPTED" : "REJECTED",
        response: {
          status: action,
          at: now,
          ...(reason && action === "reject" ? { reason } : {}),
          ...(verification.email ? { verifiedEmail: String(verification.email) } : {}),
        },
        actionUsedAt: now,
        "verification.responseProofUsedAt": now,
        updatedAt: FieldValue.serverTimestamp(),
      })

      if (canMoveStage) {
        tx.set(
          opportunityRef,
          {
            pipelineStage: targetStage,
            updatedAt: FieldValue.serverTimestamp(),
            updatedById: "__portal_client__",
          },
          { merge: true }
        )
      }

      return {
        kind: "success",
        offerId,
        version: Math.max(1, Number(offerData.version || 0)),
        opportunityId,
        action,
        actorId: "__portal_client__",
        fromStage,
        toStage: canMoveStage ? targetStage : null,
      }
    })

    if (txResult.kind === "error") {
      return NextResponse.json({ status: txResult.status, message: txResult.message }, { status: txResult.statusCode })
    }

    const activityType = txResult.action === "accept" ? "OFFER_ACCEPTED" : "OFFER_REJECTED"
    await adminDb.collection(CRM_COLLECTIONS.activityLogs).add({
      opportunityId: txResult.opportunityId,
      actorId: txResult.actorId,
      type: activityType,
      payload: {
        offerId: txResult.offerId,
        version: txResult.version,
        status: txResult.action,
        ...(reason && txResult.action === "reject" ? { reason } : {}),
      },
      visibility: "GENERAL",
      visibleToUserIds: [],
      createdAt: FieldValue.serverTimestamp(),
    })

    if (txResult.toStage) {
      await adminDb.collection(CRM_COLLECTIONS.activityLogs).add({
        opportunityId: txResult.opportunityId,
        actorId: txResult.actorId,
        type: "STAGE_CHANGED",
        payload: {
          from: txResult.fromStage,
          to: txResult.toStage,
          fromLabel: CRM_PIPELINE_STAGE_LABELS[txResult.fromStage] || txResult.fromStage,
          toLabel: CRM_PIPELINE_STAGE_LABELS[txResult.toStage] || txResult.toStage,
          lostReason: null,
        },
        visibility: "GENERAL",
        visibleToUserIds: [],
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    const offerSnapAfter = await adminDb.collection(CRM_COLLECTIONS.offers).doc(txResult.offerId).get()
    const offerDataAfter = (offerSnapAfter.data() || {}) as Record<string, unknown>
    await logOfferEvent(
      {
        type: txResult.action === "accept" ? "OFFER_ACCEPTED" : "OFFER_REJECTED",
        source: "crm",
        status: "success",
        offerId: txResult.offerId,
        opportunityId: txResult.opportunityId,
        actorType: "portal_client",
        email:
          String((offerDataAfter.response as Record<string, unknown> | undefined)?.verifiedEmail || "") ||
          String((offerDataAfter.verification as Record<string, unknown> | undefined)?.email || "") ||
          null,
        token,
        snapshot: txResult.action === "accept" ? offerDataAfter.snapshot : null,
        payload: {
          version: txResult.version,
          reason: txResult.action === "reject" ? reason || null : null,
        },
      },
      request,
    )

    return NextResponse.json({
      status: "success",
      message: txResult.action === "accept" ? "Oferta acceptată." : "Oferta refuzată.",
    })
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Eroare server la procesare." },
      { status: 500 }
    )
  }
}
