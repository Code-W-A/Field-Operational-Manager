import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { logEmailEvent, updateEmailEvent, updateLucrare } from "@/lib/firebase/firestore"

export async function POST(request: Request) {
  try {
    const { to, subject, content, html, attachments } = await request.json()
    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: "Destinatari lipsă" }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "mail.nrg-acces.ro",
      port: Number(process.env.EMAIL_PORT || 465),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASS || "FOM@nrg25",
      },
    })

    // Log queued
    let emailEventId: string | null = null
    try {
      emailEventId = await logEmailEvent({
        type: "OFFER",
        lucrareId: (Array.isArray((attachments as any)) && (attachments as any)[0]?.lucrareId) || undefined,
        to: to as string[],
        subject: subject || "Invitație acces Portal Client – FOM",
        status: "queued",
        provider: "smtp",
      })
    } catch {}

    const info = await transporter.sendMail({
      from: `Field Operational Manager <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
      to,
      subject: subject || "Invitație acces Portal Client – FOM",
      text: content || "Vă-am creat acces în Portalul Client FOM.",
      html: html || undefined,
      attachments: Array.isArray(attachments) ? attachments.map((a: any) => ({
        filename: String(a?.filename || 'attachment'),
        content: a?.content,
        encoding: a?.encoding || undefined,
        contentType: a?.contentType || undefined,
      })) : undefined,
    })

    // mark sent
    try {
      if (emailEventId) await updateEmailEvent(emailEventId, { status: "sent", messageId: info.messageId })
      const lucrareId = (Array.isArray((attachments as any)) && (attachments as any)[0]?.lucrareId) || undefined
      if (lucrareId) {
        await updateLucrare(lucrareId, {
          lastOfferEmail: {
            sentAt: new Date().toISOString(),
            to: to as string[],
            status: "sent",
            messageId: info.messageId,
          }
        } as any, undefined, undefined, true)
      }
    } catch {}

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error("Invite email error", e)
    try {
      const body = await request.json().catch(() => ({}))
      const lucrareId = (Array.isArray((body?.attachments as any)) && (body?.attachments as any)[0]?.lucrareId) || undefined
      if (lucrareId) {
        await updateLucrare(lucrareId, {
          lastOfferEmail: {
            sentAt: new Date().toISOString(),
            to: Array.isArray(body?.to) ? body.to : [],
            status: "failed",
          }
        } as any, undefined, undefined, true)
      }
    } catch {}
    return NextResponse.json({ error: "Eroare trimitere invitație" }, { status: 500 })
  }
}


