/**
 * Service for sending work order notifications
 */
import { getClientById } from "@/lib/firebase/firestore"
import { db } from "@/lib/firebase/config"

/**
 * Sends notifications for a new work order
 * @param workOrderData The work order data
 * @returns Promise with notification result
 */
export async function sendWorkOrderNotifications(workOrderData: any) {
  try {
    console.log("Starting work order notification process for:", workOrderData.id || "new work order")

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
    } else if (typeof workOrderData.client === "string") {
      // If client is just a string (name or ID), try to fetch the client data
      try {
        console.log("Fetching client data for:", workOrderData.client)
        const clientData = await getClientById(workOrderData.client)
        console.log("Client data fetched:", clientData)

        if (clientData && clientData.email) {
          clientEmail = clientData.email
          clientName = clientData.nume || clientData.name || clientName
          console.log("Found client email:", clientEmail)
        } else {
          console.warn("Client found but no email available:", clientData?.id || workOrderData.client)
        }
      } catch (error) {
        console.error("Error fetching client data:", error)
      }
    }

    // Prepare technician data with emails
    const technicianPromises = []
    if (Array.isArray(workOrderData.tehnicieni)) {
      for (const tech of workOrderData.tehnicieni) {
        if (typeof tech === "string") {
          // If tech is just a string (name), try to fetch the user data
          technicianPromises.push(
            fetchTechnicianEmail(tech)
              .then((email) => ({
                name: tech,
                email: email,
              }))
              .catch((error) => {
                console.error(`Error fetching email for technician ${tech}:`, error)
                return {
                  name: tech,
                  email: null,
                }
              }),
          )
        } else {
          // If tech is an object
          technicianPromises.push(
            Promise.resolve({
              name: tech.displayName || tech.name || tech,
              email: tech.email || null,
            }),
          )
        }
      }
    }

    // Wait for all technician data to be fetched
    const technicians = await Promise.all(technicianPromises)

    console.log("Prepared notification data:", {
      client: { name: clientName, email: clientEmail },
      technicians: technicians.map((t) => ({ name: t.name, email: t.email })),
    })

    // Prepare notification data
    const notificationData = {
      client: {
        name: clientName,
        email: clientEmail,
        contactPerson: contactPerson,
      },
      technicians: technicians,
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
      workOrderNumber: workOrderData.number || workOrderData.id || "",
    }

    // Send notifications
    console.log("Sending notification data to API:", JSON.stringify(notificationData, null, 2))
    const response = await fetch("/api/notifications/work-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(notificationData),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("API response error:", errorData)
      return {
        success: false,
        error: errorData.error || `Error: ${response.status} ${response.statusText}`,
      }
    }

    const result = await response.json()
    console.log("API response success:", result)
    return { success: true, result }
  } catch (error) {
    console.error("Error sending work order notifications:", error)
    return { success: false, error: error.message || "Unknown error" }
  }
}

/**
 * Fetches a technician's email from Firestore
 * @param technicianName The technician's name
 * @returns Promise with the email address or null
 */
async function fetchTechnicianEmail(technicianName: string): Promise<string | null> {
  try {
    console.log("Fetching email for technician:", technicianName)

    // Query the users collection to find the technician by displayName
    const usersRef = collection(db, "users")
    const q = query(usersRef, where("displayName", "==", technicianName))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      const techData = querySnapshot.docs[0].data()
      console.log("Found technician data:", techData.displayName, techData.email)
      return techData.email || null
    }

    console.warn("Technician not found in database:", technicianName)
    return null
  } catch (error) {
    console.error(`Error fetching technician email for ${technicianName}:`, error)
    return null
  }
}

// Import these at the top of the file
import { collection, query, where, getDocs } from "firebase/firestore"
