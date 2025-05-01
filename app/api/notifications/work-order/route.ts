import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"
import { addLog } from "@/lib/firebase/firestore"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    console.log("[Server] Received notification request:", JSON.stringify(data))

    // Validate required fields
    if (!data.workOrderId) {
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

    // Configure email transporter with detailed logging
    console.log("[Server] Configuring email transporter...")

    // Create a test transporter first to verify credentials
    const testTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
      port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASSWORD,
      },
      debug: true, // Enable debug output
      logger: true, // Log information about the transport mechanism
    })

    // Verify connection configuration
    console.log("[Server] Verifying SMTP connection...")
    try {
      await testTransporter.verify()
      console.log("[Server] SMTP connection verified successfully")
    } catch (error: any) {
      console.error("[Server] SMTP connection verification failed:", error)
      return NextResponse.json({ error: `Eroare la verificarea conexiunii SMTP: ${error.message}` }, { status: 500 })
    }

    // Create the actual transporter for sending emails
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_SMTP_HOST || "mail.nrg-acces.ro",
      port: Number.parseInt(process.env.EMAIL_SMTP_PORT || "465"),
      secure: process.env.EMAIL_SMTP_SECURE === "false" ? false : true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASSWORD,
      },
    })

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

    // Send emails to technicians
    const technicianEmails = []
    if (Array.isArray(technicians) && technicians.length > 0) {
      for (const tech of technicians) {
        if (tech.email) {
          try {
            console.log(`[Server] Sending email to technician: ${tech.name} <${tech.email}>`)

            const mailOptions = {
              from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
              to: tech.email,
              subject: `Lucrare nouă: ${workOrderNumber || workOrderId}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
              `,
            }

            const info = await transporter.sendMail(mailOptions)
            console.log(`[Server] Email sent to technician: ${info.messageId}`)
            technicianEmails.push({ name: tech.name, email: tech.email, success: true })
          } catch (error: any) {
            console.error(`[Server] Failed to send email to technician ${tech.name}:`, error)
            technicianEmails.push({ name: tech.name, email: tech.email, success: false, error: error.message })
          }
        }
      }
    }

    // Send email to client if email is available
    let clientEmailResult = null
    if (client?.email) {
      try {
        console.log(`[Server] Sending email to client: ${client.name} <${client.email}>`)

        const mailOptions = {
          from: `"Field Operational Manager" <${process.env.EMAIL_USER || "fom@nrg-acces.ro"}>`,
          to: client.email,
          subject: `Confirmare lucrare: ${workOrderNumber || workOrderId}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
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
          `,
        }

        const info = await transporter.sendMail(mailOptions)
        console.log(`[Server] Email sent to client: ${info.messageId}`)
        clientEmailResult = { success: true }
      } catch (error: any) {
        console.error(`[Server] Failed to send email to client ${client.name}:`, error)
        clientEmailResult = { success: false, error: error.message }
      }
    }

    // Log the results
    await addLog(
      "Notificare API",
      `Rezultat trimitere notificări pentru lucrarea ${workOrderId}: ${technicianEmails.length} tehnicieni, client: ${clientEmailResult?.success ? "Succes" : "Eșec"}`,
      "Informație",
      "Email",
    )

    return NextResponse.json({
      success: true,
      technicianEmails,
      clientEmail: clientEmailResult,
    })
  } catch (error: any) {
    console.error("[Server] Error in work order notification API:", error)

    // Log the error
    try {
      await addLog("Eroare notificare API", `Eroare la trimiterea notificărilor: ${error.message}`, "Eroare", "Email")
    } catch (logError) {
      console.error("[Server] Failed to log error:", logError)
    }

    return NextResponse.json(
      { error: `Eroare la configurarea sau trimiterea email-urilor: ${error.message}` },
      { status: 500 },
    )
  }
}
