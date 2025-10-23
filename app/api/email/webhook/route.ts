import { NextResponse } from "next/server"
import { updateEmailEvent } from "@/lib/firebase/firestore"

// Basic webhook scaffold for providers (SendGrid/Mailgun/Postmark)
export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({})) as any
    // Expecting something like: { messageId, status, event, provider, emailEventId }
    const emailEventId = payload?.emailEventId as string | undefined
    const messageId = payload?.messageId as string | undefined
    const status = (payload?.status || payload?.event || "").toString().toLowerCase()

    const mapped: any = {}
    if (messageId) mapped.messageId = messageId
    if (status.includes("deliver")) mapped.status = "delivered"
    else if (status.includes("bounce")) mapped.status = "bounced"
    else if (status.includes("sent")) mapped.status = "sent"
    else if (status.includes("fail")) mapped.status = "failed"

    if (emailEventId && Object.keys(mapped).length) {
      await updateEmailEvent(emailEventId, mapped)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
}


