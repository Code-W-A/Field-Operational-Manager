import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { logEmailEvent, updateEmailEvent, addUserLogEntry } from "@/lib/firebase/firestore"
import { logDebug, logInfo, logWarning, logError } from "@/lib/utils/logging-service"
import path from "path"
import fs from "fs"

// Add this function at the top of the file
async function validateEmails(data: any) {
  // Check if client email is valid
  if (data.client && data.client.email) {
    const clientEmailValid = isValidEmail(data.client.email)
    if (!clientEmailValid) {
      console.log(`Invalid client email format: ${data.client.email}`)
      data.client.email = "" // Clear invalid email
    }
  }

  // Check if technician emails are valid
  if (Array.isArray(data.technicians)) {
    for (let i = 0; i < data.technicians.length; i++) {
      const tech = data.technicians[i]
      if (tech.email && !isValidEmail(tech.email)) {
        console.log(`Invalid technician email format for ${tech.name}: ${tech.email}`)
        tech.email = null // Clear invalid email
      }
    }
  }

  return data
}

// Add this helper function
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

// Funcție de logging sigură care nu va întrerupe execuția API-ului
async function safeAddLog(action: string, details: string, type: "Informație" | "Avertisment" | "Eroare" = "Informație", category = "Email") {
  try {
    // Salvăm în Firebase folosind addUserLogEntry
    await addUserLogEntry({
      actiune: action,
      detalii: details,
      tip: type,
      categorie: category,
    })
    console.log(`[SAFE-LOG] [${action}] [${type}] [${category}] ${details}`)
  } catch (error) {
    // Doar logăm eroarea local, fără a o propaga
    console.error("Eroare la logging:", error)
  }
}

// Funcție pentru a extrage ID-ul lucrării în mod sigur
function extractWorkOrderId(workOrderId: any): string {
  // Verificăm dacă este string
  if (typeof workOrderId === "string") {
    return workOrderId
  }

  // Verificăm dacă este un obiect cu o proprietate id sau _id
  if (workOrderId && typeof workOrderId === "object") {
    if (typeof workOrderId.id === "string") return workOrderId.id
    if (typeof workOrderId._id === "string") return workOrderId._id
    if (typeof workOrderId.docId === "string") return workOrderId.docId

    // Încercăm să convertim obiectul la JSON și să extragem informații
    try {
      const jsonStr = JSON.stringify(workOrderId)
      console.log(`[DEBUG] workOrderId as JSON: ${jsonStr}`)

      // Dacă obiectul are o proprietate care pare a fi un ID
      const obj = JSON.parse(jsonStr)
      for (const key of ["id", "_id", "docId", "documentId", "uid"]) {
        if (typeof obj[key] === "string") return obj[key]
      }
    } catch (e) {
      console.error("Error parsing workOrderId:", e)
    }
  }

  // Dacă este un număr, îl convertim la string
  if (typeof workOrderId === "number") {
    return workOrderId.toString()
  }

  // Fallback la un ID generic
  return "unknown-id"
}

