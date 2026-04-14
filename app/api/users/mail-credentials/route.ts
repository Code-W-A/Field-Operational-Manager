import { type NextRequest, NextResponse } from "next/server"
import { RequireRoleError, requireRole } from "@/lib/auth/require-role"
import {
  deleteMailCredentialsForUser,
  getMailCredentialsForUser,
  saveMailCredentialsForUser,
} from "@/lib/users/mail-credentials-store.server"

function requireActorUid(actor: { uid: string | null; role: string }) {
  if (!actor.uid) {
    return NextResponse.json(
      { error: "Autentificare obligatorie (sesiune sau Bearer token)." },
      { status: 401 },
    )
  }
  return null
}

export async function GET(request: NextRequest) {
  try {
    const actor = await requireRole(["admin", "dispecer"], request)
    const denied = requireActorUid(actor)
    if (denied) return denied

    const userId = request.nextUrl.searchParams.get("userId")?.trim()
    if (!userId) {
      return NextResponse.json({ error: "Parametrul userId este obligatoriu" }, { status: 400 })
    }

    const data = await getMailCredentialsForUser(userId)
    return NextResponse.json({ credentials: data })
  } catch (e) {
    if (e instanceof RequireRoleError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[mail-credentials GET]", e)
    return NextResponse.json({ error: "Eroare la citirea configurației" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireRole(["admin", "dispecer"], request)
    const denied = requireActorUid(actor)
    if (denied) return denied

    const body = await request.json()
    const userId = typeof body?.userId === "string" ? body.userId.trim() : ""
    if (!userId) {
      return NextResponse.json({ error: "userId este obligatoriu" }, { status: 400 })
    }

    const smtpPort = Number.parseInt(String(body?.smtpPort ?? "465"), 10)
    const imapPort = Number.parseInt(String(body?.imapPort ?? "993"), 10)

    await saveMailCredentialsForUser(
      userId,
      {
        smtpHost: String(body?.smtpHost ?? ""),
        smtpPort: Number.isFinite(smtpPort) ? smtpPort : 465,
        smtpSecure: body?.smtpSecure !== false,
        smtpUser: String(body?.smtpUser ?? ""),
        smtpPassword: typeof body?.smtpPassword === "string" ? body.smtpPassword : undefined,
        clearSmtpPassword: body?.clearSmtpPassword === true,
        imapHost: String(body?.imapHost ?? ""),
        imapPort: Number.isFinite(imapPort) ? imapPort : 993,
        imapSecure: body?.imapSecure !== false,
        imapUser: String(body?.imapUser ?? ""),
        imapPassword: typeof body?.imapPassword === "string" ? body.imapPassword : undefined,
        clearImapPassword: body?.clearImapPassword === true,
      },
      actor.uid!,
    )

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    if (e instanceof RequireRoleError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("USER_EMAIL_SECRETS_KEY")) {
      return NextResponse.json(
        { error: "Server: lipsește USER_EMAIL_SECRETS_KEY pentru salvarea parolelor." },
        { status: 503 },
      )
    }
    console.error("[mail-credentials POST]", e)
    return NextResponse.json({ error: msg || "Eroare la salvare" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const actor = await requireRole(["admin", "dispecer"], request)
    const denied = requireActorUid(actor)
    if (denied) return denied

    const userId = request.nextUrl.searchParams.get("userId")?.trim()
    if (!userId) {
      return NextResponse.json({ error: "Parametrul userId este obligatoriu" }, { status: 400 })
    }

    await deleteMailCredentialsForUser(userId)
    return NextResponse.json({ success: true })
  } catch (e) {
    if (e instanceof RequireRoleError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    console.error("[mail-credentials DELETE]", e)
    return NextResponse.json({ error: "Eroare la ștergere" }, { status: 500 })
  }
}
