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

export async function POST(request: NextRequest) {
  try {
    const data: WorkOrderNotificationRequest = await request.json()

    if (!data.workOrderId || !data.client || !data.technicians || !data.details) {
      return NextResponse.json({ error: "Date incomplete pentru notificare" }, { status: 400 })
    }

    // Configure email transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      secure: true,
    })

    // Get the logo path
    const logoPath = path.join(process.cwd(), "public", "nrglogo.png")

    // Send emails to technicians
    const technicianResults = await Promise.allSettled(
      data.technicians.map(async (technician) => {
        if (!technician.email) return { status: "rejected", reason: "No email provided" }

        const htmlContent = generateTechnicianEmailContent(data, technician.name)

        const mailOptions = {
          from: `"Field Operational Manager" <${process.env.EMAIL_USER}>`,
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

        await transporter.sendMail(mailOptions)
        return { status: "fulfilled" }
      }),
    )

    // Send email to client
    let clientEmailResult = { status: "skipped", reason: "No client email" }
    if (data.client.email) {
      try {
        const htmlContent = generateClientEmailContent(data)

        const mailOptions = {
          from: `"Field Operational Manager" <${process.env.EMAIL_USER}>`,
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

        await transporter.sendMail(mailOptions)
        clientEmailResult = { status: "fulfilled" }
      } catch (error) {
        clientEmailResult = { status: "rejected", reason: error.message }
      }
    }

    // Log the email sending
    await addLog(
      "Notificare lucrare",
      `Au fost trimise notificări pentru lucrarea ${data.workOrderId} către ${data.technicians.length} tehnicieni și client`,
      "Informație",
      "Email",
    )

    // Return success response with details
    return NextResponse.json({
      success: true,
      technicianResults,
      clientEmailResult,
    })
  } catch (error) {
    console.error("Eroare la trimiterea notificărilor:", error)

    // Log the error
    await addLog("Eroare notificare", `Eroare la trimiterea notificărilor: ${error.message}`, "Eroare", "Email")

    return NextResponse.json({ error: "A apărut o eroare la trimiterea notificărilor" }, { status: 500 })
  }
}

// Helper function to format date from "dd.MM.yyyy HH:mm" to a more readable format
// function formatDate(dateString: string): string {
//   try {
//     const [datePart, timePart] = dateString.split(' ')
//     return datePart
//   } catch (error) {
//     return dateString
//   }
// }

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

// Generate email content for clients
function generateClientEmailContent(data: WorkOrderNotificationRequest): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 5px;">
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
      </div>
      
      <h2 style="color: #0f56b3; border-bottom: 1px solid #eaeaea; padding-bottom: 10px;">Confirmare Lucrare Programată</h2>
      
      <p>Bună ziua, <strong>${data.client.contactPerson}</strong>,</p>
      
      <p>Vă informăm că a fost programată o intervenție pentru compania dumneavoastră cu următoarele detalii:</p>
      
      <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <p><strong>Data intervenției:</strong> ${data.details.interventionDate}</p>
        <p><strong>Tip lucrare:</strong> ${data.details.workType}</p>
        <p><strong>Locație/Echipament:</strong> ${data.details.location}</p>
        ${data.details.reportedIssue ? `<p><strong>Defect reclamat:</strong> ${data.details.reportedIssue}</p>` : ""}
        <p><strong>Tehnician(i) asignat(i):</strong> ${data.technicians.map((t) => t.name).join(", ")}</p>
      </div>
      
      <p>Vă mulțumim pentru colaborare și vă asigurăm că echipa noastră va fi la dispoziția dumneavoastră la data și ora stabilite.</p>
      
      <p>Pentru orice întrebări sau modificări, vă rugăm să ne contactați.</p>
      
      <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eaeaea; font-size: 12px; color: #666;">
        <p>Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest email.</p>
      </div>
    </div>
  `
}
