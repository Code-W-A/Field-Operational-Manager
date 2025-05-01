import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { addLog } from "@/lib/firebase/firestore"
import path from "path"
import { formatDate as formatDateUtil } from "@/lib/utils/date-formatter"

// Define the request body type
interface WorkOrderNotificationRequest {
  workOrderId: string
  workOrderNumber?: string
  client: {
    name: string
    email: string
    contactPerson: string
  }
  technicians: Array<{
    name: string
    email: string
  }>
  details: {
    issueDate: string
    interventionDate: string
    workType: string
    location: string
    description: string
    reportedIssue?: string
    status: string
  }
}

// Modificăm funcția POST pentru a gestiona mai bine erorile de logare

// Înlocuiți blocul try-catch principal cu această versiune:

export async function POST(request: NextRequest) {
  try {
    console.log("[Server] Notification API called")

    const data: WorkOrderNotificationRequest = await request.json()
    console.log("[Server] Received notification data:", {
      workOrderId: data.workOrderId,
      clientName: data.client?.name,
      clientHasEmail: !!data.client?.email,
      technicianCount: data.technicians?.length,
      technicians: data.technicians?.map((t) => ({ name: t.name, hasEmail: !!t.email })),
    })

    if (!data.workOrderId || !data.client || !data.technicians || !data.details) {
      console.error("[Server] Incomplete notification data")
      try {
        await addLog(
          "Eroare notificare",
          "Date incomplete pentru notificare: lipsește workOrderId, client, technicians sau details",
          "Eroare",
          "Email",
        )
      } catch (logError) {
        console.error("[Server] Failed to log error:", logError)
      }
      return NextResponse.json({ error: "Date incomplete pentru notificare" }, { status: 400 })
    }

    // Configure email transporter
    console.log("[Server] Configuring email transporter")
    try {
      const transporter = nodemailer.createTransport({
        host: "mail.nrg-acces.ro",
        port: 465,
        secure: true, // true for 465, false for other ports
        auth: {
          user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
          pass: process.env.EMAIL_PASSWORD || "FOM@nrg25",
        },
        debug: true, // Enable debug output
        logger: true, // Log information about the transport
      })

      // Verify connection configuration
      console.log("[Server] Verifying email transporter connection")
      await transporter.verify()
      console.log("[Server] Email transporter connection verified successfully")

      // Get the logo path
      const logoPath = path.join(process.cwd(), "public", "nrglogo.png")
      console.log("[Server] Logo path:", logoPath)

      // Send emails to technicians
      console.log("[Server] Sending emails to technicians")
      const technicianResults = await Promise.allSettled(
        data.technicians.map(async (technician) => {
          if (!technician.email) {
            console.log(`[Server] Skipping technician ${technician.name} - no email provided`)
            return { status: "rejected", reason: "No email provided" }
          }

          console.log(`[Server] Preparing email for technician ${technician.name} <${technician.email}>`)
          const htmlContent = generateTechnicianEmailContent(data, technician.name)

          const mailOptions = {
            from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
            to: technician.email,
            subject: `Lucrare nouă asignată: ${data.client.name} - ${formatDateUtil(data.details.interventionDate)}`,
            html: htmlContent,
            attachments: [
              {
                filename: "logo.png",
                path: logoPath,
                cid: "company-logo",
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

          try {
            console.log(`[Server] Sending email to technician ${technician.name} <${technician.email}>`)
            const info = await transporter.sendMail(mailOptions)
            console.log(`[Server] Email sent to technician ${technician.name}, messageId: ${info.messageId}`)
            return { status: "fulfilled", messageId: info.messageId }
          } catch (error: any) {
            console.error(`[Server] Failed to send email to technician ${technician.name}:`, error)
            return { status: "rejected", reason: error.message }
          }
        }),
      )

      console.log("[Server] Technician email results:", technicianResults)

      // Send email to client
      let clientEmailResult = { status: "skipped", reason: "No client email" }
      if (data.client.email) {
        try {
          console.log(`[Server] Preparing email for client ${data.client.name} <${data.client.email}>`)
          const htmlContent = generateClientEmailContent(data)

          const mailOptions = {
            from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
            to: data.client.email,
            subject: `Confirmare lucrare programată: ${formatDateUtil(data.details.interventionDate)}`,
            html: htmlContent,
            attachments: [
              {
                filename: "logo.png",
                path: logoPath,
                cid: "company-logo",
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

          console.log(`[Server] Sending email to client ${data.client.name} <${data.client.email}>`)
          const info = await transporter.sendMail(mailOptions)
          console.log(`[Server] Email sent to client, messageId: ${info.messageId}`)
          clientEmailResult = { status: "fulfilled", messageId: info.messageId }
        } catch (error: any) {
          console.error("[Server] Failed to send email to client:", error)
          clientEmailResult = { status: "rejected", reason: error.message }
        }
      } else {
        console.log("[Server] No client email provided, skipping client notification")
      }

      // Log the email sending
      try {
        await addLog(
          "Notificare lucrare",
          `Au fost trimise notificări pentru lucrarea ${data.workOrderId} către ${data.technicians.length} tehnicieni și client`,
          "Informație",
          "Email",
        )
      } catch (logError) {
        console.error("[Server] Failed to log success:", logError)
      }

      // Return success response with details
      console.log("[Server] Notification process completed successfully")
      return NextResponse.json({
        success: true,
        technicianResults,
        clientEmailResult,
      })
    } catch (emailError: any) {
      console.error("[Server] Email configuration or sending error:", emailError)
      try {
        await addLog(
          "Eroare notificare",
          `Eroare la configurarea sau trimiterea email-urilor: ${emailError.message}`,
          "Eroare",
          "Email",
        )
      } catch (logError) {
        console.error("[Server] Failed to log email error:", logError)
      }
      return NextResponse.json(
        {
          error: `Eroare la configurarea sau trimiterea email-urilor: ${emailError.message}`,
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("[Server] Unhandled error in notification API:", error)

    // Log the error
    try {
      await addLog(
        "Eroare notificare",
        `Eroare la trimiterea notificărilor: ${error.message || "Eroare necunoscută"}`,
        "Eroare",
        "Email",
      )
    } catch (logError) {
      console.error("[Server] Failed to log error:", logError)
    }

    return NextResponse.json(
      {
        error: `A apărut o eroare la trimiterea notificărilor: ${error.message || "Eroare necunoscută"}`,
      },
      { status: 500 },
    )
  }
}

// Generate email content for technicians
function generateTechnicianEmailContent(data: WorkOrderNotificationRequest, technicianName: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
      </div>
      
      <h2 style="color: #0f56b3; border-bottom: 1px solid #eaeaea; padding-bottom: 10px;">Lucrare Nouă Asignată</h2>
      
      <p>Bună ziua, <strong>${technicianName}</strong>,</p>
      
      <p>Ați fost asignat(ă) la o nouă lucrare cu următoarele detalii:</p>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Client:</strong> ${data.client.name}</p>
        <p><strong>Persoană de contact:</strong> ${data.client.contactPerson}</p>
        <p><strong>Data intervenției:</strong> ${data.details.interventionDate}</p>
        <p><strong>Tip lucrare:</strong> ${data.details.workType}</p>
        <p><strong>Locație/Echipament:</strong> ${data.details.location}</p>
        ${data.details.reportedIssue ? `<p><strong>Defect reclamat:</strong> ${data.details.reportedIssue}</p>` : ""}
        <p><strong>Descriere:</strong> ${data.details.description}</p>
        <p><strong>Status:</strong> ${data.details.status}</p>
      </div>
      
      <p>Vă rugăm să vă pregătiți pentru această intervenție și să contactați clientul dacă este necesar.</p>
      
      <p>Pentru mai multe detalii, vă rugăm să accesați aplicația Field Operational Manager.</p>
      
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eaeaea; font-size: 12px; color: #666;">
        <p>Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest email.</p>
      </div>
    </div>
  `
}

// Update the generateClientEmailContent function to match the requested format:

function generateClientEmailContent(data: WorkOrderNotificationRequest): string {
  // Get the first technician as the main representative
  const mainTechnician = data.technicians && data.technicians.length > 0 ? data.technicians[0].name : "un reprezentant"

  // Format the intervention date
  const formattedDate = data.details.interventionDate || ""

  // Get the work order number or ID
  const workOrderCode = data.workOrderNumber || data.workOrderId || ""

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
      </div>
      
      <div style="margin: 15px 0; line-height: 1.5;">
        <p>Bună ziua,</p>
        
        <p>Sesizarea dumneavoastră a fost înregistrată cu COD-ul <strong>${workOrderCode}</strong> și preluată de reprezentantul zonal <strong>${mainTechnician}</strong>.</p>
        
        <p>Acesta va interveni până cel mai târziu ${formattedDate}.</p>
        
        <p>Cu stimă!</p>
      </div>
      
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eaeaea; font-size: 12px; color: #666;">
        <p>Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest email.</p>
      </div>
    </div>
  `
}
