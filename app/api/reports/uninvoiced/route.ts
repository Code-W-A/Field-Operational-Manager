import { NextResponse, type NextRequest } from "next/server"
import { RequireRoleError, requireVerifiedRole } from "@/lib/auth/require-role"
import { getUninvoicedReport, parsePageSize } from "@/lib/reports/report-data.server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireVerifiedRole(["admin"], request)
    const params = request.nextUrl.searchParams
    const report = await getUninvoicedReport({
      filters: {
        search: params.get("search") || "",
        client: params.get("client") || "",
        workType: params.get("workType") || "",
        workStatus: params.get("workStatus") || "",
      },
      cursor: params.get("cursor"),
      pageSize: parsePageSize(params.get("limit")),
    })
    return NextResponse.json(report)
  } catch (error) {
    const status = error instanceof RequireRoleError ? error.status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Raportul nu a putut fi generat." },
      { status },
    )
  }
}
