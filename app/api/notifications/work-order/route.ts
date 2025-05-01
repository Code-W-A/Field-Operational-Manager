import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { addLog } from "@/lib/firebase/firestore"
import { logDebug, logInfo, logWarning, logError } from "@/lib/utils/logging-service"
import path from "path"

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
  const logContext = { requestId }

  try {
    logInfo("Received work order notification request", { requestId }, { category: "api", context: logContext })

    const data = await request.json()

    // Log the complete request data
    logDebug("Work order notification request data", data, { category: "api", context: logContext })

    // Validate required fields
    if (!data.workOrderId) {
      logWarning("Missing required field: workOrderId", { data }, { category: "api", context: logContext })
      return NextResponse.json({ error: "ID-ul lucrării este obligatoriu" }, { status: 400 })
    }

    // Extract data
    const { workOrderId, workOrderNumber, client, technicians, details } = data

    // Log the notification attempt
    await addLog(
      "Notificare API",
      `Încercare trimitere notificări pentru lucrarea ${workOrderId}`,
      "Informație",
      "Email",
    )

    // Log email configuration
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
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
      port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASSWORD,
      },
    })

    // Verificăm conexiunea SMTP
    logInfo("Verifying SMTP connection", null, { category: "email", context: logContext })
    try {
      await transporter.verify()
      logInfo("SMTP connection verified successfully", null, { category: "email", context: logContext })
    } catch (error: any) {
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

    // Prepare email content
    const workOrderInfo = `
      <ul style="list-style-type: none; padding-left: 0;">
        <li><strong>Data emiterii:</strong> ${details.issueDate || "N/A"}</li>
        <li><strong>Data intervenție:</strong> ${details.interventionDate || "N/A"}</li>
        <li><strong>Tip lucrare:</strong> ${details.workType || "N/A"}</li>
        <li><strong>Locație:</strong> ${details.location || "N/A"}</li>
        <li><strong>Descriere:</strong> ${details.description || "N/A"}</li>
        <li><strong>Defect reclamat:</strong> ${details.reportedIssue || "N/A"}</li>
        <li><strong>Status:</strong> ${details.status || "N/A"}</li>
      </ul>
    `

    // Get the logo path
    const logoPath = path.join(process.cwd(), "public", "nrglogo.png")

    // Send emails to technicians
    const technicianEmails = []
    if (Array.isArray(technicians) && technicians.length > 0) {
      for (const tech of technicians) {
        if (tech.email) {
          try {
            logInfo(
              "Sending email to technician",
              {
                recipient: `${tech.name} <${tech.email}>`,
                subject: `Lucrare nouă: ${workOrderNumber || workOrderId}`,
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
                
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
                  <h3 style="margin-top: 0;">Detalii lucrare</h3>
                  ${workOrderInfo}
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
              subject: `Lucrare nouă: ${workOrderNumber || workOrderId}`,
              text: `Salut ${tech.name}, ai fost asignat la o nouă lucrare pentru clientul ${client?.name || "N/A"}.`,
              html: htmlContent,
              attachments: [
                {
                  filename: "logo.png",
                  path: logoPath,
                  cid: "company-logo",
                  // Add a fallback in case the file doesn't exist
                  fallback: {
                    content: Buffer.from(
                      "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAADsklEQVR4nO3dy27UQBCF4T7vwIINCIQQj8CCBYgbAgQIJO5PwCNwCUgIkEDiBQhrFizYAFIUy5E8GsfT7e7q7vN/UkuTiZNMprqrfLqSGQEAAAAAAAAAAAAAAAAAAAAAAAAAAADQpZnUDUBnTkk6J+m0pFOSjks6IumQpL2S9tj/+yDpvaR3kt5KeiPptaRXkl5K+tJpy9GKA5IuS7oi6aKkC5LOWlJMYknzXNJTSU8kPZb0Y+J7oiVnJN2UdE/SN0nrDV/fJd2VdMPagg7tl3RD0kNJP9V8UvS9fkq6L+m6pJkG7QQOSLoj6Zfan/xbX7/s3nRCYZqZpKuSXqj7xNj6emH3pjOLCR2V9EjdJ0HM66Hd+9BjZummpO/qPuHjXt/t3oeGzkv6qO6TvK3XR+sHGnBY0hN1n9RtvZ5YfzCh65K+qvtkbvv11fqDCc5J+qzuk7ir12frFyZwW90ncdfXLesXRnRU0jt1n7h9vN5Z/zCCmaSn6j5Z+3w9tX5iBDfUfZL2fb1W/mPzWdkv6aO6T9AhXh+snxjgmvJfFI99rVX+Y/RZ2afuk3LI1z3lP0afje/qPhGHfH1T/mP1WXim7pNw6Ncz5T9mn4Xryn+3eOzruvIfuw/eIeW/Wzz265DyH78P2i3ln3hjXbeU//h9sA5K+qT8E26s1yflvw0+WDeVf7KNfbGDPGBHlH+ijX0dUf7b4oN0XfknWVvXdeW/PT4o+5R/grV97VP+2+SDclH5J1fb10Xlv10+GDPlv8Xb1TXTgG33QbikYRPjv6Qnkh5IuivpD0l/Svpb0j+S/pL0u6TfJP1qP/9L0p+S/rD//0DSY0nfB7ThouiHDMZMwyZFcZb7oaTfJf0xoA1/2e8+tN8tzvIfMqAdM+U/jh+EmYZNiEeSrg1ow1VJjwe24ZryH8cPwkzDJsNY/8NnA9txVfmP4wdhpmGTYcxzrYY+5Zon3WDMNGwyMEEGZKZhk4EJMiAzDZsMTJABmWnYZGCCDMhMwyYDE2RAZho2GZggAzLTsMnABBmQmYZNBibIgMw0bDIwQQZkpmGTgQkyIDMNmwxMkAGZadhkYIIMyEzDJgMTZEBmGjYZmCADMtOwyTDWBJlp2LnWTJAOzTRsMox1LtRMw861ZoJ0aKZhk2GsE/VmGnauNROkQzMNmwxjnahfU/5j+EGYadgEKU7U+9/+98X//l/8738P+d//iv/9f8j//lf87/9D/ve/4n//H/K//xX/+/+Q//2v+N//h/zvf8X//j/kf/8r/vf/AAAAAAAAAAAAAAAAAAAAAAAAAAAAgAz9C5gVeUGpivY2AAAAAElFTkSuQmCC",
                      "base64",
                    ),
                    contentType: "image/png",
                  },
                },
              ],
            }

            // Log email details before sending
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

            const info = await transporter.sendMail(mailOptions)

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
          } catch (error: any) {
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
          logWarning(
            `Technician ${tech.name} has no email address`,
            { technician: tech },
            { category: "email", context: logContext },
          )
        }
      }
    }

    // Send email to client if email is available
    let clientEmailResult = null
    if (client?.email) {
      try {
        logInfo(
          "Sending email to client",
          {
            recipient: `${client.name} <${client.email}>`,
            subject: `Confirmare lucrare: ${workOrderNumber || workOrderId}`,
          },
          { category: "email", context: logContext },
        )

        // Construim HTML-ul pentru email client (similar cu api/send-email/route.ts)
        const htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 20px;">
              <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
            </div>
            <h2 style="color: #0f56b3;">Confirmare lucrare</h2>
            <p>Stimate ${client.contactPerson || client.name},</p>
            <p>Vă confirmăm programarea unei intervenții cu următoarele detalii:</p>
            
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <h3 style="margin-top: 0;">Detalii lucrare</h3>
              ${workOrderInfo}
            </div>
            
            <p>Vă mulțumim pentru înțelegere.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="color: #666; font-size: 12px;">Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest email.</p>
          </div>
        `

        // Configurăm opțiunile emailului (similar cu api/send-email/route.ts)
        const mailOptions = {
          from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
          to: client.email,
          subject: `Confirmare lucrare: ${workOrderNumber || workOrderId}`,
          text: `Stimate ${client.contactPerson || client.name}, vă confirmăm programarea unei intervenții.`,
          html: htmlContent,
          attachments: [
            {
              filename: "logo.png",
              path: logoPath,
              cid: "company-logo",
              // Add a fallback in case the file doesn't exist
              fallback: {
                content: Buffer.from(
                  "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAADsklEQVR4nO3dy27UQBCF4T7vwIINCIQQj8CCBYgbAgQIJO5PwCNwCUgIkEDiBQhrFizYAFIUy5E8GsfT7e7q7vN/UkuTiZNMprqrfLqSGQEAAAAAAAAAAAAAAAAAAAAAAAAAAADQpZnUDUBnTkk6J+m0pFOSjks6IumQpL2S9tj/+yDpvaR3kt5KeiPptaRXkl5K+tJpy9GKA5IuS7oi6aKkC5LOWlJMYknzXNJTSU8kPZb0Y+J7oiVnJN2UdE/SN0nrDV/fJd2VdMPagg7tl3RD0kNJP9V8UvS9fkq6L+m6pJkG7QQOSLoj6Zfan/xbX7/s3nRCYZqZpKuSXqj7xNj6emH3pjOLCR2V9EjdJ0HM66Hd+9BjZummpO/qPuHjXt/t3oeGzkv6qO6TvK3XR+sHGnBY0hN1n9RtvZ5YfzCh65K+qvtkbvv11fqDCc5J+qzuk7ir12frFyZwW90ncdfXLesXRnRU0jt1n7h9vN5Z/zCCmaSn6j5Z+3w9tX5iBDfUfZL2fb1W/mPzWdkv6aO6T9AhXh+snxjgmvJfFI99rVX+Y/RZ2afuk3LI1z3lP0afje/qPhGHfH1T/mP1WXim7pNw6Ncz5T9mn4Xryn+3eOzruvIfuw/eIeW/Wzz265DyH78P2i3ln3hjXbeU//h9sA5K+qT8E26s1yflvw0+WDeVf7KNfbGDPGBHlH+ijX0dUf7b4oN0XfknWVvXdeW/PT4o+5R/grV97VP+2+SDclH5J1fb10Xlv10+GDPlv8Xb1TXTgG33QbikYRPjv6Qnkh5IuivpD0l/Svpb0j+S/pL0u6TfJP1qP/9L0p+S/rD//0DSY0nfB7ThouiHDMZMwyZFcZb7oaTfJf0xoA1/2e8+tN8tzvIfMqAdM+U/jh+EmYZNiEeSrg1ow1VJjwe24ZryH8cPwkzDJsNY/8NnA9txVfmP4wdhpmGTYcxzrYY+5Zon3WDMNGwyMEEGZKZhk4EJMiAzDZsMTJABmWnYZGCCDMhMwyYDE2RAZho2GZggAzLTsMnABBmQmYZNBibIgMw0bDIwQQZkpmGTgQkyIDMNmwxMkAGZadhkYIIMyEzDJgMTZEBmGjYZmCADMtOwyTDWBJlp2LnWTJAOzTRsMox1LtRMw861ZoJ0aKZhk2GsE/VmGnauNROkQzMNmwxjnahfU/5j+EGYadgEKU7U+9/+98X//l/8738P+d//iv/9f8j//lf87/9D/ve/4n//H/K//xX/+/+Q//2v+N//h/zvf8X//j/kf/8r/vf/AAAAAAAAAAAAAAAAAAAAAAAAAAAAgAz9C5gVeUGpivY2AAAAAElFTkSuQmCC",
                  "base64",
                ),
                contentType: "image/png",
              },
            },
          ],
        }

        // Log email details before sending
        logDebug(
          "Email details for client",
          {
            from: mailOptions.from,
            to: mailOptions.to,
            subject: mailOptions.subject,
            // Nu logăm conținutul HTML complet pentru a evita loguri prea mari
            htmlLength: mailOptions.html.length,
          },
          { category: "email", context: logContext },
        )

        const info = await transporter.sendMail(mailOptions)

        logInfo(
          "Email sent to client successfully",
          {
            messageId: info.messageId,
            recipient: client.email,
            response: info.response,
          },
          { category: "email", context: logContext },
        )

        clientEmailResult = { success: true, messageId: info.messageId }
      } catch (error: any) {
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
      logWarning(
        "Client email not available, skipping client notification",
        { client },
        { category: "email", context: logContext },
      )
    }

    // Log the results
    await addLog(
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

    logInfo("Work order notification completed successfully", response, { category: "api", context: logContext })

    return NextResponse.json(response)
  } catch (error: any) {
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

    // Log the error
    try {
      await addLog("Eroare notificare API", `Eroare la trimiterea notificărilor: ${error.message}`, "Eroare", "Email")
    } catch (logError) {
      logError("Failed to log error", logError, { category: "email", context: logContext })
    }

    return NextResponse.json(
      { error: `Eroare la configurarea sau trimiterea email-urilor: ${error.message}` },
      { status: 500 },
    )
  }
}
