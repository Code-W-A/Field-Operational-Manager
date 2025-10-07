import { NextResponse, type NextRequest } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { requestId } = body || {}
    if (!requestId) return NextResponse.json({ error: "requestId lipsă" }, { status: 400 })

    // AuthN/AuthZ: admin only
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

    // Load request
    const reqRef = adminDb.collection("scan_issue_requests").doc(String(requestId))
    const reqSnap = await reqRef.get()
    if (!reqSnap.exists) return NextResponse.json({ error: "Cerere inexistentă" }, { status: 404 })
    const requestData = reqSnap.data() as any
    if (requestData.status === "approved") return NextResponse.json({ ok: true })

    const lucrareId = requestData.lucrareId
    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) return NextResponse.json({ error: "Lucrare inexistentă" }, { status: 404 })
    const now = new Date()

    // Mark work as verified and set arrival time/status like successful scan
    const update: Record<string, any> = {
      equipmentVerified: true,
      equipmentVerifiedAt: now.toISOString(),
      equipmentVerifiedBy: "Admin approval",
      updatedAt: now,
    }
    const work = workSnap.data() as any
    if ((work.statusLucrare === "Listată" || work.statusLucrare === "Atribuită") && !work.raportGenerat) {
      update.statusLucrare = "În lucru"
    }
    // Arrival times mimicking scan page
    update.timpSosire = now.toISOString()
    update.dataSosire = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`
    update.oraSosire = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`

    await workRef.update(update)

    // Update request status
    await reqRef.update({ status: "approved", approvedAt: now, approvedBy: userId })

    // Log
    await adminDb.collection("logs").add({
      timestamp: now,
      utilizator: "Admin",
      utilizatorId: userId || "admin",
      actiune: "Aprobare problemă scanare",
      detalii: `lucrare: ${lucrareId}; requestId: ${requestId}`,
      tip: "Informație",
      categorie: "Scanare",
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("/api/scan-issues/approve POST error", e)
    return NextResponse.json({ error: e?.message || "Eroare internă" }, { status: 500 })
  }
}

