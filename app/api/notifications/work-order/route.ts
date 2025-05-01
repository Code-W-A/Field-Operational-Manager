import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { addLog } from "@/lib/firebase/firestore"
import path from "path"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { client, technicians, details, workOrderId } = data

    if (!client || !technicians || !details) {
      return NextResponse.json({ error: "Datele pentru notificare sunt incomplete" }, { status: 400 })
    }

    // Configurăm transportorul de email
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
      port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: process.env.EMAIL_SMTP_SECURE === "true", // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASSWORD || "FOM@nrg25",
      },
    })

    // Construim HTML-ul pentru email
    const createEmailContent = (recipient, isClient = false) => {
      return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 20px;">
            <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
          </div>
          <h2 style="color: #0f56b3;">Notificare Lucrare ${workOrderId ? `#${workOrderId}` : ""}</h2>
          <p>Bună ziua ${recipient},</p>
          <p>${
            isClient
              ? "A fost înregistrată o nouă lucrare pentru dumneavoastră."
              : "Ați fost asignat(ă) la o nouă lucrare."
          }</p>
          
          <div style="background-color: #f9f9f9; border-left: 4px solid #0f56b3; padding: 15px; margin: 15px 0;">
            <p><strong>Tip lucrare:</strong> ${details.workType}</p>
            <p><strong>Data emiterii:</strong> ${details.issueDate}</p>
            <p><strong>Data intervenție:</strong> ${details.interventionDate}</p>
            <p><strong>Locație:</strong> ${details.location}</p>
            ${details.reportedIssue ? `<p><strong>Defect reclamat:</strong> ${details.reportedIssue}</p>` : ""}
            <p><strong>Descriere:</strong> ${details.description}</p>
            <p><strong>Status:</strong> ${details.status}</p>
          </div>
          
          <p>${
            isClient
              ? "Tehnicienii noștri vă vor contacta în curând pentru a programa intervenția."
              : "Vă rugăm să contactați clientul pentru a confirma detaliile intervenției."
          }</p>
          
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="color: #666; font-size: 12px;">Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest email.</p>
        </div>
      `
    }

    const results = {
      client: { sent: false, error: null },
      technicians: { sent: 0, total: technicians.length, errors: [] },
    }

    // Trimitem email către client dacă avem adresa de email
    if (client.email) {
      try {
        await transporter.sendMail({
          from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
          to: client.email,
          subject: `Notificare lucrare nouă - ${details.workType}`,
          html: createEmailContent(client.name || client.contactPerson, true),
          attachments: [
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
        })

        results.client.sent = true

        await addLog(
          "Notificare email",
          `Email trimis către clientul ${client.name || client.contactPerson} (${client.email}) pentru lucrarea ${workOrderId || "nouă"}`,
          "Informație",
          "Email",
        )
      } catch (error) {
        console.error("Eroare la trimiterea emailului către client:", error)
        results.client.error = error.message

        await addLog(
          "Eroare email",
          `Eroare la trimiterea emailului către clientul ${client.name || client.contactPerson} (${client.email}): ${error.message}`,
          "Eroare",
          "Email",
        )
      }
    }

    // Trimitem email către fiecare tehnician care are adresă de email
    for (const technician of technicians) {
      if (technician.email) {
        try {
          await transporter.sendMail({
            from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
            to: technician.email,
            subject: `Asignare lucrare nouă - ${details.workType} - ${client.name || client.contactPerson}`,
            html: createEmailContent(technician.name, false),
            attachments: [
              {
                filename: "logo.png",
                path: path.join(process.cwd(), "public", "nrglogo.png"),
                cid: "company-logo",
                fallback: {
                  content: Buffer.from(
                    "iVBORw0KGgoAAAANSUhEUgAAAMgAAABkCAYAAADDhn8LAAADsklEQVR4nO3dy27UQBCF4T7vwIINCIQQj8CCBYgbAgQIJO5PwCNwCUgIkEDiBQhrFizYAFIUy5E8GsfT7e7q7vN/UkuTiZNMprqrfLqSGQEAAAAAAAAAAAAAAAAAAAAAAAAAAADQpZnUDUBnTkk6J+m0pFOSjks6IumQpL2S9tj/+yDpvaR3kt5KeiPptaRXkl5K+tJpy9GKA5IuS7oi6aKkC5LOWlJMYknzXNJTSU8kPZb0Y+J7oiVnJN2UdE/SN0nrDV/fJd2VdMPagg7tl3RD0kNJP9V8UvS9fkq6L+m6pJkG7QQOSLoj6Zfan/xbX7/s3nRCYZqZpKuSXqj7xNj6emH3pjOLCR2V9EjdJ0HM66Hd+9BjZummpO/qPuHjXt/t3oeGzkv6qO6TvK3XR+sHGnBY0hN1n9RtvZ5YfzCh65K+qvtkbvv11fqDCc5J+qzuk7ir12frFyZwW90ncdfXLesXRnRU0jt1n7h9vN5Z/zCCmaSn6j5Z+3w9tX5iBDfUfZL2fb1W/mPzWdkv6aO6T9AhXh+snxjgmvJfFI99rVX+Y/RZ2afuk3LI1z3lP0afje/qPhGHfH1T/mP1WXim7pNw6Ncz5T9mn4Xryn+3eOzruvIfuw/eIeW/Wzz265DyH78P2i3ln3hjXbeU//h9sA5K+qT8E26s1yflvw0+WDeVf7KNfbGDPGBHlH+ijX0dUf7b4oN0XfknWVvXdeW/PT4o+5R/grV97VP+2+SDclH5J1fb10Xlv10+GDPlv8Xb1TXTgG33QbikYRPjv6Qnkh5IuivpD0l/Svpb0j+S/pL0u6TfJP1qP/9L0p+S/rD//0DSY0nfB7ThouiHDMZMwyZFcZb7oaTfJf0xoA1/2e8+tN8tzvIfMqAdM+U/jh+EmYZNiEeSrg1ow1VJjwe24ZryH8cPwkzDJsNY/8NnA9txVfmP4wdhpmGTYcxzrYY+5Zon3WDMNGwyMEEGZKZhk4EJMiAzDZsMTJABmWnYZGCCDMhMwyYDE2RAZho2GZggAzLTsMnABBmQmYZNBibIgMw0bDIwQQZkpmGTgQkyIDMNmwxMkAGZadhkYIIMyEzDJgMTZEBmGjYZmCADMtOwyTDWBJlp2LnWTJAOzTRsMox1LtRMw861ZoJ0aKZhk2GsE/VmGnauNROkQzMNmwxjnahfU/5j+EGYadgEKU7U+9/+98X//l/8738P+d//iv/9f8j//lf87/9D/ve/4n//H/K//xX/+/+Q//2v+N//h/zvf8X//j/kf/8r/vd/AAAAAAAAAAAAAAAAAAAAAAAAAAAAgAz9C5gVeUGpivY2AAAAAElFTkSuQmCC",
                    "base64",
                  ),
                  contentType: "image/png",
                },
              },
            ],
          })

          results.technicians.sent++

          await addLog(
            "Notificare email",
            `Email trimis către tehnicianul ${technician.name} (${technician.email}) pentru lucrarea ${workOrderId || "nouă"}`,
            "Informație",
            "Email",
          )
        } catch (error) {
          console.error(`Eroare la trimiterea emailului către tehnicianul ${technician.name}:`, error)
          results.technicians.errors.push({
            technician: technician.name,
            email: technician.email,
            error: error.message,
          })

          await addLog(
            "Eroare email",
            `Eroare la trimiterea emailului către tehnicianul ${technician.name} (${technician.email}): ${error.message}`,
            "Eroare",
            "Email",
          )
        }
      }
    }

    // Adăugăm un log pentru rezultatul general
    await addLog(
      "Notificări email",
      `Rezultat trimitere notificări pentru lucrarea ${workOrderId || "nouă"}: Client: ${results.client.sent ? "Trimis" : "Netrimis"}, Tehnicieni: ${results.technicians.sent}/${results.technicians.total}`,
      "Informație",
      "Email",
    )

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error("Eroare generală la trimiterea notificărilor:", error)

    await addLog(
      "Eroare notificări",
      `Eroare generală la trimiterea notificărilor: ${error.message}`,
      "Eroare",
      "Email",
    )

    return NextResponse.json({ error: "A apărut o eroare la trimiterea notificărilor" }, { status: 500 })
  }
}
