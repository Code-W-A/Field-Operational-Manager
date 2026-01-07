import { NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { logEmailEvent, updateEmailEvent, updateLucrare, addUserLogEntry } from "@/lib/firebase/firestore"
import { getEmailFrom } from "@/lib/email/from"

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
    try {
      const inferredLucrareId = (Array.isArray((attachments as any)) && (attachments as any)[0]?.lucrareId) || undefined
      const inferredType = String(type || "").toUpperCase() === "REPORT"
        ? "REPORT"
        : String(type || "").toUpperCase() === "OFFER"
          ? "OFFER"
          : inferredLucrareId
            ? "OFFER"
            : "GENERIC"

      emailEventId = await logEmailEvent({
        type: inferredType as any,
        lucrareId: inferredLucrareId,
        to: to as string[],
        subject: subject || "Email – FOM",
        status: "queued",
        provider: "smtp",
      })
      
      // Log în colecția logs pentru vizualizare în EmailLogViewer
      await addUserLogEntry({
        actiune: inferredType === "OFFER" ? "Email ofertă (în coadă)" : inferredType === "REPORT" ? "Email raport (în coadă)" : "Email (în coadă)",
        detalii: `Email în coadă: "${subject || "Email – FOM"}" către ${(to as string[]).join(", ")}${inferredLucrareId ? ` | Tichet: ${String(inferredLucrareId)}` : ""}`,
        tip: "Informație",
        categorie: "Email",
      })
    } catch (error) {
      console.error("Eroare la logging eveniment email queued:", error)
    }

    const info = await transporter.sendMail({
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
      
      // Log succes în colecția logs
      await addUserLogEntry({
        actiune: (String(type || "").toUpperCase() === "OFFER" || ((Array.isArray((attachments as any)) && (attachments as any)[0]?.lucrareId)))
          ? "Email ofertă (trimis)"
          : String(type || "").toUpperCase() === "REPORT"
            ? "Email raport (trimis)"
            : "Email (trimis)",
        detalii: `Email trimis (acceptat de serverul SMTP): "${subject || "Email – FOM"}" către ${(to as string[]).join(", ")}\nMessageID: ${info.messageId}${emailEventId ? `\nEventID: ${emailEventId}` : ""}`,
        tip: "Informație",
        categorie: "Email",
      })
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
        await updateLucrare(lucrareId, {
          lastOfferEmail: {
            sentAt: new Date().toISOString(),
            to: errorTo,
            status: "failed",
          }
        } as any, undefined, undefined, true)
      }
    } catch (parseError) {
      console.error("Eroare la parsarea body pentru logging:", parseError)
    }

    // Mark failed in emailEvents too (if we managed to create it)
    try {
      if (emailEventId) await updateEmailEvent(emailEventId, { status: "failed", error: details.message || String(e) })
    } catch (eventError) {
      console.error("Eroare la update email event failed:", eventError)
    }
    
    // Log eroare în colecția logs
    try {
      await addUserLogEntry({
        actiune: "Eroare trimitere email",
        detalii: `Eroare la trimitere: "${errorSubject}" către ${errorTo.join(", ")}\nEroare: ${details.message || String(e)}\nCod: ${details.code || "N/A"}\nComandă: ${details.command || "N/A"}\nRăspuns: ${details.response || "N/A"}\nStack: ${e?.stack || "N/A"}${emailEventId ? `\nEventID: ${emailEventId}` : ""}`,
        tip: "Eroare",
        categorie: "Email",
      })
    } catch (logError) {
      console.error("Eroare la logging eveniment email failed:", logError)
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


