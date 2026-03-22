import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { isCrmInboxEnabled, linkCrmInboxMessageToOpportunity } from "@/lib/crm/inbox"
import type { CrmInboxLinkMethod } from "@/lib/crm/inbox-types"

const LINK_METHODS: CrmInboxLinkMethod[] = ["subject_code", "sender_contact", "manual_existing", "created_from_email"]

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function parsePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false as const, error: "Payload invalid" }
  }

  const data = body as Record<string, unknown>
  const inboxMessageId = normalizeString(data.inboxMessageId)
  const opportunityId = normalizeString(data.opportunityId)
  const linkMethod = normalizeString(data.linkMethod)

  if (!inboxMessageId) {
    return { ok: false as const, error: "inboxMessageId este obligatoriu" }
  }

  if (!opportunityId) {
    return { ok: false as const, error: "opportunityId este obligatoriu" }
  }

  if (!LINK_METHODS.includes(linkMethod as CrmInboxLinkMethod)) {
    return { ok: false as const, error: "linkMethod invalid" }
  }

  return {
    ok: true as const,
    data: {
      inboxMessageId,
      opportunityId,
      linkMethod: linkMethod as CrmInboxLinkMethod,
    },
  }
}

export async function POST(request: NextRequest) {
  if (!isCrmInboxEnabled()) {
    return NextResponse.json({ error: "CRM Inbox disabled" }, { status: 404 })
  }

  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Sesiune invalidă sau expirată." }, { status: 401 })
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "JSON invalid" }, { status: 400 })
    }

    const parsed = parsePayload(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    const item = await linkCrmInboxMessageToOpportunity({
      ...parsed.data,
      actorId: session.uid,
    })

    return NextResponse.json({ ok: true, item })
  } catch (error) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    if (error instanceof Error) {
      if (error.message === "Mesajul inbox nu exista") {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
      if (error.message === "Mesajul inbox este deja legat la o alta oportunitate") {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      if (error.message === "Oportunitatea nu exista sau nu ai acces la ea") {
        return NextResponse.json({ error: error.message }, { status: 404 })
      }
    }

    console.error("[CRM Inbox] link failed", error)
    return NextResponse.json({ error: "Eroare la legarea emailului" }, { status: 500 })
  }
}
