/**
 * Service for sending work order notifications
 */
import { addLog } from "@/lib/firebase/firestore"
import { logDebug, logInfo, logWarning, logError } from "@/lib/utils/logging-service"

/**
 * Sends notifications for a new work order
 * @param workOrderData The work order data
 * @returns Promise with notification result
 */
export async function sendWorkOrderNotifications(workOrderData: any) {
  const logContext = { workOrderId: workOrderData.id || "unknown" }

  try {
    // Log the start of the notification process with complete work order data
    logInfo(
      "Starting work order notification process",
      {
        workOrderId: workOrderData.id,
        workOrderData: JSON.stringify(workOrderData),
      },
      { category: "email", context: logContext },
    )

    // Log environment variables (without exposing sensitive information)
    logDebug(
      "Email configuration environment variables",
      {
        EMAIL_SMTP_HOST: process.env.NEXT_PUBLIC_EMAIL_SMTP_HOST || "Not set (using default)",
        EMAIL_SMTP_PORT: process.env.NEXT_PUBLIC_EMAIL_SMTP_PORT || "Not set (using default)",
        EMAIL_SMTP_SECURE: process.env.NEXT_PUBLIC_EMAIL_SMTP_SECURE || "Not set (using default)",
        EMAIL_USER: process.env.NEXT_PUBLIC_EMAIL_USER ? "Set" : "Not set",
        EMAIL_PASSWORD: process.env.EMAIL_PASSWORD ? "Set (value hidden)" : "Not set",
      },
      { category: "email", context: logContext },
    )

    // Extract client information from the client object or from direct properties
    // Verificăm mai multe posibile locații pentru email-ul clientului
    const clientName = workOrderData.client?.nume || workOrderData.client || ""

    // Verificăm mai multe posibile locații pentru email-ul clientului
    let clientEmail = ""
    if (workOrderData.client?.email) {
      clientEmail = workOrderData.client.email
    } else if (workOrderData.clientEmail) {
      clientEmail = workOrderData.clientEmail
    } else if (workOrderData.client?.persoaneContact && workOrderData.client.persoaneContact.length > 0) {
      // Încercăm să găsim un email în lista de persoane de contact
      const contactWithEmail = workOrderData.client.persoaneContact.find((p: any) => p.email)
      if (contactWithEmail) {
        clientEmail = contactWithEmail.email
      }
    }

    const contactPerson = workOrderData.client?.persoanaContact || workOrderData.persoanaContact || clientName || ""

    // Log client information
    logInfo(
      "Extracted client information",
      { clientName, clientEmail, contactPerson },
      { category: "email", context: logContext },
    )

    const client = {
      name: clientName,
      email: clientEmail,
      contactPerson: contactPerson,
    }

    // Extract technician information
    // First check if technicians is an array of objects or an array of strings
    const technicians = Array.isArray(workOrderData.tehnicieni)
      ? workOrderData.tehnicieni.map((tech: any) => {
          if (typeof tech === "string") {
            // If it's just a string (name), we need to find the email from somewhere
            logDebug(
              "Technician is a string, trying to find email",
              { techName: tech },
              { category: "email", context: logContext },
            )

            // Încercăm să găsim email-ul tehnicianului în alte date disponibile
            let techEmail = ""

            // Verificăm dacă avem o listă de utilizatori disponibilă în workOrderData
            if (workOrderData.users && Array.isArray(workOrderData.users)) {
              const userMatch = workOrderData.users.find(
                (u: any) => u.displayName === tech || u.name === tech || u.nume === tech,
              )
              if (userMatch && userMatch.email) {
                techEmail = userMatch.email
                logInfo(
                  "Found technician email in users list",
                  { techName: tech, techEmail },
                  { category: "email", context: logContext },
                )
              }
            }

            return {
              name: tech,
              email: techEmail,
            }
          } else {
            // If it's an object, extract name and email
            const techName = tech.name || tech.displayName || tech.nume || ""
            const techEmail = tech.email || ""

            logDebug(
              "Technician is an object",
              {
                techName,
                techEmail,
              },
              { category: "email", context: logContext },
            )

            return {
              name: techName,
              email: techEmail,
            }
          }
        })
      : []

    // Log technician information
    logInfo(
      "Extracted technician information",
      {
        technicianCount: technicians.length,
        technicians: technicians.map((t) => ({ name: t.name, email: t.email, hasEmail: !!t.email })),
      },
      { category: "email", context: logContext },
    )

    // If we have technician names but no emails, try to fetch them from the database
    if (technicians.some((tech) => !tech.email)) {
      logWarning(
        "Some technicians don't have email addresses",
        {
          techniciansWithoutEmail: technicians.filter((t) => !t.email).map((t) => t.name),
        },
        { category: "email", context: logContext },
      )

      try {
        await addLog(
          "Notificare lucrare",
          `Unii tehnicieni nu au adrese de email: ${technicians
            .filter((t) => !t.email)
            .map((t) => t.name)
            .join(", ")}`,
          "Avertisment",
          "Email",
        )
      } catch (logError) {
        logError("Failed to log warning about missing emails", logError, { category: "email", context: logContext })
      }
    }

    // Extract work order details
    const details = {
      issueDate: workOrderData.dataEmiterii || new Date().toLocaleDateString("ro-RO"),
      interventionDate: workOrderData.dataInterventie || "",
      workType: workOrderData.tipLucrare || "",
      location: workOrderData.locatie || "",
      description: workOrderData.descriere || "",
      reportedIssue: workOrderData.defectReclamat || "",
      status: workOrderData.statusLucrare || "Programat",
    }

    // Log work order details
    logInfo("Extracted work order details", details, { category: "email", context: logContext })

    // Prepare notification data
    const notificationData = {
      workOrderId: workOrderData.id || "",
      workOrderNumber: workOrderData.workOrderNumber || workOrderData.number || "",
      client,
      technicians,
      details,
    }

    logInfo("Sending notification with data", notificationData, { category: "api", context: logContext })

    // Add log before sending
    try {
      await addLog(
        "Notificare lucrare",
        `Încercare trimitere notificări pentru lucrarea ${notificationData.workOrderId} către ${technicians.length} tehnicieni și client`,
        "Informație",
        "Email",
      )
    } catch (logError) {
      logError("Failed to log notification attempt", logError, { category: "email", context: logContext })
    }

    // Log API request details
    logDebug(
      "API request details",
      {
        url: "/api/notifications/work-order",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(notificationData),
      },
      { category: "api", context: logContext },
    )

    // Send notification
    const response = await fetch("/api/notifications/work-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationData),
    })

    // Log response status
    logInfo(
      "Notification API response status",
      { status: response.status, statusText: response.statusText },
      { category: "api", context: logContext },
    )

    const result = await response.json()
    logInfo("Notification API response body", result, { category: "api", context: logContext })

    if (!response.ok) {
      logError(
        "Failed to send notifications",
        {
          status: response.status,
          statusText: response.statusText,
          error: result.error,
        },
        { category: "api", context: logContext },
      )

      // Add error log
      try {
        await addLog(
          "Eroare notificare",
          `Eroare la trimiterea notificărilor pentru lucrarea ${notificationData.workOrderId}: ${result.error}`,
          "Eroare",
          "Email",
        )
      } catch (logError) {
        logError("Failed to log error", logError, { category: "email", context: logContext })
      }

      return { success: false, error: result.error }
    }

    // Add success log
    try {
      await addLog(
        "Notificare lucrare",
        `Notificări trimise cu succes pentru lucrarea ${notificationData.workOrderId} către ${technicians.length} tehnicieni și client`,
        "Informație",
        "Email",
      )
    } catch (logError) {
      logError("Failed to log success", logError, { category: "email", context: logContext })
    }

    logInfo(
      "Work order notifications sent successfully",
      {
        workOrderId: notificationData.workOrderId,
        technicianCount: technicians.length,
        clientEmail: client.email ? "Sent" : "Not available",
      },
      { category: "email", context: logContext },
    )

    return { success: true, result }
  } catch (error: any) {
    logError(
      "Error sending work order notifications",
      {
        error: error.message || "Unknown error",
        stack: error.stack,
        workOrderId: workOrderData?.id || "unknown",
      },
      { category: "email", context: logContext },
    )

    // Add error log
    try {
      await addLog(
        "Eroare notificare",
        `Excepție la trimiterea notificărilor: ${error.message || "Eroare necunoscută"}`,
        "Eroare",
        "Email",
      )
    } catch (logError) {
      logError("Failed to log error", logError, { category: "email", context: logContext })
    }

    return { success: false, error: error.message }
  }
}
