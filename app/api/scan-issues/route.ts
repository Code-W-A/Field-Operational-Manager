import { NextResponse, type NextRequest } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      lucrareId,
      expectedEquipmentCode,
      expectedClientName,
      expectedLocationName,
      latestDetectedCodeRaw,
      failedScanAttempts,
      device,
      cameraPermissionStatus,
      scanError,
      timeRemaining,
    } = body || {}

    if (!lucrareId) return NextResponse.json({ error: "lucrareId lipsă" }, { status: 400 })

    // Identify user via session cookie (best-effort)
    let userId: string | undefined
    let userEmail: string | undefined
    try {
      const cookie = req.headers.get("cookie") || ""
      const match = cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith("__session="))
      const token = match ? decodeURIComponent(match.split("=")[1]) : undefined
      if (token) {
        const decoded = await adminAuth.verifySessionCookie(token, true)
        userId = decoded.uid
        userEmail = decoded.email
      }
    } catch {}

    // Fetch work document for context
    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) return NextResponse.json({ error: "Lucrare inexistentă" }, { status: 404 })
    const workData = workSnap.data() as any

    // Create a scan issue request document
    const requestsRef = adminDb.collection("scan_issue_requests")
    const now = new Date()
    const requestData = {
      lucrareId: String(lucrareId),
      status: "pending" as const,
      createdAt: now,
      createdBy: userId || "unknown",
      createdByEmail: userEmail || null,
      context: {
        expectedEquipmentCode: expectedEquipmentCode || workData?.echipamentCod || null,
        expectedClientName: expectedClientName || workData?.client || null,
        expectedLocationName: expectedLocationName || workData?.locatie || null,
      },
      lastScan: {
        raw: latestDetectedCodeRaw || null,
        failedScanAttempts: Number(failedScanAttempts) || 0,
        cameraPermissionStatus: cameraPermissionStatus || null,
        scanError: scanError || null,
        timeRemaining: Number(timeRemaining) || 0,
      },
      device: device || {},
    }
    const docRef = await requestsRef.add(requestData)

    // Also add a red log entry with deep details for debugging
    await adminDb.collection("logs").add({
      timestamp: now,
      utilizator: userEmail || "Utilizator",
      utilizatorId: userId || "unknown",
      actiune: "Raportare problemă scanare",
      detalii: `lucrare: ${lucrareId}; expected: ${requestData.context.expectedEquipmentCode || '-'}; raw: ${latestDetectedCodeRaw || '-'}; încercări: ${requestData.lastScan.failedScanAttempts}`,
      tip: "Eroare",
      categorie: "Scanare",
      extra: {
        requestId: docRef.id,
        workSnapshot: {
          id: workSnap.id,
          client: workData?.client || null,
          locatie: workData?.locatie || null,
          echipamentCod: workData?.echipamentCod || null,
        },
        payload: requestData,
      },
    })

    return NextResponse.json({ id: docRef.id })
  } catch (e: any) {
    console.error("/api/scan-issues POST error", e)
    return NextResponse.json({ error: e?.message || "Eroare internă" }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    // Admin-only: list pending requests
    let userId: string | undefined
    let role: string | undefined
    try {
      const cookie = req.headers.get("cookie") || ""
      const match = cookie.split(";").map((p) => p.trim()).find((p) => p.startsWith("__session="))
      const token = match ? decodeURIComponent(match.split("=")[1]) : undefined
      if (token) {
        const decoded = await adminAuth.verifySessionCookie(token, true)
        userId = decoded.uid
      }
    } catch {}
    if (userId) {
      try {
        const userSnap = await adminDb.collection("users").doc(String(userId)).get()
        const userData = userSnap.exists ? (userSnap.data() as any) : null
        role = userData?.role
      } catch {}
    }
    if (role !== "admin") return NextResponse.json({ error: "Doar admin" }, { status: 403 })

    const snap = await adminDb
      .collection("scan_issue_requests")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get()
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    return NextResponse.json({ items })
  } catch (e: any) {
    console.error("/api/scan-issues GET error", e)
    return NextResponse.json({ error: e?.message || "Eroare internă" }, { status: 500 })
  }
}

