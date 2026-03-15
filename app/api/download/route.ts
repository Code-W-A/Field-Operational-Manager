import { NextResponse } from "next/server"
// NOTE: For server-side logging, use Admin SDK (adminDb). Do not use client SDK here.
import { cookies } from "next/headers"
import { adminApp, adminAuth, adminDb } from "@/lib/firebase/admin"
import { getStorage } from "firebase-admin/storage"

function wantsHtml(request: Request) {
  const accept = request.headers.get("accept") || ""
  return accept.includes("text/html")
}

function htmlResponse(title: string, message: string, details?: Record<string, any>, status = 400) {
  const detailText = details ? JSON.stringify(details, null, 2) : ""
  const html = `<!doctype html>
<html lang="ro">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; padding: 24px; background: #f8fafc; color: #0f172a; }
      .card { max-width: 860px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 18px 14px; box-shadow: 0 2px 12px rgba(15,23,42,.06); }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { margin: 0 0 10px; line-height: 1.45; }
      .hint { font-size: 13px; color: #334155; }
      pre { margin: 10px 0 0; padding: 12px; background: #0b1220; color: #e2e8f0; border-radius: 10px; overflow: auto; font-size: 12px; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      .badge { display:inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; margin-left: 8px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${escapeHtml(title)} <span class="badge">Descărcare documentație</span></h1>
      <p class="hint">${escapeHtml(message)}</p>
      ${detailText ? `<pre><code>${escapeHtml(detailText)}</code></pre>` : ""}
    </div>
  </body>
</html>`
  return new NextResponse(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  })
}

function escapeHtml(s: string) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function decodeUntilStable(input: string, maxRounds = 3) {
  let cur = String(input || "")
  for (let i = 0; i < maxRounds; i++) {
    try {
      const next = decodeURIComponent(cur)
      if (next === cur) break
      cur = next
    } catch {
      break
    }
  }
  return cur
}

