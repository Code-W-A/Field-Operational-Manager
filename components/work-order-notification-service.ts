/**
 * Service for sending work order notifications
 */
import { getClientById } from "@/lib/firebase/firestore"

/**
 * Sends notifications for a new work order
 * @param workOrderData The work order data
 * @returns Promise with notification result
 */
export async function sendWorkOrderNotifications(workOrderData: any) {
  try {
    // Extract client information
    let clientEmail = ""
    let clientName = workOrderData.client
    const contactPerson = workOrderData.persoanaContact

    // Try to get client email from client object
    if (typeof workOrderData.client === "object" && workOrderData.client !== null) {
      if (workOrderData.client.email) {
        clientEmail = workOrderData.client.email
        clientName = workOrderData.client.nume || workOrderData.client.name || clientName
      }
    } else {
      // If client is just a string (name), try to fetch the client data
      try {
        const clientData = await getClientById(workOrderData.client)
        if (clientData && clientData.email) {
          clientEmail = clientData.email
          clientName = clientData.nume || clientData.name || clientName
        }
      } catch (error) {
        console.error("Error fetching client data:", error)
      }
    }

    // Prepare notification data
    const notificationData = {
      client: {
        name: clientName,
        email: clientEmail,
        contactPerson: contactPerson,
      },
      technicians: Array.isArray(workOrderData.tehnicieni)
        ? workOrderData.tehnicieni.map((tech) => {
            // If tech is just a string (name)
            if (typeof tech === "string") {
              return {
                name: tech,
                email: null, // Will be populated by the API if available
              }
            }
            // If tech is an object
            return {
              name: tech.displayName || tech.name || tech,
              email: tech.email || null,
            }
          })
        : [],
      details: {
        workType: workOrderData.tipLucrare || "",
        issueDate: workOrderData.dataEmiterii || new Date().toLocaleDateString("ro-RO"),
        interventionDate: workOrderData.dataInterventie || "",
        location: workOrderData.locatie || "",
        description: workOrderData.descriere || "",
        reportedIssue: workOrderData.defectReclamat || "",
        status: workOrderData.statusLucrare || "Programat",
      },
      workOrderId: workOrderData.id || "",
    }

    // Send notifications
    const response = await fetch("/api/notifications/work-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return {
        success: false,
        error: errorData.error || `Error: ${response.status} ${response.statusText}`,
      }
    }

    const result = await response.json()
    return { success: true, result }
  } catch (error) {
    console.error("Error sending work order notifications:", error)
    return { success: false, error: error.message || "Unknown error" }
  }
}
