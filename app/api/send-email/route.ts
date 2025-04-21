import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { addLog } from "@/lib/firebase/firestore"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const to = formData.get("to") as string
    const subject = formData.get("subject") as string
    const message = formData.get("message") as string
    const senderName = formData.get("senderName") as string
    const pdfFile = formData.get("pdfFile") as File
    const companyLogo = formData.get("companyLogo") as string

    if (!to || !subject || !pdfFile) {
      return NextResponse.json(
        { error: "Adresa de email, subiectul și fișierul PDF sunt obligatorii" },
        { status: 400 },
      )
    }

    // Configurăm transportorul de email (Gmail)
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
      secure: true,
    })

    // Convertim fișierul PDF în buffer pentru atașament
    const arrayBuffer = await pdfFile.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Construim HTML-ul pentru email, incluzând logo-ul dacă există
    let htmlContent = `
     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
   `

    // Adăugăm logo-ul companiei dacă există
    if (companyLogo) {
      htmlContent += `
       <div style="text-align: center; margin-bottom: 20px;">
         <img src="${companyLogo}" alt="Logo companie" style="max-width: 200px; max-height: 80px;" />
       </div>
     `
    }

    // Continuăm cu restul conținutului
    htmlContent += `
       <h2 style="color: #0f56b3;">Raport de Intervenție</h2>
       <p>${message || "Vă transmitem atașat raportul de intervenție."}</p>
       <p>Raportul este atașat în format PDF.</p>
       <hr style="border: 1px solid #eee; margin: 20px 0;" />
       <p style="color: #666; font-size: 12px;">Acest email a fost generat automat. Vă rugăm să nu răspundeți la acest email.</p>
     </div>
   `

    // Configurăm opțiunile emailului
    const mailOptions = {
      from: `"${senderName || "Sistem Management Lucrări"}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text: message || "Vă transmitem atașat raportul de intervenție.",
      html: htmlContent,
      attachments: [
        {
          filename: pdfFile.name || "raport_interventie.pdf",
          content: buffer,
          contentType: "application/pdf",
        },
      ],
    }

    // Trimitem emailul
    await transporter.sendMail(mailOptions)

    // Adăugăm un log pentru trimiterea emailului
    await addLog(
      "Trimitere email",
      `A fost trimis un email cu raportul de intervenție către ${to}`,
      "Informație",
      "Email",
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Eroare la trimiterea emailului:", error)

    return NextResponse.json({ error: "A apărut o eroare la trimiterea emailului" }, { status: 500 })
  }
}
