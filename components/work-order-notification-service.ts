/**
 * Service for sending work order notifications
 */
import { addLog } from "@/lib/firebase/firestore"

/**
 * Sends notifications for a new work order
 * @param workOrderData The work order data
 * @returns Promise with notification result
 */
export async function sendWorkOrderNotifications(workOrderData: any) {
  try {
    // Log the start of the notification process
    console.log("[Client] Starting work order notification process", { workOrderId: workOrderData.id })

    // Extract client information from the client object or from direct properties
    const clientName = workOrderData.client?.nume || workOrderData.client || ""
    const clientEmail = workOrderData.client?.email || workOrderData.clientEmail || ""
    const contactPerson = workOrderData.client?.persoanaContact || workOrderData.persoanaContact || clientName || ""

    // Log client information
    console.log("[Client] Extracted client information", { clientName, clientEmail, contactPerson })

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
            console.log("[Client] Technician is a string, no email available", { techName: tech })
            return {
              name: tech,
              email: "", // This will need to be populated from your user database
            }
          } else {
            // If it's an object, extract name and email
            console.log("[Client] Technician is an object", {
              techName: tech.name || tech.displayName || "",
              techEmail: tech.email || "",
            })
            return {
              name: tech.name || tech.displayName || "",
              email: tech.email || "",
            }
          }
        })
      : []

    // Log technician information
    console.log("[Client] Extracted technician information", {
      technicianCount: technicians.length,
      technicians: technicians.map((t) => ({ name: t.name, hasEmail: !!t.email })),
    })

    // If we have technician names but no emails, try to fetch them
    if (technicians.some((tech) => !tech.email)) {
      console.log("[Client] Some technicians don't have email addresses. Attempting to fetch them...")
      // This would be a good place to fetch technician emails from your database
      // For now, we'll just log a warning
      await addLog(
        "Notificare lucrare",
        `Unii tehnicieni nu au adrese de email: ${technicians
          .filter((t) => !t.email)
          .map((t) => t.name)
          .join(", ")}`,
        "Avertisment",
        "Email",
      )
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
    console.log("[Client] Extracted work order details", details)

    // Prepare notification data
    const notificationData = {
      workOrderId: workOrderData.id || "",
      workOrderNumber: workOrderData.workOrderNumber || workOrderData.number || "",
      client,
      technicians,
      details,
    }

    console.log("[Client] Sending notification with data:", JSON.stringify(notificationData))

    // Add log before sending
    await addLog(
      "Notificare lucrare",
      `Încercare trimitere notificări pentru lucrarea ${notificationData.workOrderId} către ${technicians.length} tehnicieni și client`,
      "Informație",
      "Email",
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
    console.log("[Client] Notification API response status:", response.status)

    const result = await response.json()
    console.log("[Client] Notification API response:", result)

    if (!response.ok) {
      console.error("[Client] Failed to send notifications:", result.error)

      // Add error log
      await addLog(
        "Eroare notificare",
        `Eroare la trimiterea notificărilor pentru lucrarea ${notificationData.workOrderId}: ${result.error}`,
        "Eroare",
        "Email",
      )

      return { success: false, error: result.error }
    }

    // Add success log
    await addLog(
      "Notificare lucrare",
      `Notificări trimise cu succes pentru lucrarea ${notificationData.workOrderId} către ${technicians.length} tehnicieni și client`,
      "Informație",
      "Email",
    )

    return { success: true, result }
  } catch (error: any) {
    console.error("[Client] Error sending work order notifications:", error)

    // Add error log
    try {
      await addLog(
        "Eroare notificare",
        `Excepție la trimiterea notificărilor: ${error.message || "Eroare necunoscută"}`,
        "Eroare",
        "Email",
      )
    } catch (logError) {
      console.error("[Client] Failed to log error:", logError)
    }

    return { success: false, error: error.message }
  }
}
