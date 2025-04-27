/**
 * Service for sending work order notifications
 */

import type { Lucrare } from "@/lib/firebase/firestore"
import type { Client } from "@/lib/firebase/firestore"

interface NotificationResult {
  success: boolean
  message: string
}

/**
 * Sends notifications for a new work order
 * @param workOrder The work order data
 * @param client The client data
 * @param technicians Array of technician data
 * @returns Promise with notification result
 */
export async function sendWorkOrderNotifications(
  workOrder: Lucrare,
  client: Client,
  technicians: Array<{ displayName: string; email: string }>,
): Promise<NotificationResult> {
  try {
    // Prepare the request data
    const requestData = {
      workOrderId: workOrder.id || "",
      client: {
        name: client.nume,
        email: client.email,
        contactPerson: workOrder.persoanaContact,
      },
      technicians: technicians.map((tech) => ({
        name: tech.displayName || "",
        email: tech.email || "",
      })),
      details: {
        issueDate: workOrder.dataEmiterii,
        interventionDate: workOrder.dataInterventie,
        workType: workOrder.tipLucrare,
        location: workOrder.locatie,
        description: workOrder.descriere,
        reportedIssue: workOrder.defectReclamat,
        status: workOrder.statusLucrare,
      },
    }

    // Send the notification request
    const response = await fetch("/api/notifications/work-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || "A apărut o eroare la trimiterea notificărilor")
    }

    return {
      success: true,
      message: "Notificările au fost trimise cu succes",
    }
  } catch (error) {
    console.error("Eroare la trimiterea notificărilor:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "A apărut o eroare la trimiterea notificărilor",
    }
  }
}
