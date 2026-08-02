import { NextResponse, type NextRequest } from "next/server"
import { RequireRoleError, requireVerifiedRole } from "@/lib/auth/require-role"
import { getActivityReport, parsePageSize } from "@/lib/reports/report-data.server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireVerifiedRole(["admin"], request)
    const params = request.nextUrl.searchParams
    const userId = String(params.get("userId") || "").trim()
    const from = String(params.get("from") || "").trim()
    const to = String(params.get("to") || "").trim()
    if (!userId || !from || !to) {
      return NextResponse.json({ error: "Utilizatorul și intervalul sunt obligatorii." }, { status: 400 })
    }
    const report = await getActivityReport({
      userId,
      from,
      to,
      cursor: params.get("cursor"),
      pageSize: parsePageSize(params.get("limit")),
    })
    return NextResponse.json(report)
  } catch (error) {
    const status = error instanceof RequireRoleError ? error.status : error instanceof Error ? 400 : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Raportul nu a putut fi generat." },
      { status },
    )
  }
}
