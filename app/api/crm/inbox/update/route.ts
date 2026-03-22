import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { getCrmInboxMessageById, isCrmInboxEnabled, parseCrmInboxUpdateInput, updateCrmInboxMessage } from "@/lib/crm/inbox"

export async function PATCH(request: NextRequest) {
  if (!isCrmInboxEnabled()) {
    return NextResponse.json({ error: "CRM Inbox disabled" }, { status: 404 })
  }

  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], request)

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON invalid" }, { status: 400 })
    }

    const parsed = parseCrmInboxUpdateInput(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    await updateCrmInboxMessage(parsed.data)
    const item = await getCrmInboxMessageById(parsed.data.id, session.uid || undefined)
    return NextResponse.json({ ok: true, item })
  } catch (error) {
    const status = error instanceof RequireRoleError ? error.status : 403
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status })
    }

    if (error instanceof Error && error.message === "Mesajul inbox nu exista") {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    console.error("[CRM Inbox] update failed", error)
    return NextResponse.json({ error: "Eroare la actualizare" }, { status: 500 })
  }
}
