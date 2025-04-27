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
    // Extract client information
    const client = {
      name: workOrderData.client?.name || "",
      email: workOrderData.client?.email || "",
      contactPerson: workOrderData.client?.contactPerson || workOrderData.client?.name || "",
    }

    // Extract technician information
    const technicians = Array.isArray(workOrderData.technicians)
      ? workOrderData.technicians.map((tech) => ({
          name: tech.name || "",
          email: tech.email || "",
        }))
      : []

    // Extract work order details
    const details = {
      issueDate: workOrderData.issueDate || new Date().toLocaleDateString("ro-RO"),
      interventionDate: workOrderData.interventionDate || "",
      workType: workOrderData.workType || "",
      location: workOrderData.location || "",
      description: workOrderData.description || "",
      reportedIssue: workOrderData.reportedIssue || "",
      status: workOrderData.status || "Programat",
    }

    // Prepare notification data
    const notificationData = {
      workOrderId: workOrderData.id || "",
      workOrderNumber: workOrderData.workOrderNumber || workOrderData.number || "",
      client,
      technicians,
      details,
    }

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
