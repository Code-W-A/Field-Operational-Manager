import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"

export async function POST(req: NextRequest) {
  try {
    const { lucrareId, token, action, reason } = await req.json()
    if (!lucrareId || !token || !action || (action !== "accept" && action !== "reject")) {
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau nevalizi." }, { status: 400 })
    }

    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) {
      return NextResponse.json({ status: "invalid", message: "Lucrarea nu există." }, { status: 404 })
    }
    const data: any = workSnap.data()

    if (!data.offerActionToken || data.offerActionToken !== token) {
      return NextResponse.json({ status: "invalid", message: "Link invalid sau utilizat." }, { status: 400 })
    }

    if (data.offerActionUsedAt) {
      return NextResponse.json({ status: "used", message: "Oferta a fost deja acceptată sau refuzată." }, { status: 409 })
    }

    const exp = data.offerActionExpiresAt ? (
      typeof data.offerActionExpiresAt.toDate === "function" ? data.offerActionExpiresAt.toDate() : new Date(data.offerActionExpiresAt)
    ) : null
    if (exp && Date.now() > exp.getTime()) {
      return NextResponse.json({ status: "expired", message: "Link expirat." }, { status: 410 })
    }

    const update: Record<string, any> = {
      offerResponse: { status: action, at: new Date(), ...(action === "reject" && reason ? { reason } : {}) },
      offerActionUsedAt: new Date(),
    }
    // Păstrăm logica existentă pentru statusOferta și snapshot de ofertă acceptată
    if (action === "accept") {
      update.statusOferta = "OFERTAT"
      update.acceptedOfferSnapshot = data?.offerActionSnapshot || null
      update.offerActionVersionSavedAt = data?.offerActionSnapshot?.savedAt || data?.offerActionVersionSavedAt || null
    } else {
      update.statusOferta = "DA"
    }

    await workRef.update(update)
    return NextResponse.json({ status: "success", message: action === "accept" ? "Oferta acceptată." : "Oferta refuzată." })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        message: "Eroare server la procesare.",
        error: { message: String(error?.message || error), code: error?.code, name: error?.name, stack: error?.stack },
      },
      { status: 500 }
    )
  }
}


