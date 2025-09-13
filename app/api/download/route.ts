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

    // Identify user (required)
    let userEmail: string | undefined
    let userId: string | undefined
    try {
      const cookieStore = cookies()
      const sessionCookie = cookieStore.get("__session")?.value
      if (!sessionCookie) {
        return NextResponse.json({ error: "Neautorizat" }, { status: 401 })
      }
      const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
      userEmail = decoded.email
      userId = decoded.uid
    } catch (e) {
      return NextResponse.json({ error: "Neautorizat" }, { status: 401 })
    }

    // Authorization: allow admin/dispecer; clients only if location allowed
    try {
      // Load user document
      const userSnap = await adminDb.collection("users").doc(String(userId)).get()
      const userData = userSnap.exists ? userSnap.data() as any : null

      // Load work order
      const workSnap = await adminDb.collection("lucrari").doc(lucrareId).get()
      if (!workSnap.exists) {
        return NextResponse.json({ error: "Lucrare inexistentă" }, { status: 404 })
      }
      const workData = workSnap.data() as any

      const role = userData?.role as string | undefined
      const isAdminOrDispatcher = role === "admin" || role === "dispecer"
      const isClient = role === "client"

      let isAllowed = false
      if (isAdminOrDispatcher) {
        isAllowed = true
      } else if (isClient) {
        const allowedLocations: string[] = Array.isArray(userData?.allowedLocationNames) ? userData.allowedLocationNames : []
        const workLocation: string | undefined = workData?.locatie
        const userHasLocation = !!workLocation && allowedLocations.includes(workLocation)

        // Client ownership: try to match by clientId when available; otherwise by name (best-effort)
        const userClientId: string | undefined = userData?.clientId || userData?.clientID || userData?.client?.id
        const workClientId: string | undefined = workData?.clientInfo?.id || workData?.clientInfo?.clientId || workData?.clientId
        const workClientName: string | undefined = typeof workData?.client === 'string' ? workData.client : (workData?.client?.nume || workData?.client?.name || workData?.clientInfo?.nume || workData?.clientInfo?.name)

        const normalize = (s?: string) => (s || "").toString().trim().toLowerCase()

        let clientOk = true
        if (userClientId && workClientId) {
          clientOk = userClientId === workClientId
        } else if (userClientId && workClientName) {
          // Fallback by name: fetch user's client name and compare
          try {
            const clientSnap = await adminDb.collection("clienti").doc(String(userClientId)).get()
            const userClientName = clientSnap.exists ? (clientSnap.data() as any)?.nume || (clientSnap.data() as any)?.name : undefined
            if (userClientName && workClientName) {
              clientOk = normalize(userClientName) === normalize(workClientName)
            }
          } catch {}
        }

        isAllowed = userHasLocation && clientOk
      }

      if (!isAllowed) {
        // Log attempted unauthorized download (non-blocking)
        try {
          await adminDb.collection("logs").add({
            timestamp: new Date(),
            utilizator: userEmail || "Necunoscut",
            utilizatorId: userId || "unknown",
            actiune: "Descărcare document blocată",
            detalii: `lucrare: ${lucrareId}; tip: ${docType}; url: ${url}`,
            tip: "Avertisment",
            categorie: "Descărcări",
          })
        } catch {}
        return NextResponse.json({ error: "Acces interzis" }, { status: 403 })
      }
    } catch (e) {
      // In case of any error while authorizing, block
      return NextResponse.json({ error: "Eroare autorizare" }, { status: 403 })
    }

    // Log into subcollection for easy querying in UI
    try {
      await addDoc(collection(db, "lucrari", lucrareId, "downloads"), {
        timestamp: serverTimestamp(),
        type: docType,
        url,
        userEmail: userEmail || null,
        userId: userId || null,
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


