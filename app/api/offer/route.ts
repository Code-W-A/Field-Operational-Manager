import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { logOfferPortalEvent } from "@/lib/offer/portal-audit"

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

type OfferPageStatus = "ready" | "used" | "expired" | "invalid"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workId = String(searchParams.get("lucrareId") || "").trim()
    const providedToken = String(searchParams.get("token") || "").trim()

    if (!workId || !providedToken) {
      await logOfferPortalEvent({
        lucrareId: workId || undefined,
        action: "link-open",
        status: "invalid",
        token: providedToken,
        details: "Parametri lipsă sau nevalizi.",
        meta: { route: "/api/offer", reason: "missing_params" },
      })
      return NextResponse.json(
        { status: "invalid", message: "Parametri lipsă sau nevalizi." },
        { status: 400 },
      )
    }

    const workRef = adminDb.collection("lucrari").doc(workId)
    const workSnap = await workRef.get()
    if (!workSnap.exists) {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "link-open",
        status: "invalid",
        token: providedToken,
        details: "Lucrarea nu a fost găsită.",
        meta: { route: "/api/offer", reason: "work_not_found" },
      })
      return NextResponse.json(
        { status: "invalid", message: "Lucrarea nu a fost găsită." },
        { status: 404 },
      )
    }

    const data: any = workSnap.data() || {}
    if (!data.offerActionToken || data.offerActionToken !== providedToken) {
      await logOfferPortalEvent({
        lucrareId: workId,
        action: "link-open",
        status: "invalid",
        token: providedToken,
        details: "Token invalid sau depășit.",
        meta: { route: "/api/offer", reason: "token_mismatch" },
      })
      return NextResponse.json(
        { status: "invalid", message: "Link invalid. Contactați operatorul." },
        { status: 400 },
      )
    }

    let status: OfferPageStatus = "ready"
    let message = ""
    if (data.offerActionUsedAt) {
      status = "used"
      message = "Oferta a fost deja acceptată sau refuzată. Contactați operatorul."
    } else {
      const exp = toDate(data.offerActionExpiresAt)
      if (exp && Date.now() > exp.getTime()) {
        status = "expired"
        message = "Link expirat. Contactați operatorul pentru o ofertă nouă."
      }
    }

    const payload = {
      status,
      message,
      offerUrl: typeof data?.ofertaDocument?.url === "string" ? data.ofertaDocument.url : "",
      work: {
        id: workId,
        numarRaport: String(data?.numarRaport || ""),
        client: String(data?.client || data?.clientInfo?.nume || ""),
        persoanaContact: String(data?.persoanaContact || ""),
        products: Array.isArray(data?.products) ? data.products : [],
        offerVAT: typeof data?.offerVAT === "number" ? data.offerVAT : 19,
        offerAdjustmentPercent: Number(data?.offerAdjustmentPercent || 0),
        constatareLaLocatie: String(
          data?.constatareLaLocatie || data?.raportSnapshot?.constatareLaLocatie || data?.comentariiOferta || "",
        ),
        conditiiOferta: Array.isArray(data?.conditiiOferta) ? data.conditiiOferta : [],
        echipament: String(data?.echipament || ""),
        locatie: String(data?.locatie || ""),
        comentariiOferta: String(data?.comentariiOferta || ""),
        clientInfo: {
          nume: String(data?.clientInfo?.nume || ""),
          cui: String(data?.clientInfo?.cui || ""),
          rc: String(data?.clientInfo?.rc || ""),
          adresa: String(data?.clientInfo?.adresa || ""),
        },
      },
    }

    await logOfferPortalEvent({
      lucrareId: workId,
      action: "link-open",
      status,
      token: providedToken,
      details: message || "Link valid.",
      meta: { route: "/api/offer" },
    })

    return NextResponse.json(payload)
  } catch (e: any) {
    const msg = String(e?.message || e || "unknown")
    await logOfferPortalEvent({
      action: "link-open",
      status: "error",
      details: msg,
      meta: { route: "/api/offer", reason: "exception" },
    })
    return NextResponse.json(
      { status: "error", message: "Eroare server.", error: msg },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const { lucrareId, snapshot } = await req.json()
    if (!lucrareId) return NextResponse.json({ error: "lucrareId lipsă" }, { status: 400 })

    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) return NextResponse.json({ error: "Lucrarea nu există" }, { status: 404 })

    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 zile

    const updateData: Record<string, any> = {
      offerActionToken: token,
      offerActionExpiresAt: expiresAt,
      offerActionUsedAt: null,
      offerActionVerification: null,
    }
    // Persist optional snapshot of the offer being sent so we can later show exactly what was accepted
    if (snapshot && typeof snapshot === 'object') {
      updateData.offerActionSnapshot = snapshot
      updateData.offerActionVersionSavedAt = snapshot.savedAt || new Date().toISOString()
    }
    await workRef.update(updateData)

    // Build absolute base URL for email links (works on server): prefer env, then headers
    const envBase = process.env.NEXT_PUBLIC_APP_URL
    const proto = req.headers.get("x-forwarded-proto") || "https"
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || ""
    const headerBase = host ? `${proto}://${host}` : ""
    const rawBase = envBase || headerBase
    const base = rawBase && !rawBase.startsWith("http://") && !rawBase.startsWith("https://")
      ? `https://${rawBase}`
      : rawBase
    const acceptUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(token)}&action=accept`
    const rejectUrl = `${base}/offer/${encodeURIComponent(lucrareId)}?t=${encodeURIComponent(token)}&action=reject`

    return NextResponse.json({ token, acceptUrl, rejectUrl, expiresAt })
  } catch (e) {
    console.error("Mint offer token failed:", e)
    return NextResponse.json({ error: "Eroare server" }, { status: 500 })
  }
}
