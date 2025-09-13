import { NextResponse } from "next/server"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { cookies } from "next/headers"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const lucrareId = searchParams.get("lucrareId") || ""
    const docType = searchParams.get("type") || "generic"
    const url = searchParams.get("url") || ""

    if (!lucrareId || !url) {
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

    // Authorization simplified: allow admins/dispeceri; otherwise allow if the requested URL matches the stored document URL for the lucrare
    // Load work order (required for both paths)
    const workSnap = await adminDb.collection("lucrari").doc(lucrareId).get()
    if (!workSnap.exists) {
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
      if (!isAllowed) {
        return NextResponse.json({ error: "URL nevalid pentru lucrarea indicată" }, { status: 403 })
      }
    }

    // Log into subcollection for easy querying in UI
    try {
      await addDoc(collection(db, "lucrari", lucrareId, "downloads"), {
        timestamp: serverTimestamp(),
        type: docType,
        url,
        userEmail: userEmail || "portal",
        userId: userId || "portal",
      })
    } catch (e) {
      // non-blocking
      console.warn("Download log failed (non-blocking)", e)
    }

    // Also add to global logs (non-blocking)
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
    } catch (e) {
      console.warn("Global log write failed (non-blocking)", e)
    }

    // Redirect to the actual file URL
    return NextResponse.redirect(url, { status: 302 })
  } catch (e) {
    console.error("Download handler error", e)
    return NextResponse.json({ error: "Eroare internă" }, { status: 500 })
  }
}


