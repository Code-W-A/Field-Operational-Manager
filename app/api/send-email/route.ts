import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import path from "path"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const to = formData.get("to") as string
    const subject = formData.get("subject") as string
    const message = formData.get("message") as string
    const senderName = formData.get("senderName") as string
    const pdfFile = formData.get("pdfFile") as File

    if (!to || !subject || !pdfFile) {
      return NextResponse.json(
        { error: "Adresa de email, subiectul si fisierul PDF sunt obligatorii" },
        { status: 400 },
      )
    }

    // Configurăm transportorul de email (Client Email Server)
    const transporter = nodemailer.createTransport({
      host: "mail.nrg-acces.ro",
      port: 465,
      secure: true, // true for 465, false for other ports
      auth: {
        user: "fom@nrg-acces.ro",
        pass: "FOM@nrg25",
      },
    })

    // Convertim fișierul PDF în buffer pentru atașament
    const arrayBuffer = await pdfFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Get the logo path
    const logoPath = path.join(process.cwd(), "public", "nrglogo.png")

    // Construim HTML-ul pentru email
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="cid:company-logo" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
        </div>
        <h2 style="color: #0f56b3;">Raport de Interventie</h2>
        <p>${message || "Va transmitem atasat raportul de interventie."}</p>
        <p>Raportul este atasat in format PDF.</p>
        <hr style="border: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #666; font-size: 12px;">Acest email a fost generat automat. Va rugam sa nu raspundeti la acest email.</p>
      </div>
    `

    // Configurăm opțiunile emailului
    const mailOptions = {
      from: `"${senderName || "Field Operational Manager"}" <fom@nrg-acces.ro>`,
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

    // Trimitem emailul
    await transporter.sendMail(mailOptions)

    // TODO: Add logging when admin permissions are properly configured
    console.log(`Email sent successfully to: ${to}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Eroare la trimiterea emailului:", error)

    return NextResponse.json({ error: "A aparut o eroare la trimiterea emailului" }, { status: 500 })
  }
}
