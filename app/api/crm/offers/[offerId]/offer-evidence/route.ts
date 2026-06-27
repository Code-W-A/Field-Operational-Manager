import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { buildCrmOfferEvidencePack } from "@/lib/offer/evidence-aggregate.server"

export async function GET(request: NextRequest, context: { params: Promise<{ offerId: string }> }) {
  try {
    await requireRole(["admin", "dispecer"], request)
    const { offerId } = await context.params
    if (!offerId) {
      return NextResponse.json({ error: "offerId lipsă." }, { status: 400 })
    }

    const pack = await buildCrmOfferEvidencePack(offerId)
    if (!pack) {
      return NextResponse.json({ error: "Oferta nu există." }, { status: 404 })
    }

    const format = request.nextUrl.searchParams.get("format")
    if (format === "json") {
      return new NextResponse(JSON.stringify(pack, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="dosar-oferta-${offerId}.json"`,
        },
      })
    }

    return NextResponse.json({ ok: true, pack })
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nu s-a putut genera dosarul." },
      { status: 500 },
    )
  }
}
