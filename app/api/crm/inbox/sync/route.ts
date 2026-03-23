import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { isCrmInboxEnabled } from "@/lib/crm/inbox"
import { syncCrmInboxFromImap } from "@/lib/crm/inbox-sync.server"

export async function POST(request: NextRequest) {
  if (!isCrmInboxEnabled()) {
    return NextResponse.json({ error: "CRM Inbox disabled" }, { status: 404 })
  }

  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    const result = await syncCrmInboxFromImap(session.uid)
    if (!result.ok) {
      const status = result.reason === "not_configured" ? 503 : 500
      return NextResponse.json({ error: result.error }, { status })
    }

    const { ok: _ok, ...sync } = result
    return NextResponse.json({ ok: true, sync })
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[CRM Inbox] sync failed", error)
    return NextResponse.json({ error: "Eroare la sincronizare" }, { status: 500 })
  }
}
