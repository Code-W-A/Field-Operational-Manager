import { NextResponse } from "next/server"
// NOTE: For server-side logging, use Admin SDK (adminDb). Do not use client SDK here.
import { cookies } from "next/headers"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export async function GET(request: Request) {
  try {
    const requestId = `dl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
    console.log(`[DOWNLOAD] [${requestId}] Start processing`, { url: request.url })
    const { searchParams } = new URL(request.url)
    const lucrareId = searchParams.get("lucrareId") || ""
    const docType = searchParams.get("type") || "generic"
    const url = searchParams.get("url") || ""

    if (!lucrareId || !url) {
      console.warn(`[DOWNLOAD] [${requestId}] Missing params`, { lucrareId, urlPresent: Boolean(url) })
      return NextResponse.json({ error: "Parametri lipsă" }, { status: 400 })
    }

    // Identify user (best-effort). If absent, we'll still allow when URL matches stored document for the lucrare.
    let userEmail: string | undefined
    let userId: string | undefined
    try {
      const cookieStore = await cookies()
      const sessionCookie = cookieStore.get("__session")?.value
      if (sessionCookie) {
        const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
        userEmail = decoded.email
        userId = decoded.uid
      }
    } catch (e) {
      // ignore, proceed unauthenticated
    }
    console.log(`[DOWNLOAD] [${requestId}] Identity`, { userId: userId || null, userEmail: userEmail || null })

    // Authorization simplified: allow admins/dispeceri; otherwise allow if the requested URL matches the stored document URL for the lucrare
    // Load work order (required for both paths)
    const workSnap = await adminDb.collection("lucrari").doc(lucrareId).get()
    if (!workSnap.exists) {
      console.warn(`[DOWNLOAD] [${requestId}] Work not found`, { lucrareId })
      return NextResponse.json({ error: "Lucrare inexistentă" }, { status: 404 })
    }
    const workData = workSnap.data() as any

    let isAllowed = false
    let role: string | undefined
    if (userId) {
      try {
        const userSnap = await adminDb.collection("users").doc(String(userId)).get()
        const userData = userSnap.exists ? (userSnap.data() as any) : null
        role = userData?.role
      } catch {}
    }
    const isAdminOrDispatcher = role === "admin" || role === "dispecer"
    console.log(`[DOWNLOAD] [${requestId}] Role check`, { role: role || null, isAdminOrDispatcher })
    // Logăm DOAR descărcările din portalul clienților (utilizator role=client sau neautentificat din portal)
    const shouldLog = !isAdminOrDispatcher && (role === "client" || !userId)
    console.log(`[DOWNLOAD] [${requestId}] Logging policy`, { shouldLog })

    if (isAdminOrDispatcher) {
      isAllowed = true
    } else {
      // Match requested url against stored document URLs for this lucrare
      const safeDecode = (v: string) => {
        try { return decodeURIComponent(v) } catch { return v }
      }
      const requestedRaw = url
      const requestedDecoded = safeDecode(url)
      const candidateUrls: string[] = []
      const addIf = (v?: any) => { if (typeof v === 'string' && v) candidateUrls.push(v) }
      const t = (docType || '').toLowerCase()
      if (!t || t === 'raport') addIf(workData?.raportSnapshot?.url)
      if (!t || t === 'factura') addIf(workData?.facturaDocument?.url)
      if (!t || t === 'oferta') addIf(workData?.ofertaDocument?.url)
      // Also accept any of the known URLs regardless of type to reduce friction
      addIf(workData?.raportSnapshot?.url)
      addIf(workData?.facturaDocument?.url)
      addIf(workData?.ofertaDocument?.url)
      console.log(`[DOWNLOAD] [${requestId}] URL candidates`, { count: candidateUrls.length, docType: t, requestedRaw, requestedDecoded })

      const urlMatches = (candidate: string) => {
        if (!candidate) return false
        if (candidate === requestedRaw || candidate === requestedDecoded) return true
        try {
          const a = new URL(candidate)
          const b = new URL(requestedDecoded || requestedRaw)
          // Match by origin + pathname to ignore query param ordering/token variations
          return a.origin === b.origin && a.pathname === b.pathname
        } catch {
          return false
        }
      }

      isAllowed = candidateUrls.some((u) => urlMatches(u) || urlMatches(safeDecode(u)))
      console.log(`[DOWNLOAD] [${requestId}] Match result`, { isAllowed })
      if (!isAllowed) {
        console.warn(`[DOWNLOAD] [${requestId}] Forbidden - URL does not match stored documents`, { requestedRaw, requestedDecoded })
        return NextResponse.json({ error: "URL nevalid pentru lucrarea indicată" }, { status: 403 })
      }
    }

    // Log into subcollection for easy querying in UI
    if (shouldLog) {
      try {
        await adminDb
          .collection("lucrari")
          .doc(lucrareId)
          .collection("downloads")
          .add({
            timestamp: new Date(),
            type: docType,
            url,
            userEmail: userEmail || "portal",
            userId: userId || "portal",
          })
        console.log(`[DOWNLOAD] [${requestId}] Download logged`, { lucrareId, type: docType })
      } catch (e) {
        // non-blocking
        console.warn(`[DOWNLOAD] [${requestId}] Download log failed (non-blocking)`, e)
      }
    } else {
      console.log(`[DOWNLOAD] [${requestId}] Skipping per-portal download log (admin/dispecer access)`) 
    }

    // Also add to global logs (non-blocking)
    if (shouldLog) {
      try {
        await adminDb.collection("logs").add({
          timestamp: new Date(),
          utilizator: userEmail || "Portal client",
          utilizatorId: userId || "portal",
          actiune: "Descărcare document",
          detalii: `lucrare: ${lucrareId}; tip: ${docType}; url: ${url}`,
          tip: "Informație",
          categorie: "Descărcări",
        })
        console.log(`[DOWNLOAD] [${requestId}] Global log written`)
      } catch (e) {
        console.warn(`[DOWNLOAD] [${requestId}] Global log write failed (non-blocking)`, e)
      }
    } else {
      console.log(`[DOWNLOAD] [${requestId}] Skipping global log (admin/dispecer access)`) 
    }

    // Redirect to the actual file URL
    console.log(`[DOWNLOAD] [${requestId}] Redirecting`, { to: url })
    return NextResponse.redirect(url, { status: 302 })
  } catch (e) {
    console.error("[DOWNLOAD] Handler error", e)
    return NextResponse.json({ error: "Eroare internă" }, { status: 500 })
  }
}