// Base64 encoded logo to use when file is not available
const FALLBACK_LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAADsklEQVR4nO3dy27UQBCF4T7vwIINCIQQj8CCBYgbAgQIJO5PwCNwCUgIkEDiBQhrFizYAFIUy5E8GsfT7e7q7vN/UkuTiZNMprqrfLqSGQEAAAAAAAAAAAAAAAAAAAAAAAAAAADQpZnUDUBnTkk6J+m0pFOSjks6IumQpL2S9tj/+yDpvaR3kt5KeiPptaRXkl5K+tJpy9GKA5IuS7oi6aKkC5LOWlJMYknzXNJTSU8kPZb0Y+J7oiVnJN2UdE/SN0nrDV/fJd2VdMPagg7tl3RD0kNJP9V8UvS9fkq6L+m6pJkG7QQOSLoj6Zfan/xbX7/s3nRCYZqZpKuSXqj7xNj6emH3pjOLCR2V9EjdJ0HM66Hd+9BjZummpO/qPuHjXt/t3oeGzkv6qO6TvK3XR+sHGnBY0hN1n9RtvZ5YfzCh65K+qvtkbvv11fqDCc5J+qzuk7ir12frFyZwW90ncdfXLesXRnRU0jt1n7h9vN5Z/zCCmaSn6j5Z+3w9tX5iBDfUfZL2fb1W/mPzWdkv6aO6T9AhXh+snxjgmvJfFI99rVX+Y/RZ2afuk3LI1z3lP0afje/qPhGHfH1T/mP1WXim7pNw6Ncz5T9mn4Xryn+3eOzruvIfuw/eIeW/Wzz265DyH78P2i3ln3hjXbeU//h9sA5K+qT8E26s1yflvw0+WDeVf7KNfbGDPGBHlH+ijX0dUf7b4oN0XfknWVvXdeW/PT4o+5R/grV97VP+2+SDclH5J1fb10Xlv10+GDPlv8Xb1TXTgG33QbikYRPjv6Qnkh5IuivpD0l/Svpb0j+S/pL0u6TfJP1qP/9L0p+S/rD//0DSY0nfB7ThouiHDMZMwyZFcZb7oaTfJf0xoA1/2e8+tN8tzvIfMqAdM+U/jh+EmYZNiEeSrg1ow1VJjwe24ZryH8cPwkzDJsNY/8NnA9txVfmP4wdhpmGTYcxzrYY+5Zon3WDMNGwyMEEGZKZhk4EJMiAzDZsMTJABmWnYZGCCDMhMwyYDE2RAZho2GZggAzLTsMnABBmQmYZNBibIgMw0bDIwQQZkpmGTgQkyIDMNmwxMkAGZadhkYIIMyEzDJgMTZEBmGjYZmCADMtOwyTDWBJlp2LnWTJAOzTRsMox1LtRMw861ZoJ0aKZhk2GsE/VmGnauNROkQzMNmwxjnahfU/5j+EGYadgEKU7U+9/+98X//l/8738P+d//iv/9f8j//lf87/9D/ve/4n//H/K//xX/+/+Q//2v+N//h/zvf8X//j/kf/8r/vf/AAAAAAAAAAAAAAAAAAAAAAAAAAAAgAz9C5gVeUGpivY2AAAAAElFTkSuQmCC"

