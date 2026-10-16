import { getStorage } from "firebase-admin/storage"
import { NextRequest, NextResponse } from "next/server"
import { requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role"
import { adminApp, adminAuth, adminDb } from "@/lib/firebase/admin"
import { RevisionPhotoError, revisionPhotoService } from "@/lib/revisions/photos"

export const runtime = "nodejs"
const service = revisionPhotoService(adminDb, path =>
  getStorage(adminApp).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).file(path).delete({ ignoreNotFound: true }))
type Context = { params: Promise<{ id: string; equipmentId: string }> }

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const actor = await requireVerifiedRole(["admin", "dispecer", "tehnician"], request)
    if ((await adminAuth.getUser(actor.uid)).disabled) throw new RequireRoleError("Cont dezactivat.")
    const { id, equipmentId } = await context.params
    const body = await request.json()
    const result = await service.deletePhoto(actor, id, equipmentId, body?.path)
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    const status = error instanceof RevisionPhotoError || error instanceof RequireRoleError
      ? error.status : error instanceof SyntaxError ? 400 : 500
    return NextResponse.json({ error: status === 500 ? "Fotografia nu a putut fi ștearsă. Reîncearcă." : (error as Error).message },
      { status, headers: { "Cache-Control": "private, no-store" } })
  }
}
