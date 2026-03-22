import { NextResponse, type NextRequest } from "next/server"
import { requireRole, RequireRoleError } from "@/lib/auth/require-role"
import { listCrmInboxMessages, isCrmInboxEnabled } from "@/lib/crm/inbox"
import {
  CRM_INBOX_CATEGORIES,
  CRM_INBOX_LINK_STATES,
  CRM_INBOX_STATUSES,
  type CrmInboxCategory,
  type CrmInboxLinkState,
  type CrmInboxStatus,
} from "@/lib/crm/inbox-types"

function validateStatus(value: string | null) {
  if (!value) return undefined
  return (CRM_INBOX_STATUSES as readonly string[]).includes(value) ? (value as CrmInboxStatus) : null
}

function validateCategory(value: string | null) {
  if (!value) return undefined
  return (CRM_INBOX_CATEGORIES as readonly string[]).includes(value) ? (value as CrmInboxCategory) : null
}

function validateLinkState(value: string | null) {
  if (!value) return undefined
  return (CRM_INBOX_LINK_STATES as readonly string[]).includes(value) ? (value as CrmInboxLinkState) : null
}

export async function GET(request: NextRequest) {
  if (!isCrmInboxEnabled()) {
    return NextResponse.json({ error: "CRM Inbox disabled" }, { status: 404 })
  }

  try {
    const session = await requireRole(["admin", "dispecer", "tehnician"], request)
    const searchParams = request.nextUrl.searchParams
    const status = validateStatus(searchParams.get("status"))
    const category = validateCategory(searchParams.get("category"))
    const linkState = validateLinkState(searchParams.get("linkState"))
    const assignedToUserId = searchParams.get("assignedTo")?.trim() || undefined

    if (status === null) {
      return NextResponse.json({ error: "status invalid" }, { status: 400 })
    }

    if (category === null) {
      return NextResponse.json({ error: "category invalida" }, { status: 400 })
    }

    if (linkState === null) {
      return NextResponse.json({ error: "linkState invalid" }, { status: 400 })
    }

    const result = await listCrmInboxMessages({ status, category, assignedToUserId, linkState, limit: 100 }, session.uid || undefined)
    return NextResponse.json({ ok: true, items: result.items, meta: result.meta })
  } catch (error) {
    const status = error instanceof RequireRoleError ? error.status : 403
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error("[CRM Inbox] list failed", error)
    return NextResponse.json({ error: "Eroare la listare" }, { status: 500 })
  }
}
