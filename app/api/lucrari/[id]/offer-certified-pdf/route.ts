import { NextResponse, type NextRequest } from "next/server"
import { getStorage } from "firebase-admin/storage"
import { adminApp, adminDb } from "@/lib/firebase/admin"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"

function safeFilename(value: string) {
  return String(value || "oferta-dovada.pdf").replace(/[\r\n"]/g, "_").slice(0, 180)
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["admin", "dispecer", "tehnician"], request)
    const { id } = await context.params
    const lucrareId = String(id || "").trim()
    if (!lucrareId) return NextResponse.json({ error: "lucrareId lipsă" }, { status: 400 })

    const snap = await adminDb.collection("lucrari").doc(lucrareId).get()
    if (!snap.exists) return NextResponse.json({ error: "Tichet inexistent" }, { status: 404 })
    const data = snap.data() as Record<string, any>
    const pdf = data.responseCertifiedPdf || {}
    const storagePath = String(pdf.storagePath || "").trim()
    if (!storagePath) return NextResponse.json({ error: "PDF dovadă indisponibil" }, { status: 404 })

    const envBucket = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim()
    const storage = getStorage(adminApp)
    const bucket = envBucket ? storage.bucket(envBucket) : storage.bucket()
    const fileRef = bucket.file(storagePath)
    const [exists] = await fileRef.exists()
    if (!exists) return NextResponse.json({ error: "Fișierul nu există în Storage" }, { status: 404 })

    const filename = safeFilename(String(pdf.filename || `oferta-dovada-${lucrareId}.pdf`))
    const [signedUrl] = await fileRef.getSignedUrl({
      action: "read",
      version: "v4",
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: `inline; filename="${filename}"`,
    })

    return NextResponse.redirect(signedUrl, 302)
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Eroare la descărcarea PDF-ului dovadă" },
      { status: 500 },
    )
  }
}
