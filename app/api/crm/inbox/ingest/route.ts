import { NextResponse, type NextRequest } from "next/server"
import { ingestCrmInboxMessages, isCrmInboxEnabled } from "@/lib/crm/inbox"
import type { CrmInboxIngestInput } from "@/lib/crm/inbox-types"

function parsePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false as const, error: "Payload invalid" }
  }

  const messages = (body as { messages?: unknown }).messages
  if (!Array.isArray(messages)) {
    return { ok: false as const, error: "messages trebuie sa fie array" }
  }

  return { ok: true as const, messages: messages as CrmInboxIngestInput[] }
}

export async function POST(request: NextRequest) {
  if (!isCrmInboxEnabled()) {
    return NextResponse.json({ error: "CRM Inbox disabled" }, { status: 404 })
  }

  const secret = process.env.CRM_INBOX_INGEST_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRM Inbox ingest not configured" }, { status: 503 })
  }

  if (request.headers.get("x-crm-inbox-secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
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

  try {
    const result = await ingestCrmInboxMessages(parsed.messages)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[CRM Inbox] ingest failed", error)
    return NextResponse.json({ error: "Eroare la ingest" }, { status: 500 })
  }
}
