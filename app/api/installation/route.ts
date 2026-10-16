import { NextRequest, NextResponse } from "next/server"
import { requireVerifiedRole } from "@/lib/auth/require-role"
import { adminDb } from "@/lib/firebase/admin"
import { installationService } from "@/lib/installations/service"
import { installationFailure } from "@/lib/installations/http"
import { check } from "@/lib/installations/validation"

export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  try {
    const actor = await requireVerifiedRole(["admin", "dispecer"], request)
    const body = await request.json()
    check(JSON.stringify(body).length < 700000, "Datele tichetului sunt prea mari.")
    const result = await installationService(adminDb).create(actor, body.work, body.requestId)
    const saved = await adminDb.collection("lucrari").doc(result.id).get()
    return NextResponse.json({ id: saved.id, ...saved.data() })
  } catch (error) { return installationFailure(error) }
}
