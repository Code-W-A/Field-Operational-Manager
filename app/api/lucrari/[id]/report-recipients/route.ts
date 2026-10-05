import { NextRequest, NextResponse } from "next/server"
import { requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role"
import { loadResendRecipients } from "@/lib/work-documents/report-resend.server"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireVerifiedRole(["admin", "dispecer"], request)
    const { id } = await context.params
    const recipients = await loadResendRecipients(id)
    return NextResponse.json(recipients, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Destinatarii nu pot fi încărcați." }, {
      status: error instanceof RequireRoleError ? error.status : 422,
      headers: { "Cache-Control": "no-store" },
    })
  }
}
