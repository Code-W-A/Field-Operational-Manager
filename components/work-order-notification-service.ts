/**
 * Service for sending work order notifications
 */

/**
 * Sends notifications for a new work order
 * @param workOrderData The work order data
 * @returns Promise with notification result
 */
export async function sendWorkOrderNotifications(workOrderData: any) {
  try {
    // Extract client information from the client object or from direct properties
    const clientName = workOrderData.client?.nume || workOrderData.client || ""
    const clientEmail = workOrderData.client?.email || workOrderData.clientEmail || ""
    const contactPerson = workOrderData.client?.persoanaContact || workOrderData.persoanaContact || clientName || ""

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
            // This is a placeholder - you'll need to implement a way to get emails for technician names
            return {
              name: tech,
              email: "", // This will need to be populated from your user database
            }
          } else {
            // If it's an object, extract name and email
            return {
              name: tech.name || tech.displayName || "",
              email: tech.email || "",
            }
          }
        })
      : []

    // If we have technician names but no emails, try to fetch them
    if (technicians.some((tech) => !tech.email)) {
      console.log("Some technicians don't have email addresses. Attempting to fetch them...")
      // This would be a good place to fetch technician emails from your database
      // For now, we'll just log a warning
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

    // Prepare notification data
    const notificationData = {
      workOrderId: workOrderData.id || "",
      workOrderNumber: workOrderData.workOrderNumber || workOrderData.number || "",
      client,
      technicians,
      details,
    }

    console.log("Sending notification with data:", JSON.stringify(notificationData))

    // Send notification
    const response = await fetch("/api/notifications/work-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationData),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error("Failed to send notifications:", result.error)
      return { success: false, error: result.error }
    }

    return { success: true, result }
  } catch (error) {
    console.error("Error sending work order notifications:", error)
    return { success: false, error: error.message }
  }
}
