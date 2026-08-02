import { NextResponse, type NextRequest } from "next/server"
import { RequireRoleError, requireVerifiedRole } from "@/lib/auth/require-role"
import { listReportUsers } from "@/lib/reports/report-data.server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    await requireVerifiedRole(["admin"], request)
    return NextResponse.json({ users: await listReportUsers() })
  } catch (error) {
    const status = error instanceof RequireRoleError ? error.status : 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Nu s-au putut încărca utilizatorii." },
      { status },
    )
  }
}
