import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { logOfferEvent } from "@/lib/offer/offer-events.server"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(["admin", "dispecer"], request)
    const { id: lucrareId } = await context.params
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null

    if (!lucrareId) {
      return NextResponse.json({ error: "lucrareId lipsă." }, { status: 400 })
    }

    const snapshot = body?.snapshot
    const total = Number(body?.total || 0)
    const savedAt = typeof body?.savedAt === "string" ? body.savedAt : new Date().toISOString()
    const savedBy = typeof body?.savedBy === "string" ? body.savedBy : session.uid

    const eventId = await logOfferEvent({
      type: "OFFER_PREPARED",
      source: "lucrari",
      status: "saved",
      lucrareId,
      actorId: session.uid,
      actorType: "staff",
      snapshot: snapshot && typeof snapshot === "object" ? snapshot : { savedAt, total },
      payload: { savedAt, savedBy, total },
    })

    return NextResponse.json({ ok: true, eventId })
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nu s-a putut înregistra evenimentul." },
      { status: 500 },
    )
  }
}
