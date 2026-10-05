import { type NextRequest, NextResponse } from "next/server"
import path from "path"
import { requireRole, requireVerifiedRole, RequireRoleError } from "@/lib/auth/require-role"
import { adminDb } from "@/lib/firebase/admin"
import { emailDiagnosticsToMeta, extractEmailSendDiagnostics } from "@/lib/email/email-error-diagnostics.server"
import { logEmailEventServer, updateEmailEventServer } from "@/lib/email/email-events.server"
import { resolveMailTransport } from "@/lib/email/resolve-mail-transport.server"
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server"
import { loadCurrentTicketRecipients } from "@/lib/work-documents/current-ticket-recipients.server"
import { validateResendEmails } from "@/lib/work-documents/report-resend"
import { loadResendReport } from "@/lib/work-documents/report-resend.server"
import { sendReportSeparately } from "@/lib/work-documents/send-report-separately"

export async function POST(request: NextRequest) {
  let emailEventId: string | null = null
  let errorTo = "unknown"
  let errorSubject = "unknown"
  let errorLucrareId: string | null = null
  let actorUid: string | null = null
  let resendMode = false
  try {
    const formData = await request.formData()
    resendMode = formData.get("recipientMode") === "report-resend"
    const session = resendMode
      ? await requireVerifiedRole(["admin", "dispecer"], request)
      : await requireRole(["admin", "dispecer", "tehnician"], request)
    actorUid = session.uid
    if (!session.uid) {
      return NextResponse.json({ error: "Autentificare obligatorie (sesiune sau Bearer token)." }, { status: 401 })
    }

    let to = String(formData.get("to") || "")
    let subject = String(formData.get("subject") || "")
    let message = String(formData.get("message") || "")
    const pdfFile = formData.get("pdfFile") as File
    const currentTicketMode = formData.get("recipientMode") === "current-ticket"
    if (resendMode) {
      const workId = String(formData.get("lucrareId") || "").trim()
      let work: Record<string, any>
      let recipients: string[]
      try {
        work = await loadResendReport(workId)
        recipients = validateResendEmails(JSON.parse(String(formData.get("recipients") || "[]")))
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Cerere de retrimitere invalidă." }, { status: 400 })
      }
      const files = [pdfFile, ...((String(work.tipLucrare || "").toLowerCase() === "revizie" || formData.has("opsPdfFile")) ? [formData.get("opsPdfFile")] : [])]
      for (const file of files) {
        if (!(file instanceof File) || file.type !== "application/pdf" || !file.size || file.size > 10 * 1024 * 1024
          || Buffer.from(await file.slice(0, 5).arrayBuffer()).toString("ascii") !== "%PDF-") {
          return NextResponse.json({ error: "Raportul și fișele obligatorii trebuie să fie PDF-uri valide, de maximum 10 MB fiecare." }, { status: 400 })
        }
      }
      // The operator's confirmed list is authoritative: do not append live or historical addresses.
      to = recipients.join(", ")
      subject = `Raport Interventie - ${work.raportSnapshot?.clientSnapshot?.client || work.client || "Client"} - ${String(work.nrLucrare || work.numarRaport || workId)}`
      message = "Vă retransmitem atașat raportul de intervenție.\n\nCu stimă,\nFOM by NRG"
    }
    if (currentTicketMode) {
      const lucrareId = String(formData.get("lucrareId") || "").trim()
      if (!lucrareId) return NextResponse.json({ error: "ID-ul tichetului este obligatoriu" }, { status: 400 })
      let current: Awaited<ReturnType<typeof loadCurrentTicketRecipients>>
      try {
        current = await loadCurrentTicketRecipients(lucrareId, "report")
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Destinatarii actuali nu sunt disponibili" }, { status: 422 })
      }
      let manual: unknown
      try { manual = JSON.parse(String(formData.get("manualEmails") || "[]")) } catch {
        return NextResponse.json({ error: "Lista adreselor suplimentare este invalidă" }, { status: 400 })
      }
      if (!Array.isArray(manual) || manual.length > 20 || manual.some(value => typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))) {
        return NextResponse.json({ error: "Lista adreselor suplimentare este invalidă" }, { status: 400 })
      }
      to = Array.from(new Set([...current.emails, ...manual.map(value => String(value).trim().toLowerCase())])).join(", ")
      subject = `Raport Interventie - ${current.clientName || "Client"} - ${String(current.work.dataInterventie || "Data").split(" ")[0]}`
      message = `Stimata/Stimate ${current.contactName || "Client"},\n\nVa transmitem atasat raportul de interventie pentru lucrarea efectuata in data de ${String(current.work.dataInterventie || "N/A").split(" ")[0]}.\n\nCu stima,\nFOM by NRG`
    }
    errorTo = to || "unknown"
    errorSubject = subject || "unknown"
    errorLucrareId = (formData.get("lucrareId") as string) || null

    if (!to || !subject || !pdfFile) {
      return NextResponse.json(
        { error: "Adresa de email, subiectul si fisierul PDF sunt obligatorii" },
        { status: 400 },
      )
    }

    const resolved = await resolveMailTransport(session.uid)

    // Convertim fișierul PDF în buffer pentru atașament
    const arrayBuffer = await pdfFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Build absolute base URL for links (env then headers)
    const envBase = process.env.NEXT_PUBLIC_APP_URL
    const proto = request.headers.get("x-forwarded-proto") || "https"
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
    const headerBase = host ? `${proto}://${host}` : ""
    const rawBase = envBase || headerBase
    const base = rawBase && !rawBase.startsWith("http://") && !rawBase.startsWith("https://")
      ? `https://${rawBase}`
      : rawBase

    // Extract lucrareId for feedback links (optional)
    const lucrareId = (formData.get("lucrareId") as string) || ""
    const reviewBaseUrl = lucrareId ? `${base}/review/${encodeURIComponent(lucrareId)}` : ""
    const starsRow = lucrareId
      ? `<div style="margin:16px 0;">
          <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;">
            <strong>Acordă recenzie pentru tehnician:</strong>
          </p>
          <div style="white-space:nowrap;">
            <a href="${reviewBaseUrl}?r=1" style="text-decoration:none;color:#FFA500;font-size:32px;margin-right:4px;display:inline-block;">☆</a>
            <a href="${reviewBaseUrl}?r=2" style="text-decoration:none;color:#FFA500;font-size:32px;margin-right:4px;display:inline-block;">☆</a>
            <a href="${reviewBaseUrl}?r=3" style="text-decoration:none;color:#FFA500;font-size:32px;margin-right:4px;display:inline-block;">☆</a>
            <a href="${reviewBaseUrl}?r=4" style="text-decoration:none;color:#FFA500;font-size:32px;margin-right:4px;display:inline-block;">☆</a>
            <a href="${reviewBaseUrl}?r=5" style="text-decoration:none;color:#FFA500;font-size:32px;display:inline-block;">☆</a>
          </div>
        </div>`
      : ""

    // Construim HTML-ul pentru email
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
        </div>
        <h2 style="color: #0f56b3;">Raport de Interventie</h2>
        <p>${message || "Va transmitem atasat raportul de interventie."}</p>
        <p>Raportul este atasat in format PDF.</p>
        ${starsRow}
        <hr style="border: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #666; font-size: 12px;">Acest email a fost generat automat. Va rugam sa nu raspundeti la acest email.</p>
      </div>
    `

    // Configurăm opțiunile emailului
    const mailOptions = {
      from: resolved.mailFrom,
      to,
      subject,
      text: message || "Va transmitem atasat raportul de interventie.",
      html: htmlContent,
      attachments: [
        {
          filename: pdfFile.name || "raport_interventie.pdf",
          content: buffer,
          contentType: "application/pdf",
        },
        // atașament opțional: fișe operațiuni revizie
        ...(formData.get("opsPdfFile")
          ? (() => {
              const f = formData.get("opsPdfFile") as File
              return [{
                filename: (f?.name as string) || "fise_operatiuni_revizie.pdf",
                content: Buffer.from([]), // placeholder, replaced below
                contentType: "application/pdf",
              }]
            })()
          : []),
        {
          filename: "logo.png",
          path: path.join(process.cwd(), "public", "nrglogo.png"),
          cid: "company-logo",
          // Add a fallback in case the file doesn't exist
          fallback: {
            content: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAADsklEQVR4nO3dy27UQBCF4T7vwIINCIQQj8CCBYgbAgQIJO5PwCNwCUgIkEDiBQhrFizYAFIUy5E8GsfT7e7q7vN/UkuTiZNMprqrfLqSGQEAAAAAAAAAAAAAAAAAAAAAAAAAAADQpZnUDUBnTkk6J+m0pFOSjks6IumQpL2S9tj/+yDpvaR3kt5KeiPptaRXkl5K+tJpy9GKA5IuS7oi6aKkC5LOWlJMYknzXNJTSU8kPZb0Y+J7oiVnJN2UdE/SN0nrDV/fJd2VdMPagg7tl3RD0kNJP9V8UvS9fkq6L+m6pJkG7QQOSLoj6Zfan/xbX7/s3nRCYZqZpKuSXqj7xNj6emH3pjOLCR2V9EjdJ0HM66Hd+9BjZummpO/qPuHjXt/t3oeGzkv6qO6TvK3XR+sHGnBY0hN1n9RtvZ5YfzCh65K+qvtkbvv11fqDCc5J+qzuk7ir12frFyZwW90ncdfXLesXRnRU0jt1n7h9vN5Z/zCCmaSn6j5Z+3w9tX5iBDfUfZL2fb1W/mPzWdkv6aO6T9AhXh+snxjgmvJfFI99rVX+Y/RZ2afuk3LI1z3lP0afje/qPhGHfH1T/mP1WXim7pNw6Ncz5T9mn4Xryn+3eOzruvIfuw/eIeW/Wzz265DyH78P2i3ln3hjXbeU//h9sA5K+qT8E26s1yflvw0+WDeVf7KNfbGDPGBHlH+ijX0dUf7b4oN0XfknWVvXdeW/PT4o+5R/grV97VP+2+SDclH5J1fb10Xlv10+GDPlv8Xb1TXTgG33QbikYRPjv6Qnkh5IuivpD0l/Svpb0j+S/pL0u6TfJP1qP/9L0p+S/rD//0DSY0nfB7ThouiHDMZMwyZFcZb7oaTfJf0xoA1/2e8+tN8tzvIfMqAdM+U/jh+EmYZNiEeSrg1ow1VJjwe24ZryH8cPwkzDJsNY/8NnA9txVfmP4wdhpmGTYcxzrYY+5Zon3WDMNGwyMEEGZKZhk4EJMiAzDZsMTJABmWnYZGCCDMhMwyYDE2RAZho2GZggAzLTsMnABBmQmYZNBibIgMw0bDIwQQZkpmGTgQkyIDMNmwxMkAGZadhkYIIMyEzDJgMTZEBmGjYZmCADMtOwyTDWBJlp2LnWTJAOzTRsMox1LtRMw861ZoJ0aKZhk2GsE/VmGnauNROkQzMNmwxjnahfU/5j+EGYadgEKU7U+9/+98X//l/8738P+d//iv/9f8j//lf87/9D/ve/4n//H/K//xX/+/+Q//2v+N//h/zvf8X//j/kf/8r/vd/AAAAAAAAAAAAAAAAAAAAAAAAAAAAgAz9C5gVeUGpivY2AAAAAElFTkSuQmCC",
              "base64",
            ),
            contentType: "image/png",
          },
        },
      ],
    }

    // Înregistrăm eveniment QUEUED
    try {
      const lucrareId = (formData.get("lucrareId") as string) || undefined
      const clientId = (formData.get("clientId") as string) || undefined
      const toList = String(to || "")
        .split(/[;,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      emailEventId = await logEmailEventServer({
        type: "REPORT",
        lucrareId,
        clientId,
        to: toList.length ? toList : [String(to || "")].filter(Boolean),
        subject,
        status: "queued",
        provider: "smtp",
        meta: {
          route: "/api/send-email",
          hasOpsPdfFile: Boolean(formData.get("opsPdfFile")),
          pdfName: (pdfFile as any)?.name || undefined,
          smtpTransportSource: resolved.source,
          actorUid: session.uid,
          action: resendMode ? "report-resend" : "report-send",
        },
      })
    } catch (error) {
      console.error("Eroare la logging eveniment email queued:", error)
    }

    // Dacă avem atașament suplimentar (opsPdfFile), îl încărcăm corect în attachments[1]
    const opsFile = formData.get("opsPdfFile") as File | null
    if (opsFile) {
      const arr = await opsFile.arrayBuffer()
      const buf = Buffer.from(arr)
      ;(mailOptions.attachments as any[])[1] = {
        filename: opsFile.name || "fise_operatiuni_revizie.pdf",
        content: buf,
        contentType: "application/pdf",
      }
    }

    // Trimitem emailul
    const sendParams: Parameters<typeof sendMailWithSentCopy>[0] = {
      transporter: resolved.transporter,
      mailOptions,
      smtpAuth: resolved.smtpAuth,
      imapContext: {
        route: "/api/send-email",
        emailEventId: emailEventId || undefined,
        flow: "report",
      },
    }
    if (resolved.imapExplicit !== undefined) {
      sendParams.imapExplicit = resolved.imapExplicit
    }
    // Reports were historically sent one message per recipient. Keep that privacy
    // property while deriving the list exclusively from the current client record.
    const recipients = String(to).split(/[;,]+/).map(value => value.trim()).filter(Boolean)
    let sent: string[] = []
    let failed: string[] = []
    let info: Awaited<ReturnType<typeof sendMailWithSentCopy>> | undefined
    if (currentTicketMode || resendMode) {
      const delivery = await sendReportSeparately(recipients, recipient =>
        sendMailWithSentCopy({ ...sendParams, mailOptions: { ...mailOptions, to: recipient } }))
      sent = delivery.sent; failed = delivery.failed; info = delivery.lastResult
    } else {
      info = await sendMailWithSentCopy(sendParams)
      sent.push(...recipients)
    }

    // Actualizăm evenimentul la SENT
    try {
      if (emailEventId) {
        await updateEmailEventServer(emailEventId, {
          status: failed.length ? "failed" : "sent",
          messageId: info?.messageId,
          meta: { smtpTransportSource: resolved.source, sent, failed, actorUid: session.uid, action: resendMode ? "report-resend" : "report-send" },
        })
      }
      const lucrareId = (formData.get("lucrareId") as string) || undefined
      if (lucrareId) {
        const lastReportEmail = {
          sentAt: new Date().toISOString(), to: recipients,
          status: failed.length ? "failed" : "sent",
          ...(info?.messageId ? { messageId: info.messageId } : {}),
          ...(resendMode ? { actorUid: session.uid, action: "report-resend", sent, failed } : {}),
        }
        const ref = adminDb.collection("lucrari").doc(String(lucrareId))
        if (resendMode) await ref.update({ lastReportEmail })
        else await ref.set({ lastReportEmail }, { merge: true })
      }
    } catch (error) {
      console.error("Eroare la logging eveniment email sent:", error)
    }

    // TODO: Add logging when admin permissions are properly configured
    console.log(`Email sent successfully to: ${sent.join(", ")}`)

    if (failed.length) return NextResponse.json({ success: false, error: "Raportul nu a ajuns la toți destinatarii.", sent, failed }, { status: 502 })
    return NextResponse.json({ success: true, recipients: sent, sent, failed })
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const diag = extractEmailSendDiagnostics(error)
    console.error("Eroare la trimiterea emailului:", error)

    try {
      if (errorLucrareId) {
        await adminDb.collection("lucrari").doc(String(errorLucrareId)).set(
          {
            lastReportEmail: {
              ...(resendMode ? { actorUid, action: "report-resend" } : {}),
              sentAt: new Date().toISOString(),
              to: String(errorTo || "")
                .split(/[;,]+/)
                .map((s) => s.trim())
                .filter(Boolean),
              status: "failed",
            },
          },
          { merge: true },
        )
      }
    } catch (parseError) {
      console.error("Eroare la actualizarea lucrării după eșec email:", parseError)
    }
    
    try {
      if (emailEventId) {
        await updateEmailEventServer(emailEventId, {
          status: "failed",
          error: diag.summary,
          meta: {
            route: "/api/send-email",
            failureStage: "report_route",
            emailDiagnostics: emailDiagnosticsToMeta(diag),
          },
        })
      } else {
        await logEmailEventServer({
          type: "REPORT",
          lucrareId: errorLucrareId || undefined,
          to: String(errorTo || "")
            .split(/[;,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
          subject: errorSubject,
          status: "failed",
          provider: "smtp",
          error: diag.summary,
          meta: {
            route: "/api/send-email",
            failureStage: "report_route_no_queued_id",
            emailDiagnostics: emailDiagnosticsToMeta(diag),
          },
        })
      }
    } catch (logErr) {
      console.error("Eroare la logarea email failed (server):", logErr)
    }

    return NextResponse.json({
      error: "A aparut o eroare la trimiterea emailului",
      details: diag.summary,
    }, { status: 500 })
  }
}
