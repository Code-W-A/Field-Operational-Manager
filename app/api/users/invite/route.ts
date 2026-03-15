import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { getEmailFrom } from "@/lib/email/from"
import { adminDb } from "@/lib/firebase/admin"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server"

export async function POST(request: Request) {
  // IMPORTANT: Request body can be read only once. Keep a copy for both success + error logging.
  let body: any = null
  try {
    body = await request.json()
  } catch {
    body = null
  }

  // Track eventId so we can update it on failures too.
  let emailEventId: string | null = null

  try {
    const { to, subject, content, html, attachments, type } = body || {}
    if (!to || !Array.isArray(to) || to.length === 0) {
      return NextResponse.json({ error: "Destinatari lipsă" }, { status: 400 })
    }

    const smtpUser = process.env.EMAIL_USER || "fom@nrg-acces.ro"
    const smtpPass = process.env.EMAIL_PASS || "FOM@nrg25"
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "mail.nrg-acces.ro",
      port: Number(process.env.EMAIL_PORT || 465),
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    // Log queued
    try {
      const inferredLucrareId = (Array.isArray((attachments as any)) && (attachments as any)[0]?.lucrareId) || undefined
      const normalizedType = String(type || "").toUpperCase()
      const inferredType =
        normalizedType === "REPORT"
          ? "REPORT"
          : normalizedType === "OFFER"
            ? "OFFER"
            : normalizedType === "DEVIZ"
              ? "DEVIZ"
              : inferredLucrareId
                ? "OFFER"
                : "GENERIC"

      emailEventId = await logEmailEventServer({
        type:
          inferredType === "REPORT"
            ? "REPORT"
            : inferredType === "OFFER"
              ? "OFFER"
              : inferredType === "DEVIZ"
                ? "DEVIZ"
                : "INVITE",
        lucrareId: inferredLucrareId,
        to: (to as string[]) || [],
        subject: subject || "Email – FOM",
        status: "queued",
        provider: "smtp",
        meta: {
          route: "/api/users/invite",
          inviteType: inferredType,
          attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
        },
      })
    } catch (error) {
      console.error("Eroare la logging eveniment email queued:", error)
    }

    const info = await sendMailWithSentCopy({
      transporter,
      smtpAuth: { user: smtpUser, pass: smtpPass },
      mailOptions: {
      from: getEmailFrom(),
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
      },
      imapContext: {
        route: "/api/users/invite",
        emailEventId: emailEventId || undefined,
        flow: String(type || "invite").toLowerCase(),
      },
    })

    // mark sent
    try {
      if (emailEventId) await updateEmailEventServer(emailEventId, { status: "sent", messageId: info.messageId })
      const lucrareId = (Array.isArray((attachments as any)) && (attachments as any)[0]?.lucrareId) || undefined
      if (lucrareId) {
        const emailStatusField =
          String(type || "").toUpperCase() === "DEVIZ" ? "lastDevizEmail" : "lastOfferEmail"
        await adminDb.collection("lucrari").doc(String(lucrareId)).set(
          {
            [emailStatusField]: {
              sentAt: new Date().toISOString(),
              to: (to as string[]) || [],
              status: "sent",
              messageId: info.messageId,
            },
          },
          { merge: true },
        )
      }
    } catch (error) {
      console.error("Eroare la logging eveniment email sent:", error)
    }

    return NextResponse.json({
      success: true,
      messageId: info.messageId,
      emailEventId,
      acceptedBySmtp: true,
    })
  } catch (e: any) {
    console.error("Invite email error", e)
    
    let errorTo: string[] = []
    let errorSubject = "unknown"
    const details = {
      message: e?.message,
      code: e?.code,
      command: e?.command,
      response: e?.response,
      responseCode: e?.responseCode,
    }
    
    try {
      errorTo = Array.isArray(body?.to) ? body.to : []
      errorSubject = body?.subject || "Email – FOM"
      
      const lucrareId = (Array.isArray((body?.attachments as any)) && (body?.attachments as any)[0]?.lucrareId) || undefined
      if (lucrareId) {
        const emailStatusField =
          String(body?.type || "").toUpperCase() === "DEVIZ" ? "lastDevizEmail" : "lastOfferEmail"
        await adminDb.collection("lucrari").doc(String(lucrareId)).set(
          {
            [emailStatusField]: {
              sentAt: new Date().toISOString(),
              to: errorTo,
              status: "failed",
            },
          },
          { merge: true },
        )
      }
    } catch (parseError) {
      console.error("Eroare la parsarea body pentru logging:", parseError)
    }

    // Mark failed in emailEvents too (if we managed to create it)
    try {
      if (emailEventId) await updateEmailEventServer(emailEventId, { status: "failed", error: details.message || String(e) })
      if (!emailEventId) {
        await logEmailEventServer({
          type:
            String(body?.type || "").toUpperCase() === "REPORT"
              ? "REPORT"
              : String(body?.type || "").toUpperCase() === "OFFER"
                ? "OFFER"
                : String(body?.type || "").toUpperCase() === "DEVIZ"
                  ? "DEVIZ"
                  : "INVITE",
          lucrareId: (Array.isArray((body?.attachments as any)) && (body?.attachments as any)[0]?.lucrareId) || undefined,
          to: errorTo,
          subject: errorSubject,
          status: "failed",
          provider: "smtp",
          error: details.message || String(e),
          meta: {
            route: "/api/users/invite",
            code: details.code,
            command: details.command,
          },
        })
      }
    } catch (eventError) {
      console.error("Eroare la update email event failed:", eventError)
    }
    
    return NextResponse.json({ 
      error: "Eroare trimitere email",
      details,
      emailEventId,
      to: errorTo,
      subject: errorSubject,
    }, { status: 500 })
  }
}
