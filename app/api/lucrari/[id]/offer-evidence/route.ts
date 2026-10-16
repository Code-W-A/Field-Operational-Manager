import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { buildLucrariEvidencePack } from "@/lib/offer/evidence-aggregate.server"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["admin", "dispecer"], request)
    const { id: lucrareId } = await context.params
    if (!lucrareId) {
      return NextResponse.json({ error: "lucrareId lipsă." }, { status: 400 })
    }

    const pack = await buildLucrariEvidencePack(lucrareId)
    const format = request.nextUrl.searchParams.get("format")

    if (format === "json") {
      return new NextResponse(JSON.stringify(pack, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="dosar-oferta-${lucrareId}.json"`,
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
