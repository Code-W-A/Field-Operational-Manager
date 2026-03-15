import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { listCrmClients, listCrmOpportunitiesForUser } from "@/lib/crm/opportunities"
import { getDateValue } from "@/lib/crm/activity"

function normalizeSearch(value: string | null) {
  return (value || "").trim()
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"])
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    const search = normalizeSearch(request.nextUrl.searchParams.get("q"))
    const [opportunities, clients] = await Promise.all([
      listCrmOpportunitiesForUser(session.uid, search ? { search } : undefined),
      listCrmClients(),
    ])

    const clientNameMap = new Map(clients.map((client) => [client.id, client.name]))
    const items = opportunities
      .slice(0, 20)
      .map((opportunity) => ({
        id: opportunity.id,
        code: opportunity.code,
        title: opportunity.title,
        displayTitle: opportunity.displayTitle,
        clientId: opportunity.clientId,
        clientName: clientNameMap.get(opportunity.clientId) || "Client necunoscut",
        updatedAt: getDateValue(opportunity.updatedAt)?.toISOString() || null,
      }))

    return NextResponse.json({ ok: true, items })
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("[CRM Opportunities] search failed", error)
    return NextResponse.json({ error: "Eroare la căutare" }, { status: 500 })
  }
}