// Funcție pentru a asigura că URL-ul este complet (include protocolul)
function ensureCompleteUrl(url: string): string {
  if (!url) return ""
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`
  }
  return url
}

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  const logContext = { requestId }

  try {
    // Log pentru începerea procesării cererii
    console.log(`[WORK-ORDER-API] [${requestId}] Începerea procesării cererii de notificare`)
    logInfo("Received work order notification request", { requestId }, { category: "api", context: logContext })

    let data = await request.json()
    const requestBody = data

    // Validate and sanitize email addresses
    data = await validateEmails(data)

    // Log the data after validation (key fields for debugging)
    try {
      console.log(`[WORK-ORDER-API] [${requestId}] Debug payload fields:`)
      console.log(`- client.name:`, data?.client?.name)
      console.log(`- client.contactPerson:`, data?.client?.contactPerson)
      console.log(`- details.location:`, data?.details?.location)
      console.log(`- clientEmails (raw):`, Array.isArray(data?.clientEmails) ? data.clientEmails.join(', ') : data?.clientEmails)
    } catch {}

    // Validate required fields
    if (!data.workOrderId) {
      console.log(`[WORK-ORDER-API] [${requestId}] EROARE: Lipsește workOrderId`)
      logWarning("Missing required field: workOrderId", { data }, { category: "api", context: logContext })
      return NextResponse.json({ error: "ID-ul lucrării este obligatoriu" }, { status: 400 })
    }

    // Extract data
    const { workOrderId, workOrderNumber, client, technicians, details, clientEmails } = data

    // Log pentru datele extrase
    console.log(`[WORK-ORDER-API] [${requestId}] Date extrase:`)
    console.log(`- workOrderId (raw):`, workOrderId)
    console.log(`- workOrderId (type): ${typeof workOrderId}`)
    if (typeof workOrderId === "object") {
      console.log(`- workOrderId (JSON): ${JSON.stringify(workOrderId)}`)
    }
    console.log(`- workOrderNumber: ${workOrderNumber}`)
    console.log(`- client:`, JSON.stringify(client, null, 2))
    console.log(`- technicians:`, JSON.stringify(technicians, null, 2))
    console.log(`- details:`, JSON.stringify(details, null, 2))

    // Folosim funcția sigură de logging
    await safeAddLog(
      "Notificare API",
      `Încercare trimitere notificări pentru lucrarea ${workOrderId}`,
      "Informație",
      "Email",
    )

    // Log pentru configurația de email
    console.log(`[WORK-ORDER-API] [${requestId}] Configurație email:`)
    console.log(`- EMAIL_SMTP_HOST: ${process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro"}`)
    console.log(`- EMAIL_SMTP_PORT: ${process.env.EMAIL_SMTP_PORT || "465"}`)
    console.log(`- EMAIL_SMTP_SECURE: ${process.env.EMAIL_SMTP_SECURE === "false" ? false : true}`)
    console.log(`- EMAIL_USER: ${process.env.EMAIL_USER || "fom@nrg-acces.ro"}`)
    console.log(`- EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? "SETAT" : "NESETAT"}`)

    logInfo(
      "Email configuration",
      {
        host: process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
        port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
        secure: process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
        auth: {
          user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
          pass: process.env.EMAIL_PASSWORD ? "[REDACTED]" : "Not set",
        },
      },
      { category: "email", context: logContext },
    )

    // Configurăm transportorul de email (similar cu api/send-email/route.ts)
    console.log(`[WORK-ORDER-API] [${requestId}] Configurare transporter nodemailer...`)
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
      port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASSWORD,
      },
      debug: true, // Activăm debugging pentru nodemailer
      logger: true, // Activăm logging pentru nodemailer
    })

    // Verificăm conexiunea SMTP
    console.log(`[WORK-ORDER-API] [${requestId}] Verificare conexiune SMTP...`)
    logInfo("Verifying SMTP connection", null, { category: "email", context: logContext })
    try {
      await transporter.verify()
      console.log(`[WORK-ORDER-API] [${requestId}] Conexiune SMTP verificată cu succes!`)
      logInfo("SMTP connection verified successfully", null, { category: "email", context: logContext })
    } catch (error: any) {
      console.error(`[WORK-ORDER-API] [${requestId}] EROARE la verificarea conexiunii SMTP:`, error)
      console.error(`- Mesaj: ${error.message}`)
      console.error(`- Cod: ${error.code || "N/A"}`)
      console.error(`- Comandă: ${error.command || "N/A"}`)
      console.error(`- Stack: ${error.stack || "N/A"}`)

      logError(
        "SMTP connection verification failed",
        {
          error: error.message,
          stack: error.stack,
          code: error.code,
          command: error.command,
        },
        { category: "email", context: logContext },
      )
      return NextResponse.json({ error: `Eroare la verificarea conexiunii SMTP: ${error.message}` }, { status: 500 })
    }

    // Încărcăm logo-ul companiei
    let logoContent: Buffer | null = null
    const logoContentType = "image/png"

    try {
      // Încercăm să încărcăm logo-ul din directorul public
      const logoPath = path.join(process.cwd(), "public", "nrglogo.png")
      if (fs.existsSync(logoPath)) {
        logoContent = fs.readFileSync(logoPath)
        console.log(`[WORK-ORDER-API] [${requestId}] Logo încărcat cu succes din: ${logoPath}`)
      } else {
        // Dacă nu găsim logo-ul, folosim logo-ul de rezervă
        console.log(
          `[WORK-ORDER-API] [${requestId}] Logo-ul nu a fost găsit la: ${logoPath}, se folosește logo-ul de rezervă`,
        )
        logoContent = Buffer.from(FALLBACK_LOGO_BASE64, "base64")
      }
    } catch (error) {
      console.error(`[WORK-ORDER-API] [${requestId}] Eroare la încărcarea logo-ului:`, error)
      // Folosim logo-ul de rezervă în caz de eroare
      logoContent = Buffer.from(FALLBACK_LOGO_BASE64, "base64")
    }

    // Detect postponed event
    const isPostponed = details?.eventType === "postponed"

    // Prepare email content for technicians - include all details and rename "Descriere" to "Sfaturi pt tehnician"
    const technicianWorkOrderInfo = `
      <ul style="list-style-type: none; padding-left: 0;">
        <li><strong>Data emiterii:</strong> ${(details?.issueDate || "N/A").split(' ')[0]}</li>
        <li><strong>Data intervenție:</strong> ${(details?.interventionDate || "N/A").split(' ')[0]}</li>
        <li><strong>Tip lucrare:</strong> ${details?.workType || "N/A"}</li>
        <li><strong>Locație:</strong> ${details?.location || "N/A"}</li>
        <li><strong>Echipament:</strong> ${details?.equipment || "N/A"}</li>
        <li><strong>Model echipament:</strong> ${details?.equipmentModel || "N/A"}</li>
        <li><strong>Sfaturi pt tehnician:</strong> ${details?.description || "N/A"}</li>
        <li><strong>Defect reclamat:</strong> ${details?.reportedIssue || "N/A"}</li>
        <li><strong>Status:</strong> ${details?.status || "N/A"}</li>
      </ul>
    `

    // Prepare elegant technician info for client email fără buton de sunat
    const technicianInfoForClient = Array.isArray(technicians) && technicians.length > 0 
      ? technicians.map((tech, index) => {
          const displayPhone = tech.telefon || 'Număr indisponibil';
          return `
            <div style="margin: 10px 0; padding: 10px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
              <div style="display: flex; align-items: center; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 200px;">
                  <div style="font-weight: bold; color: #0f56b3; margin-bottom: 4px;">
                    ${index + 1}. ${tech.name}
                  </div>
                  <div style="color: #666; font-size: 14px;">
                    📞 ${displayPhone}
                  </div>
                </div>
              </div>
            </div>
          `;
        }).join('')
      : '<div style="color: #666; font-style: italic;">Nu sunt tehnicieni asignați</div>';

    // Prepare email content for client
    const revisionEquipmentsHtml = Array.isArray(details?.revisionEquipmentNames) && details.revisionEquipmentNames.length > 0
      ? `<li><strong>Echipamente revizuite:</strong><ul style="margin:6px 0 0 14px;">${details.revisionEquipmentNames.map((n: string) => `<li>${n}</li>`).join("")}</ul></li>`
      : ""
    const clientWorkOrderInfo = isPostponed
      ? `
      <div style="padding: 10px 12px; border-left: 4px solid #8b5cf6; background:#f5f3ff; border-radius:4px; margin-bottom: 12px;">
        <div style="font-weight:600; color:#53389e; margin-bottom:6px;">Stare lucrare: Amânată</div>
        ${details?.postponeReason ? `<div><strong>Motiv:</strong> ${details.postponeReason}</div>` : ''}
        
      </div>
      <ul style="list-style-type: none; padding-left: 0;">
        <li><strong>Locație:</strong> ${details?.location || "N/A"}</li>
        ${details?.interventionDate ? `<li><strong>Data intervenție:</strong> ${(details.interventionDate || '').split(' ')[0]}</li>` : ''}
        ${details?.workType ? `<li><strong>Tip lucrare:</strong> ${details.workType}</li>` : ''}
      </ul>
    `
      : `
      <ul style="list-style-type: none; padding-left: 0;">
        <li><strong>Data emiterii:</strong> ${(details?.issueDate || "N/A").split(' ')[0]}</li>
        <li><strong>Data intervenție:</strong> ${(details?.interventionDate || "N/A").split(' ')[0]}</li>
        <li><strong>Tip lucrare:</strong> ${details?.workType || "N/A"}</li>
        <li><strong>Locație:</strong> ${details?.location || "N/A"}</li>
        <li><strong>Status:</strong> ${details?.status || "N/A"}</li>
        ${revisionEquipmentsHtml || `<li><strong>Echipament:</strong> ${details?.equipment || "N/A"}</li>`}
      </ul>
    `

    // Asigurăm că URL-ul aplicației este complet
    const appBaseUrl = ensureCompleteUrl(process.env.NEXT_PUBLIC_APP_URL || "fom.nrg-acces.ro")

    // Extragem ID-ul lucrării în mod sigur
    const safeWorkOrderId = extractWorkOrderId(workOrderId)
    console.log(`[WORK-ORDER-API] [${requestId}] ID lucrare extras: ${safeWorkOrderId}`)

    // Construim URL-ul corect pentru lucrare
    const workOrderUrl = `${appBaseUrl}/dashboard/lucrari/${safeWorkOrderId}`
    console.log(`[WORK-ORDER-API] [${requestId}] URL lucrare generat: ${workOrderUrl}`)

    // Send emails to technicians
    const technicianEmails = []
    if (Array.isArray(technicians) && technicians.length > 0) {
      console.log(`[WORK-ORDER-API] [${requestId}] Trimitere email-uri către ${technicians.length} tehnicieni...`)

      for (const tech of technicians) {
        if (tech.email) {
          try {
            console.log(`[WORK-ORDER-API] [${requestId}] Trimitere email către tehnician: ${tech.name} <${tech.email}>`)

            logInfo(
              "Sending email to technician",
              {
                recipient: `${tech.name} <${tech.email}>`,
                subject: `Lucrare nouă: ${client?.name}`,
              },
              { category: "email", context: logContext },
            )

            // Construim HTML-ul pentru email (similar cu api/send-email/route.ts)
            const htmlContent = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
                </div>
                <h2 style="color: #0f56b3;">Lucrare nouă asignată</h2>
                <p>Salut ${tech.name},</p>
                <p>Ai fost asignat la o nouă lucrare:</p>
                
                <!-- Buton de acces lucrare -->
                <table cellspacing="0" cellpadding="0" border="0" style="margin: 20px 0;">
                  <tr>
                    <td align="center" bgcolor="#0f56b3" style="border-radius: 4px;">
                      <a href="${workOrderUrl}" 
                         target="_blank"
                         style="padding: 10px 15px; border: 1px solid #0f56b3; border-radius: 4px; color: #ffffff; text-decoration: none; display: inline-block; font-weight: bold; background-color: #0f56b3;">
                         Accesează lucrarea
                      </a>
                    </td>
                  </tr>
                </table>
                
                <!-- Link text simplu ca alternativă -->
                <p style="margin-bottom: 20px;">
                  Dacă butonul nu funcționează, copiază și lipește acest link în browser: 
                  <br>
                  <a href="${workOrderUrl}" target="_blank">${workOrderUrl}</a>
                </p>
                
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <h3 style="margin-top: 0;">Detalii lucrare</h3>
                  ${technicianWorkOrderInfo}
                </div>
                
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <h3 style="margin-top: 0;">Informații client</h3>
                  <p><strong>Nume:</strong> ${client?.name || "N/A"}</p>
                  <p><strong>Persoană contact:</strong> ${client?.contactPerson || "N/A"}</p>
                </div>
                
                <p>Te rugăm să verifici aplicația pentru mai multe detalii.</p>
                
                <hr style="border: 1px solid #eee; margin: 20px 0;" />
                <p style="color: #666; font-size: 12px;">Acest email a fost generat automat. Te rugăm să nu răspunzi la acest email.</p>
              </div>
            `

            // Configurăm opțiunile emailului (similar cu api/send-email/route.ts)
            const mailOptions = {
              from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
              to: tech.email,
              subject: `Lucrare nouă: ${client?.name}`,
              text: `Salut ${tech.name}, ai fost asignat la o nouă lucrare pentru clientul ${client?.name || "N/A"}. Accesează lucrarea la: ${workOrderUrl}`,
              html: htmlContent,
              attachments: [
                {
                  filename: "logo.png",
                  content: logoContent,
                  contentType: logoContentType,
                  cid: "company-logo",
                },
              ],
            }

            // Log email details before sending
            console.log(`[WORK-ORDER-API] [${requestId}] Detalii email pentru tehnician:`)
            console.log(`- From: ${mailOptions.from}`)
            console.log(`- To: ${mailOptions.to}`)
            console.log(`- Subject: ${mailOptions.subject}`)

            logDebug(
              "Email details for technician",
              {
                from: mailOptions.from,
                to: mailOptions.to,
                subject: mailOptions.subject,
                // Nu logăm conținutul HTML complet pentru a evita loguri prea mari
                htmlLength: mailOptions.html.length,
              },
              { category: "email", context: logContext },
            )

            console.log(`[WORK-ORDER-API] [${requestId}] Trimitere email către tehnician...`)
            // log queued
            let evId: string | null = null
            try {
              evId = await logEmailEvent({
                type: "TECH_NOTIFY",
                lucrareId: (requestBody as any)?.workOrderId,
                to: [String(tech.email || "")],
                subject: String(mailOptions.subject || ""),
                status: "queued",
                provider: "smtp",
              })
            } catch {}

            const info = await transporter.sendMail(mailOptions)

            console.log(`[WORK-ORDER-API] [${requestId}] Email trimis cu succes către tehnician!`)
            console.log(`- MessageId: ${info.messageId}`)
            console.log(`- Response: ${info.response}`)

            logInfo(
              "Email sent to technician successfully",
              {
                messageId: info.messageId,
                recipient: tech.email,
                response: info.response,
              },
              { category: "email", context: logContext },
            )

            technicianEmails.push({ name: tech.name, email: tech.email, success: true, messageId: info.messageId })
            try { if (evId) await updateEmailEvent(evId, { status: "sent", messageId: info.messageId }) } catch {}
          } catch (error: any) {
            console.error(
              `[WORK-ORDER-API] [${requestId}] EROARE la trimiterea email-ului către tehnician ${tech.name}:`,
              error,
            )
            console.error(`- Mesaj: ${error.message || "N/A"}`)
            console.error(`- Cod: ${error.code || "N/A"}`)
            console.error(`- Comandă: ${error.command || "N/A"}`)
            console.error(`- Stack: ${error.stack || "N/A"}`)

            logError(
              `Failed to send email to technician ${tech.name}`,
              {
                error: error.message,
                stack: error.stack,
                code: error.code,
                command: error.command,
              },
              { category: "email", context: logContext },
            )

            technicianEmails.push({ name: tech.name, email: tech.email, success: false, error: error.message })
          }
        } else {
          console.log(`[WORK-ORDER-API] [${requestId}] Tehnicianul ${tech.name} nu are adresă de email`)
          logWarning(
            `Technician ${tech.name} has no email address`,
            { technician: tech },
            { category: "email", context: logContext },
          )
        }
      }
    }

    // Send email to client/location contacts
    let clientEmailResult = null
    let uniqueRecipients: string[] = []
    // If clientEmails array is provided and not empty, use ONLY those (location contacts)
    if (Array.isArray(clientEmails) && clientEmails.length > 0) {
      uniqueRecipients = Array.from(
        new Set(
          clientEmails
            .filter((addr: any) => typeof addr === "string" && isValidEmail(addr))
            .map((addr: string) => addr.trim().toLowerCase()),
        ),
      )
      try { console.log(`[WORK-ORDER-API] [${requestId}] Using clientEmails (location contacts) only:`, uniqueRecipients.join(', ')) } catch {}
    } else if (client?.email && isValidEmail(client.email)) {
      // Fallback to client's main email if no location contact emails provided
      uniqueRecipients = [client.email.trim().toLowerCase()]
      try { console.log(`[WORK-ORDER-API] [${requestId}] Fallback to client.email:`, uniqueRecipients[0]) } catch {}
    }
    try {
      console.log(`[WORK-ORDER-API] [${requestId}] Recipients after normalization:`, uniqueRecipients.join(', ') || '(none)')
    } catch {}
    if (uniqueRecipients.length > 0) {
      try {
        console.log(`[WORK-ORDER-API] [${requestId}] Trimitere email către destinatari: ${uniqueRecipients.join(", ")}`)

        logInfo(
          "Sending email to client",
          {
            recipient: uniqueRecipients.join(", "),
            subject: isPostponed ? `Anunț amânare lucrare: ${details?.location || "Locație nedefinită"}` : `Confirmare lucrare: ${client?.name}`,
          },
          { category: "email", context: logContext },
        )

        // Construim HTML-ul pentru email client (similar cu api/send-email/route.ts)
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
            </div>
            <h2 style="color: #0f56b3;">${isPostponed ? "Lucrare amânată" : "Confirmare lucrare"}</h2>
            <p>Stimate ${client.contactPerson || client.name},</p>
            <p>${isPostponed
              ? "Vă informăm că lucrarea a fost amânată. Mai jos regăsiți detaliile relevante:"
              : "Vă confirmăm programarea unei intervenții cu următoarele detalii:"}
            </p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <h3 style="margin-top: 0;">Detalii lucrare</h3>
              ${clientWorkOrderInfo}
            </div>
            ${!isPostponed ? `
            <div style=\"background-color: #f0f8ff; padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #0f56b3;\">
              <h3 style=\"margin-top: 0; color: #0f56b3;\">Tehnicieni</h3>
              ${technicianInfoForClient}
            </div>
            ` : ''}
            
            <p>Vă mulțumim pentru înțelegere și vă stăm la dispoziție pentru orice întrebări.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest email.</p>
          </div>
        `

        // Configurăm opțiunile emailului (similar cu api/send-email/route.ts)
        const mailOptions = {
          from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
          to: uniqueRecipients,
          subject: isPostponed
            ? `Anunț amânare lucrare: ${details?.location || "Locație nedefinită"}`
            : `Confirmare intervenție: ${details?.location || "Locație nedefinită"}`,
          text: isPostponed
            ? `Stimate ${client.contactPerson || client.name}, vă informăm că lucrarea a fost amânată.${details?.postponeReason ? ` Motiv: ${details.postponeReason}.` : ''}`
            : `Stimate ${client.contactPerson || client.name}, vă confirmăm programarea unei intervenții.`,
          html: htmlContent,
          attachments: [
            {
              filename: "logo.png",
              content: logoContent,
              contentType: logoContentType,
              cid: "company-logo",
            },
          ],
        }

        // Log email details before sending
        console.log(`[WORK-ORDER-API] [${requestId}] Detalii email pentru client/destinatari:`)
        console.log(`- From: ${mailOptions.from}`)
        console.log(`- To: ${mailOptions.to}`)
        console.log(`- Subject: ${mailOptions.subject}`)

        logDebug(
          "Email details for client",
          {
            from: mailOptions.from,
            to: Array.isArray(mailOptions.to) ? mailOptions.to.join(", ") : mailOptions.to,
            subject: mailOptions.subject,
            // Nu logăm conținutul HTML complet pentru a evita loguri prea mari
            htmlLength: mailOptions.html.length,
          },
          { category: "email", context: logContext },
        )

        console.log(`[WORK-ORDER-API] [${requestId}] Trimitere email către client...`)
        const info = await transporter.sendMail(mailOptions)

        console.log(`[WORK-ORDER-API] [${requestId}] Email trimis cu succes către destinatari!`)
        console.log(`- MessageId: ${info.messageId}`)
        console.log(`- Response: ${info.response}`)

        logInfo(
          "Email sent to client successfully",
          {
            messageId: info.messageId,
            recipient: Array.isArray(mailOptions.to) ? mailOptions.to.join(", ") : mailOptions.to,
            response: info.response,
          },
          { category: "email", context: logContext },
        )

        clientEmailResult = { success: true, messageId: info.messageId, recipient: uniqueRecipients.join(", ") }
      } catch (error: any) {
        console.error(
          `[WORK-ORDER-API] [${requestId}] EROARE la trimiterea email-ului către client ${client.name}:`,
          error,
        )
        console.error(`- Mesaj: ${error.message || "N/A"}`)
        console.error(`- Cod: ${error.code || "N/A"}`)
        console.error(`- Comandă: ${error.command || "N/A"}`)
        console.error(`- Stack: ${error.stack || "N/A"}`)

        logError(
          `Failed to send email to client ${client.name}`,
          {
            error: error.message,
            stack: error.stack,
            code: error.code,
            command: error.command,
          },
          { category: "email", context: logContext },
        )

        clientEmailResult = { success: false, error: error.message }
      }
    } else {
      console.log(`[WORK-ORDER-API] [${requestId}] Clientul nu are adresă de email, se omite notificarea`)
      logWarning(
        "Client email not available, skipping client notification",
        { client },
        { category: "email", context: logContext },
      )
    }

    // Log the results
    console.log(`[WORK-ORDER-API] [${requestId}] Rezultate trimitere email-uri:`)
    console.log(`- Tehnicieni: ${technicianEmails.length} email-uri trimise`)
    console.log(`- Client: ${clientEmailResult?.success ? "Succes" : "Eșec sau omis"}`)

    // Folosim funcția sigură de logging în loc de addLog
    await safeAddLog(
      "Notificare API",
      `Rezultat trimitere notificări pentru lucrarea ${workOrderId}: ${technicianEmails.length} tehnicieni, client: ${clientEmailResult?.success ? "Succes" : "Eșec"}`,
      "Informație",
      "Email",
    )

    const response = {
      success: true,
      technicianEmails,
      clientEmail: clientEmailResult,
    }

    console.log(`[WORK-ORDER-API] [${requestId}] Răspuns API:`, JSON.stringify(response, null, 2))
    logInfo("Work order notification completed successfully", response, { category: "api", context: logContext })

    return NextResponse.json(response)
  } catch (error: any) {
    console.error(`[WORK-ORDER-API] [${requestId}] EROARE GENERALĂ în API:`, error)
    console.error(`- Mesaj: ${error.message || "N/A"}`)
    console.error(`- Cod: ${error.code || "N/A"}`)
    console.error(`- Comandă: ${error.command || "N/A"}`)
    console.error(`- Stack: ${error.stack || "N/A"}`)

    logError(
      "Error in work order notification API",
      {
        error: error.message,
        stack: error.stack,
        code: error.code,
        command: error.command,
      },
      { category: "api", context: logContext },
    )

    // Folosim funcția sigură de logging în loc de addLog
    try {
      await safeAddLog(
        "Eroare notificare API",
        `Eroare la trimiterea notificărilor: ${error.message}`,
        "Eroare",
        "Email",
      )
    } catch (logError) {
      console.error(`[WORK-ORDER-API] [${requestId}] EROARE la logarea erorii:`, logError)
    }

    return NextResponse.json(
      { error: `Eroare la configurarea sau trimiterea email-urilor: ${error.message}` },
      { status: 500 },
    )
  }
}
