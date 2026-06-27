import { NextResponse, type NextRequest } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { logOfferEvent } from "@/lib/offer/offer-events.server"

const MAX_ID_LEN = 128
const MAX_ACTION_LEN = 32
const MAX_STATE_LEN = 32
const MAX_TOKEN_LEN = 512
const MAX_USER_MSG_LEN = 2000
const MAX_TECH_MSG_LEN = 4000
const MAX_USER_AGENT_LEN = 800
const MAX_LANG_LEN = 64
const MAX_LOCATION_LEN = 1000

type TokenStatus = "current" | "previous" | "invalid" | "missing"

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, maxLength)
}

function maskToken(token: string): string {
  if (!token) return ""
  if (token.length <= 8) return `${token.slice(0, 2)}...${token.slice(-2)}`
  return `${token.slice(0, 4)}...${token.slice(-4)}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Payload invalid." }, { status: 400 })
    }

    const lucrareId = safeString((body as any).lucrareId, MAX_ID_LEN)
    if (!lucrareId) {
      return NextResponse.json({ error: "lucrareId este obligatoriu." }, { status: 400 })
    }

    const action = safeString((body as any).action, MAX_ACTION_LEN)
    const pageState = safeString((body as any).state, MAX_STATE_LEN)
    const token = safeString((body as any).token, MAX_TOKEN_LEN)
    const userMessage = safeString((body as any).userMessage, MAX_USER_MSG_LEN)
    const technicalMessage = safeString((body as any).technicalError, MAX_TECH_MSG_LEN)
    const offerUrlPresent = Boolean((body as any).offerUrlPresent)
    const hasErrorDetails = Boolean((body as any).hasErrorDetails)

    const browserRaw = (body as any).browser && typeof (body as any).browser === "object" ? (body as any).browser : {}
    const browser = {
      userAgent: safeString(browserRaw.userAgent, MAX_USER_AGENT_LEN) || null,
      language: safeString(browserRaw.language, MAX_LANG_LEN) || null,
      location: safeString(browserRaw.location, MAX_LOCATION_LEN) || null,
      timestamp: safeString(browserRaw.timestamp, 64) || null,
    }

    const workRef = adminDb.collection("lucrari").doc(lucrareId)
    const workSnap = await workRef.get()
    if (!workSnap.exists) {
      return NextResponse.json({ error: "Lucrarea nu există." }, { status: 404 })
    }

    const workData = workSnap.data() as any
    const currentToken = typeof workData?.offerActionToken === "string" ? workData.offerActionToken : ""
    const previousToken = typeof workData?.offerActionPreviousToken === "string" ? workData.offerActionPreviousToken : ""

    let tokenStatus: TokenStatus = "missing"
    if (token) {
      if (currentToken && token === currentToken) {
        tokenStatus = "current"
      } else if (previousToken && token === previousToken) {
        tokenStatus = "previous"
      } else {
        tokenStatus = "invalid"
      }
    }

    const crypto = await import("crypto")
    const tokenHash = token ? crypto.createHash("sha256").update(token).digest("hex") : null
    const tokenPreview = token ? maskToken(token) : null

    const now = new Date()
    const requestMeta = {
      receivedAt: now.toISOString(),
      requestUrl: req.url,
      referer: req.headers.get("referer") || null,
      origin: req.headers.get("origin") || null,
      ip: req.headers.get("x-forwarded-for") || null,
      userAgentHeader: req.headers.get("user-agent") || null,
    }

    const reportPayload = {
      createdAt: now,
      source: "offer-public",
      status: "nou",
      lucrareId,
      nrLucrare: String(workData?.numarRaport || workData?.nrLucrare || "") || null,
      client: String(workData?.client || workData?.clientInfo?.nume || "") || null,
      action: action || null,
      pageState: pageState || null,
      userMessage: userMessage || null,
      technicalMessage: technicalMessage || null,
      tokenStatus,
      tokenPreview,
      tokenHash,
      offerUrlPresent,
      hasErrorDetails,
      browser,
      requestMeta,
    }

    const reportRef = await adminDb.collection("eroriTrimise").add(reportPayload)

    try {
      await adminDb.collection("logs").add({
        timestamp: now,
        utilizator: "Portal client",
        utilizatorId: "portal",
        actiune: "Raportare eroare descărcare ofertă",
        detalii: `lucrareId: ${lucrareId}; status: ${pageState || "-"}; tokenStatus: ${tokenStatus}; reportId: ${reportRef.id}`,
        tip: "Eroare",
        categorie: "Portal ofertă",
        lucrareId,
        nrLucrare: String(workData?.numarRaport || workData?.nrLucrare || "") || undefined,
        client: String(workData?.client || workData?.clientInfo?.nume || "") || undefined,
      })
    } catch (logError) {
      console.warn("[offer/report-error] Nu s-a putut scrie log-ul global:", logError)
    }

    await logOfferEvent(
      {
        type: "OFFER_ERROR_REPORTED",
        source: "lucrari",
        status: pageState || "error",
        lucrareId,
        actorType: "portal_client",
        token: token || null,
        payload: {
          reportId: reportRef.id,
          tokenStatus,
          userMessage: userMessage || null,
          technicalMessage: technicalMessage || null,
          browser,
        },
      },
      req,
    )

    return NextResponse.json({ ok: true, id: reportRef.id })
  } catch (error: any) {
    console.error("[offer/report-error] POST failed:", error)
    return NextResponse.json(
      {
        error: "Eroare server la trimiterea raportului.",
        details: String(error?.message || error),
      },
      { status: 500 },
    )
  }
}
