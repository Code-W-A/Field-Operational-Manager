import { NextRequest, NextResponse } from "next/server"
import { requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role"
import { OfferAttachmentError } from "@/lib/offer/email-attachments"
import { parseAttachmentContext, requireAttachmentAccess, initiateOfferAttachment, finalizeOfferAttachment, readOfferAttachment } from "@/lib/offer/email-attachments.server"
export const runtime = "nodejs"
function failure(error: unknown) {
  const status = error instanceof OfferAttachmentError || error instanceof RequireRoleError ? error.status : 500
  return NextResponse.json({ error: status === 500 ? "Fișierul nu poate fi încărcat sau citit. Încercați din nou." : (error as Error).message }, { status })
}
export async function POST(request: NextRequest) {
  try {
    const actor = await requireVerifiedRole(["admin", "dispecer"], request)
    const body = await request.json()
    const context = parseAttachmentContext(body.context)
    await requireAttachmentAccess(context, actor.uid)
    if (body.action === "initiate") return NextResponse.json(await initiateOfferAttachment(context, actor.uid, body.filename, body.size))
    if (body.action === "finalize") return NextResponse.json(await finalizeOfferAttachment(context, actor.uid, String(body.id || "")))
    throw new OfferAttachmentError("Acțiune invalidă.")
  } catch (error) { return failure(error) }
}
export async function GET(request: NextRequest) {
  try {
    const actor = await requireVerifiedRole(["admin", "dispecer"], request)
    const context = parseAttachmentContext({ kind: request.nextUrl.searchParams.get("kind"), id: request.nextUrl.searchParams.get("contextId") })
    await requireAttachmentAccess(context, actor.uid, false)
    const file = await readOfferAttachment(context, request.nextUrl.searchParams.get("id") || "")
    return new NextResponse(new Uint8Array(file.content), { headers: { "Content-Type": file.contentType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } })
  } catch (error) { return failure(error) }
}