function parseFirebaseStorageObject(downloadUrl: string): { bucket: string; objectPath: string } | null {
  try {
    const u = new URL(downloadUrl)
    if (!u.hostname.includes("firebasestorage.googleapis.com")) return null
    // Expected: /v0/b/{bucket}/o/{objectPath}
    const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/)
    if (!m) return null
    const bucket = String(m[1] || "").trim()
    const rawObject = String(m[2] || "").trim()
    const objectPath = decodeUntilStable(rawObject, 3)
    if (!bucket || !objectPath) return null
    return { bucket, objectPath }
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  try {
    const requestId = `dl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`
    console.log(`[DOWNLOAD] [${requestId}] Start processing`, { url: request.url })
    const { searchParams } = new URL(request.url)
    const lucrareId = searchParams.get("lucrareId") || ""
    const docType = searchParams.get("type") || "generic"
    const url = searchParams.get("url") || ""
    const equipmentId = searchParams.get("equipmentId") || ""
    

    if (!lucrareId || !url) {
      console.warn(`[DOWNLOAD] [${requestId}] Missing params`, { lucrareId, urlPresent: Boolean(url) })
      if (wantsHtml(request)) {
        return htmlResponse(
          "Parametri lipsă",
          "Link-ul de descărcare este incomplet. Reîncarcă pagina și încearcă din nou. Dacă persistă, contactează administratorul.",
          { requestId, lucrareId, urlPresent: Boolean(url), docType },
          400,
        )
      }
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
      return NextResponse.json({ error: "Tichet inexistentă" }, { status: 404 })
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
    const shouldLog = !isAdminOrDispatcher && (role === "client" || role === "tehnician" || !userId)
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
      if (!t || t === 'deviz') addIf((workData as any)?.devizDocument?.url)
      if (!t || t === 'documentatie' || t === 'documentație' || t === 'documentation') {
        try {
          const clientId = workData?.clientId || workData?.clientInfo?.id
          if (clientId) {
            const clientSnap = await adminDb.collection("clienti").doc(String(clientId)).get()
            const clientData = clientSnap.exists ? (clientSnap.data() as any) : null
            const locatii: any[] = Array.isArray(clientData?.locatii) ? clientData.locatii : []
            const locationId = workData?.locationId || workData?.clientInfo?.locationId || workData?.clientInfo?.locatieId
            const locationName = workData?.locatie || workData?.clientInfo?.locationName
            const locationAddress = workData?.clientInfo?.locationAddress
            let loc =
              (locationId ? locatii.find((l: any) => String(l?.id || "") === String(locationId)) : null) ||
              (locationName ? locatii.find((l: any) => String(l?.nume || "") === String(locationName)) : null) ||
              (locationAddress ? locatii.find((l: any) => String(l?.adresa || "") === String(locationAddress)) : null)

            const eqs: any[] = Array.isArray(loc?.echipamente) ? loc.echipamente : []
            const workEquipmentIds: string[] = Array.isArray(workData?.equipmentIds) ? workData.equipmentIds.map(String) : []
            const eqIdFromWork = String(workData?.echipamentId || workData?.echipamentCod || workData?.echipament || "").trim()
            const targetId = String(equipmentId || "").trim()
            const matchesEq = (e: any, id: string) =>
              id && (String(e?.id || "") === id || String(e?.cod || "") === id || String(e?.nume || "") === id)

            let targets = eqs
            if (targetId) {
              targets = eqs.filter((e) => matchesEq(e, targetId))
            } else if (workEquipmentIds.length > 0) {
              targets = eqs.filter((e) =>
                workEquipmentIds.includes(String(e?.id || "")) || workEquipmentIds.includes(String(e?.cod || "")),
              )
            } else if (eqIdFromWork) {
              targets = eqs.filter((e) => matchesEq(e, eqIdFromWork))
            }

            targets.forEach((e: any) => {
              const docs = Array.isArray(e?.documentatie) ? e.documentatie : []
              docs.forEach((d: any) => addIf(d?.url))
            })
          }
        } catch (e) {
          console.warn(`[DOWNLOAD] [${requestId}] Documentatie lookup failed (non-blocking)`, e)
        }
      }
      // Also accept any of the known URLs regardless of type to reduce friction
      addIf(workData?.raportSnapshot?.url)
      addIf(workData?.facturaDocument?.url)
      addIf(workData?.ofertaDocument?.url)
      addIf((workData as any)?.devizDocument?.url)
      const sampleCandidates = candidateUrls.slice(0, 5)
      console.log(`[DOWNLOAD] [${requestId}] URL candidates`, {
        count: candidateUrls.length,
        sample: sampleCandidates,
        docType: t,
        requestedRaw,
        requestedDecoded,
      })

      const normalizeUrl = (value: string) => {
        const safe = value.replace(/#/g, "%23")
        try {
          const u = new URL(safe)
          return `${u.origin}${u.pathname.replace(/#/g, "%23")}`
        } catch {
          return safe
        }
      }

      const urlMatches = (candidate: string) => {
        if (!candidate) return false
        if (candidate === requestedRaw || candidate === requestedDecoded) return true
        try {
          const a = normalizeUrl(candidate)
          const b = normalizeUrl(requestedDecoded || requestedRaw)
          return a === b
        } catch {
          return false
        }
      }

      isAllowed = candidateUrls.some((u) => urlMatches(u) || urlMatches(safeDecode(u)))
      console.log(`[DOWNLOAD] [${requestId}] Match result`, { isAllowed })
      if (!isAllowed) {
        const normalizedRequested = (() => {
          try { return normalizeUrl(requestedDecoded || requestedRaw) } catch { return requestedDecoded || requestedRaw }
        })()
        const normalizedSample = sampleCandidates.map((c) => {
          try { return normalizeUrl(c) } catch { return c }
        })
        console.warn(`[DOWNLOAD] [${requestId}] Forbidden - URL does not match stored documents`, {
          requestedRaw,
          requestedDecoded,
          normalizedRequested,
          sampleCandidates: sampleCandidates,
          normalizedSampleCandidates: normalizedSample,
        })
        return NextResponse.json({ error: "URL nevalid pentru lucrarea indicată" }, { status: 403 })
      }
    }

    // păstrăm comportamentul inițial: dacă nu avem userEmail, salvăm "portal"

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
            equipmentId: equipmentId || null,
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
          detalii: `tichet: ${lucrareId}; tip: ${docType}; url: ${url}; echipament: ${equipmentId || "-"}`,
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

    const isAbsoluteHttpUrl = (value: string) => {
      try {
        const u = new URL(value)
        return u.protocol === "http:" || u.protocol === "https:"
      } catch {
        return false
      }
    }

    // Redirect to the actual file URL (must be absolute on Vercel/Next.js)
    let redirectUrl = url.includes("#") ? url.replace(/#/g, "%23") : url
    console.log(`[DOWNLOAD] [${requestId}] Redirecting`, { to: redirectUrl })

    const resolveUrlFromSetting = async (needle: string): Promise<string | null> => {
      const raw = String(needle || "").trim()
      if (!raw) return null
      const safeDecode = (v: string) => {
        try {
          return decodeURIComponent(v)
        } catch {
          return v
        }
      }
      const candidates = Array.from(
        new Set(
          [
            raw,
            safeDecode(raw),
            raw.replace(/%23/gi, "#"),
            safeDecode(raw).replace(/%23/gi, "#"),
          ]
            .map((x) => String(x || "").trim())
            .filter(Boolean),
        ),
      )
      try {
        // Common legacy case: equipment docs store only the "name"/"value" (e.g. "Raport_#000605.pdf").
        // Try to map it back to a settings entry that contains the real documentUrl.
        for (const s of candidates) {
          const nameSnap = await adminDb.collection("settings").where("name", "==", s).limit(1).get()
          if (!nameSnap.empty) {
            const data = nameSnap.docs[0].data() as any
            const val = data?.value
            const urlFromValue = val && typeof val === "object" && typeof val.url === "string" ? val.url : null
            const found =
              (typeof data?.documentUrl === "string" && data.documentUrl) ||
              (typeof data?.imageUrl === "string" && data.imageUrl) ||
              (typeof urlFromValue === "string" && urlFromValue) ||
              null
            if (found) {
              console.log(`[DOWNLOAD] [${requestId}] resolveUrlFromSetting match`, { by: "name", needle: raw, matched: s })
              return String(found)
            }
          }

          const valueSnap = await adminDb.collection("settings").where("value", "==", s).limit(1).get()
          if (!valueSnap.empty) {
            const data = valueSnap.docs[0].data() as any
            const val = data?.value
            const urlFromValue = val && typeof val === "object" && typeof val.url === "string" ? val.url : null
            const found =
              (typeof data?.documentUrl === "string" && data.documentUrl) ||
              (typeof data?.imageUrl === "string" && data.imageUrl) ||
              (typeof urlFromValue === "string" && urlFromValue) ||
              null
            if (found) {
              console.log(`[DOWNLOAD] [${requestId}] resolveUrlFromSetting match`, { by: "value", needle: raw, matched: s })
              return String(found)
            }
          }
        }

        // Fallback: try matching by fileName (the uploaded filename in settings)
        for (const s of candidates) {
          const fileSnap = await adminDb.collection("settings").where("fileName", "==", s).limit(1).get()
          if (fileSnap.empty) continue
          const data = fileSnap.docs[0].data() as any
          const val = data?.value
          const urlFromValue = val && typeof val === "object" && typeof val.url === "string" ? val.url : null
          const found =
            (typeof data?.documentUrl === "string" && data.documentUrl) ||
            (typeof data?.imageUrl === "string" && data.imageUrl) ||
            (typeof urlFromValue === "string" && urlFromValue) ||
            null
          if (found) {
            console.log(`[DOWNLOAD] [${requestId}] resolveUrlFromSetting match`, { by: "fileName", needle: raw, matched: s })
            return String(found)
          }
        }
      } catch (e) {
        console.warn(`[DOWNLOAD] [${requestId}] resolveUrlFromSetting failed`, { needle: raw })
      }
      return null
    }

    if (!isAbsoluteHttpUrl(redirectUrl)) {
      // Try resolve through settings even if the work stored only a filename-like value.
      const resolved = await resolveUrlFromSetting(redirectUrl)
      if (resolved) {
        redirectUrl = resolved.includes("#") ? resolved.replace(/#/g, "%23") : resolved
        console.log(`[DOWNLOAD] [${requestId}] Resolved non-absolute URL via settings`, { resolvedTo: redirectUrl })
      }
    }

    if (!isAbsoluteHttpUrl(redirectUrl)) {
      console.warn(`[DOWNLOAD] [${requestId}] Invalid redirect URL (not absolute)`, { redirectUrl })
      const payload = {
        error:
          "URL invalid pentru descărcare (nu este un link complet). Verifică documentul din Setări/Documentație: câmpul URL trebuie să fie de forma https://...",
        requestId,
        redirectUrl,
      }
      if (wantsHtml(request)) {
        return htmlResponse(
          "URL invalid pentru descărcare",
          "Documentul pare configurat cu un URL incomplet. Deschide Setări → Documentație și verifică acel element (câmpul URL trebuie să înceapă cu https://).",
          payload,
          400,
        )
      }
      return NextResponse.json(payload, { status: 400 })
    }

    // If the URL points to Firebase Storage, verify the object exists.
    // This avoids confusing 404 pages / broken downloads for technicians.
    const storageObj = parseFirebaseStorageObject(redirectUrl)
    if (storageObj) {
      try {
        const envBucket = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim()
        const bucketName = envBucket || storageObj.bucket
        const storage = getStorage(adminApp)
        const bucket = storage.bucket(bucketName)
        const [exists] = await bucket.file(storageObj.objectPath).exists()
        if (!exists) {
          console.warn(`[DOWNLOAD] [${requestId}] Storage object missing`, {
            bucketName,
            objectPath: storageObj.objectPath,
            redirectUrl,
          })
          const payload = {
            error:
              "Document indisponibil (fișierul nu există în Storage sau a fost mutat/șters). Verifică Setări/Documentație: elementul trebuie să aibă un fișier încărcat (URL valid) care există în Storage.",
            requestId,
            bucketName,
            objectPath: storageObj.objectPath,
            redirectUrl,
          }
          if (wantsHtml(request)) {
            return htmlResponse(
              "Document indisponibil",
              "Fișierul nu a fost găsit în Storage. Cel mai des înseamnă că în Setări → Documentație e doar o referință/URL greșit sau fișierul a fost șters/mutat. Rog administratorul să reîncarce documentul sau să corecteze URL-ul.",
              payload,
              404,
            )
          }
          return NextResponse.json(payload, { status: 404 })
        }
      } catch (e) {
        // Non-blocking: if validation fails, still attempt redirect.
        console.warn(`[DOWNLOAD] [${requestId}] Storage exists-check failed (non-blocking)`, e)
      }
    }

    return NextResponse.redirect(redirectUrl, { status: 302 })
  } catch (e) {
    console.error("[DOWNLOAD] Handler error", e)
    return NextResponse.json({ error: "Eroare internă" }, { status: 500 })
  }
}

