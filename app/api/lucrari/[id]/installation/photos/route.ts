import { randomUUID } from "node:crypto"
import { getStorage } from "firebase-admin/storage"
import { NextRequest, NextResponse } from "next/server"
import { requireVerifiedRole } from "@/lib/auth/require-role"
import { adminApp, adminDb } from "@/lib/firebase/admin"
import { installationService } from "@/lib/installations/service"
import { installationFailure } from "@/lib/installations/http"
import { check, identifier } from "@/lib/installations/validation"

export const runtime = "nodejs"
const service = installationService(adminDb)
type Context = { params: Promise<{ id: string }> }
const bucket = () => getStorage(adminApp).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
export async function GET(request: NextRequest, context: Context) {
  try {
    const actor = await requireVerifiedRole(["admin", "dispecer", "tehnician"], request)
    const { id } = await context.params
    const sheetId = identifier(request.nextUrl.searchParams.get("sheetId"))
    const photoId = identifier(request.nextUrl.searchParams.get("photoId"))
    const data = await service.list(actor, id, undefined, sheetId)
    const photo = data.sheets[0]?.photos.find((p: any) => p.id === photoId)
    check(photo, "Fotografia nu există.", 404)
    const [bytes] = await bucket().file(photo.path).download()
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": photo.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return installationFailure(error) }
}
export async function POST(request: NextRequest, context: Context) {
  let uploadedPath: string | undefined
  try {
    const actor = await requireVerifiedRole(["tehnician"], request)
    const { id } = await context.params
    identifier(id)
    check(Number(request.headers.get("content-length") || 0) < 4000000, "Fotografia este prea mare.")
    const form = await request.formData()
    const sheetId = identifier(form.get("sheetId"))
    const file = form.get("file")
    check(file instanceof File && file.size > 0 && file.size <= 3000000, "Fotografia trebuie să aibă maximum 3 MB.")
    check(["image/jpeg", "image/png"].includes(file.type), "Folosiți o fotografie JPEG sau PNG.")
    const data = await service.list(actor, id, undefined, sheetId)
    const sheet = data.sheets[0]
    check(sheet?.state === "draft" && sheet.principalUid === actor.uid, "Doar principalul fișei active poate adăuga poze.", 403)
    check(sheet.photos.length < 4, "Fișa permite maximum 4 fotografii.")
    const bytes = Buffer.from(await file.arrayBuffer())
    check(file.type === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255, "Conținutul fotografiei este invalid.")
    const photoId = randomUUID()
    uploadedPath = `installations/${id}/${sheetId}/${photoId}`
    await bucket().file(uploadedPath).save(bytes, { contentType: file.type, resumable: false })
    const result = await service.attachPhoto(actor, id, sheetId, { id: photoId, path: uploadedPath, name: file.name.slice(0, 200), contentType: file.type })
    uploadedPath = undefined
    return NextResponse.json(result)
  } catch (error) {
    if (uploadedPath) await bucket().file(uploadedPath).delete({ ignoreNotFound: true }).catch(() => {})
    return installationFailure(error)
  }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    const actor = await requireVerifiedRole(["tehnician"], request)
    const { id } = await context.params
    const body = await request.json()
    const sheetId = identifier(body.sheetId)
    const photoId = identifier(body.photoId)
    const data = await service.list(actor, id, undefined, sheetId)
    const photo = data.sheets[0]?.photos.find((p: any) => p.id === photoId)
    check(photo, "Fotografia nu există.", 404)
    const result = await service.attachPhoto(actor, id, sheetId, photo, true)
    await bucket().file(photo.path).delete({ ignoreNotFound: true }).catch(() => {})
    return NextResponse.json(result)
  } catch (error) { return installationFailure(error) }
}
