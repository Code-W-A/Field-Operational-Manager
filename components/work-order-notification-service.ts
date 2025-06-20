/**
 * Service for sending work order notifications
 */
import { getClientById } from "@/lib/firebase/firestore"
import { db } from "@/lib/firebase/config"
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore"

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
    let clientId = null

    // Try to get client email from client object
    if (typeof workOrderData.client === "object" && workOrderData.client !== null) {
      if (workOrderData.client.email) {
        clientEmail = workOrderData.client.email
        clientName = workOrderData.client.nume || workOrderData.client.name || clientName
      }

      // If we have an ID, store it for later use
      if (workOrderData.client.id) {
        clientId = workOrderData.client.id
      }
    }

    // If we don't have an email yet, try different approaches to get it
    if (!clientEmail) {
      console.log("No email found in client object, trying to fetch from Firestore")

      // Try approach 1: If we have a client ID, fetch directly
      if (clientId) {
        try {
          console.log("Fetching client by ID:", clientId)
          const clientData = await getClientById(clientId)
          console.log("Client data fetched by ID:", clientData)

          if (clientData && clientData.email) {
            clientEmail = clientData.email
            clientName = clientData.nume || clientData.name || clientName
            console.log("Found client email by ID:", clientEmail)
          }
        } catch (error) {
          console.error("Error fetching client by ID:", error)
        }
      }

      // Try approach 2: If we have a client name, try to fetch by name
      if (typeof workOrderData.client === "string" && workOrderData.client) {
        try {
          console.log("Fetching client by name:", workOrderData.client)
          const clientData = await getClientByName(workOrderData.client)
          console.log("Client data fetched by name:", clientData)

          if (clientData && clientData.email) {
            clientEmail = clientData.email
            clientName = clientData.nume || clientData.name || clientName
            console.log("Found client email by name:", clientEmail)
          }
        } catch (error) {
          console.error("Error fetching client by name:", error)
        }
      }

      // Try approach 3: Direct query to Firestore - FIXED: using "clienti" instead of "clients"
      if (!clientEmail && typeof workOrderData.client === "string" && workOrderData.client) {
        try {
          console.log("Querying Firestore directly for client:", workOrderData.client)
          const clientsRef = collection(db, "clienti") // FIXED: correct collection name "clienti"

          // Try to match by name
          const nameQuery = query(clientsRef, where("nume", "==", workOrderData.client))
          const querySnapshot = await getDocs(nameQuery)

          if (querySnapshot.empty) {
            // If no match by name, try by ID
            try {
              // Try to get directly by ID
              const clientDocRef = doc(db, "clienti", workOrderData.client)
              const clientDocSnap = await getDoc(clientDocRef)

              if (clientDocSnap.exists()) {
                const clientData = clientDocSnap.data()
                console.log("Client found by direct ID lookup:", clientData)

                if (clientData.email) {
                  clientEmail = clientData.email
                  clientName = clientData.nume || clientData.name || clientName
                  console.log("Found client email by direct ID lookup:", clientEmail)
                }
              } else {
                console.log("No client document found with ID:", workOrderData.client)
              }
            } catch (idError) {
              console.error("Error fetching client by direct ID:", idError)
            }
          }

          if (!clientEmail && !querySnapshot.empty) {
            const clientData = querySnapshot.docs[0].data()
            console.log("Client found in Firestore by name query:", clientData)

            if (clientData.email) {
              clientEmail = clientData.email
              clientName = clientData.nume || clientData.name || clientName
              console.log("Found client email in Firestore by name query:", clientEmail)
            }
          }
        } catch (error) {
          console.error("Error querying Firestore for client:", error)
        }
      }

      // Try approach 4: Search all clients for a matching name (fuzzy match)
      if (!clientEmail && typeof workOrderData.client === "string" && workOrderData.client) {
        try {
          console.log("Performing fuzzy search for client:", workOrderData.client)
          const clientsRef = collection(db, "clienti")
          const allClientsSnapshot = await getDocs(clientsRef)

          if (!allClientsSnapshot.empty) {
            // Try to find a client with a similar name
            const clientNameLower = workOrderData.client.toLowerCase().trim()
            let bestMatch = null

            for (const doc of allClientsSnapshot.docs) {
              const data = doc.data()
              if (
                (data.nume && data.nume.toLowerCase().includes(clientNameLower)) ||
                clientNameLower.includes(data.nume.toLowerCase())
              ) {
                bestMatch = data
                break
              }
            }

            if (bestMatch && bestMatch.email) {
              clientEmail = bestMatch.email
              const newClientName = bestMatch.nume || bestMatch.name || clientName
              clientName = newClientName
              console.log("Found client email through fuzzy matching:", clientEmail)
            }
          }
        } catch (error) {
          console.error("Error performing fuzzy search for client:", error)
        }
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

    // Extract only the date part from dataInterventie (format: "DD.MM.YYYY HH:MM" -> "DD.MM.YYYY")
    const getDateOnly = (dateTimeString: string) => {
      if (!dateTimeString) return ""
      // Split by space and take the first part (date)
      return dateTimeString.split(" ")[0] || dateTimeString
    }

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
        interventionDate: getDateOnly(workOrderData.dataInterventie || ""),
        location: workOrderData.locatie || "",
        description: workOrderData.descriere || "",
        reportedIssue: workOrderData.defectReclamat || "",
        status: workOrderData.statusLucrare || "Programat",
        // Adăugăm informațiile despre echipament
        equipment: workOrderData.echipament || "",
        equipmentCode: workOrderData.echipamentCod || "",
        equipmentModel: workOrderData.echipamentModel || "",
      },
      workOrderId: workOrderData.id || "", // Asigurăm-ne că ID-ul lucrării este transmis corect
      workOrderNumber: workOrderData.number || workOrderData.id || "",
    }

    console.log("ID-ul lucrării pentru notificare:", workOrderData.id || "nedefinit")
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

/**
 * Helper function to get client by name
 * @param clientName The client name
 * @returns Promise with client data or null
 */
async function getClientByName(clientName: string) {
  try {
    const clientsRef = collection(db, "clienti") // FIXED: correct collection name "clienti"
    const q = query(clientsRef, where("nume", "==", clientName))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].data()
    }

    return null
  } catch (error) {
    console.error("Error getting client by name:", error)
    return null
  }
}
