import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"

function toDate(value: any): Date | null {
  if (!value) return null
  try {
    if (typeof value?.toDate === "function") {
      const d = value.toDate()
      return Number.isNaN(d.getTime()) ? null : d
    }
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

type RespondTxResult =
  | { kind: "success"; action: "accept" | "reject" }
  | {
      kind: "error"
      status: "invalid" | "used" | "expired" | "verification_required" | "verification_invalid"
      statusCode: number
      message: string
    }

export async function POST(req: NextRequest) {
  try {
    const { lucrareId, token, action, reason, verificationProof } = await req.json()
    const workId = String(lucrareId || "").trim()
    const providedToken = String(token || "").trim()
    const finalAction = action as "accept" | "reject"
    const proof = String(verificationProof || "").trim()

    if (!workId || !providedToken || !finalAction || (finalAction !== "accept" && finalAction !== "reject")) {
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau nevalizi." }, { status: 400 })
    }

    if (!proof) {
      return NextResponse.json(
        { status: "verification_required", message: "Este necesară reverificarea în doi pași." },
        { status: 403 },
      )
    }

    const crypto = await import("crypto")
    const proofHash = crypto.createHash("sha256").update(proof).digest("hex")
    const workRef = adminDb.collection("lucrari").doc(workId)

    const txResult = await adminDb.runTransaction<RespondTxResult>(async (tx) => {
      const workSnap = await tx.get(workRef)
      if (!workSnap.exists) {
        return { kind: "error", status: "invalid", statusCode: 404, message: "Lucrarea nu există." }
      }

      const data: any = workSnap.data() || {}
      if (!data.offerActionToken || data.offerActionToken !== providedToken) {
        return { kind: "error", status: "invalid", statusCode: 400, message: "Link invalid sau utilizat." }
      }

      if (data.offerActionUsedAt) {
        return {
          kind: "error",
          status: "used",
          statusCode: 409,
          message: "Oferta a fost deja acceptată sau refuzată.",
        }
      }

      const exp = toDate(data.offerActionExpiresAt)
      if (exp && Date.now() > exp.getTime()) {
        return { kind: "error", status: "expired", statusCode: 410, message: "Link expirat." }
      }

      const verification = data?.offerActionVerification || {}
      const storedProofHash = typeof verification?.responseProofHash === "string" ? verification.responseProofHash : ""
      const proofExpiresAt = toDate(verification?.responseProofExpiresAt)
      const proofUsedAt = toDate(verification?.responseProofUsedAt)

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
          message: "Dovada de verificare a fost deja folosită. Reverifică emailul și codul.",
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
          message: "Dovada de verificare este invalidă. Reverifică emailul și codul.",
        }
      }

      const verifiedEmail = typeof verification?.email === "string" ? verification.email : ""
      const now = new Date()
      const update: Record<string, any> = {
        offerResponse: {
          status: finalAction,
          at: now,
          ...(verifiedEmail ? { verifiedEmail } : {}),
          ...(finalAction === "reject" && reason ? { reason } : {}),
        },
        offerActionUsedAt: now,
        "offerActionVerification.responseProofUsedAt": now,
      }

      if (finalAction === "accept") {
        update.statusOferta = "OFERTAT"
        update.acceptedOfferSnapshot = data?.offerActionSnapshot || null
        update.offerActionVersionSavedAt = data?.offerActionSnapshot?.savedAt || data?.offerActionVersionSavedAt || null
      } else {
        update.statusOferta = "DA"
      }

      tx.update(workRef, update)
      return { kind: "success", action: finalAction }
    })

    if (txResult.kind === "error") {
      return NextResponse.json({ status: txResult.status, message: txResult.message }, { status: txResult.statusCode })
    }

    return NextResponse.json({
      status: "success",
      message: txResult.action === "accept" ? "Oferta acceptată." : "Oferta refuzată.",
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        message: "Eroare server la procesare.",
        error: { message: String(error?.message || error), code: error?.code, name: error?.name, stack: error?.stack },
      },
      { status: 500 },
    )
  }
}
