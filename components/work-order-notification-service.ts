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
    let locationContactEmails: string[] = []

    const isValidEmail = (e?: string) => !!e && /[^\s@]+@[^\s@]+\.[^\s@]+/.test(String(e || ""))
    const norm = (s?: string) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim()

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
            clientName = clientData.nume || (clientData as any).name || clientName
            console.log("Found client email by ID:", clientEmail)
          }
          // Resolve location contact emails robustly (ID, name includes, address, all contacts)
          try {
            if (clientData && Array.isArray(clientData.locatii)) {
              const selectedLocationNameRaw = (workOrderData.locatie || workOrderData.clientInfo?.locationName || "").toString()
              const selectedLocationId = (workOrderData as any)?.clientInfo?.locationId || (workOrderData as any)?.clientInfo?.locatieId
              const selectedContactNameRaw = (workOrderData.persoanaContact || "").toString()

              const targetName = norm(selectedLocationNameRaw)
              let matchedLocations: any[] = []

              // 1) Match by ID
              if (selectedLocationId) {
                matchedLocations = clientData.locatii.filter((l: any) => String(l?.id || "") === String(selectedLocationId))
              }
              // 2) Fallback: name equality or includes (both sides)
              if (matchedLocations.length === 0 && targetName) {
                matchedLocations = clientData.locatii.filter((l: any) => {
                  const ln = norm(l?.nume || l?.name)
                  return (ln && ln === targetName) || (ln && targetName && (ln.includes(targetName) || targetName.includes(ln)))
                })
              }
              // 3) Fallback: address match
              if (matchedLocations.length === 0 && targetName) {
                matchedLocations = clientData.locatii.filter((l: any) => {
                  const la = norm(l?.adresa)
                  return la && (la === targetName || la.includes(targetName) || targetName.includes(la))
                })
              }

              // Collect emails from matched locations and ALSO from workOrderData.persoaneContact if present
              const emails: string[] = []
              const pushUnique = (e?: string) => {
                const ee = (e || "").toString().trim()
                if (isValidEmail(ee) && !emails.map((x) => x.toLowerCase()).includes(ee.toLowerCase())) emails.push(ee)
              }

              const selectedContactName = norm(selectedContactNameRaw)
              const locsToScan = matchedLocations.length > 0 ? matchedLocations : clientData.locatii
              for (const l of locsToScan) {
                const persoane = Array.isArray(l?.persoaneContact) ? l.persoaneContact : []
                // Prefer exact/fuzzy match to selected contact name
                if (selectedContactName) {
                  const exact = persoane.find((p: any) => {
                    const pn = norm(p?.nume)
                    return pn === selectedContactName || pn.includes(selectedContactName) || selectedContactName.includes(pn)
                  })
                  if (exact?.email) pushUnique(exact.email)
                }
                // Add all valid contact emails
                for (const p of persoane) pushUnique(p?.email)
                // Add location email
                pushUnique(l?.email)
              }

              // Add directly from workOrderData.persoaneContact if provided by form
              try {
                const persoaneFromWork = Array.isArray(workOrderData?.persoaneContact) ? workOrderData.persoaneContact : []
                for (const p of persoaneFromWork) pushUnique((p as any)?.email)
              } catch {}

              locationContactEmails = emails
            }
          } catch {}
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
            clientName = clientData.nume || (clientData as any).name || clientName
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
                  clientName = clientData.nume || (clientData as any).name || clientName
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
              clientName = clientData.nume || (clientData as any).name || clientName
              console.log("Found client email in Firestore by name query:", clientEmail)
            }
            // Resolve robust location emails on this record too
            try {
              const clientRecord: any = clientData
              if (Array.isArray(clientRecord?.locatii)) {
                const selectedLocationNameRaw = (workOrderData.locatie || workOrderData.clientInfo?.locationName || "").toString()
                const selectedLocationId = (workOrderData as any)?.clientInfo?.locationId || (workOrderData as any)?.clientInfo?.locatieId
                const selectedContactNameRaw = (workOrderData.persoanaContact || "").toString()

                const targetName = norm(selectedLocationNameRaw)
                let matchedLocations: any[] = []
                if (selectedLocationId) {
                  matchedLocations = clientRecord.locatii.filter((l: any) => String(l?.id || "") === String(selectedLocationId))
                }
                if (matchedLocations.length === 0 && targetName) {
                  matchedLocations = clientRecord.locatii.filter((l: any) => {
                    const ln = norm(l?.nume || l?.name)
                    return (ln && ln === targetName) || (ln && targetName && (ln.includes(targetName) || targetName.includes(ln)))
                  })
                }
                if (matchedLocations.length === 0 && targetName) {
                  matchedLocations = clientRecord.locatii.filter((l: any) => {
                    const la = norm(l?.adresa)
                    return la && (la === targetName || la.includes(targetName) || targetName.includes(la))
                  })
                }
                const emails: string[] = locationContactEmails.slice()
                const pushUnique = (e?: string) => {
                  const ee = (e || "").toString().trim()
                  if (isValidEmail(ee) && !emails.map((x) => x.toLowerCase()).includes(ee.toLowerCase())) emails.push(ee)
                }
                const selectedContactName = norm(selectedContactNameRaw)
                const locsToScan = matchedLocations.length > 0 ? matchedLocations : clientRecord.locatii
                for (const l of locsToScan) {
                  const persoane = Array.isArray(l?.persoaneContact) ? l.persoaneContact : []
                  if (selectedContactName) {
                    const exact = persoane.find((p: any) => {
                      const pn = norm(p?.nume)
                      return pn === selectedContactName || pn.includes(selectedContactName) || selectedContactName.includes(pn)
                    })
                    if (exact?.email) pushUnique(exact.email)
                  }
                  for (const p of persoane) pushUnique(p?.email)
                  pushUnique(l?.email)
                }
                try {
                  const persoaneFromWork = Array.isArray(workOrderData?.persoaneContact) ? workOrderData.persoaneContact : []
                  for (const p of persoaneFromWork) pushUnique((p as any)?.email)
                } catch {}
                locationContactEmails = emails
              }
            } catch {}
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
              const newClientName = bestMatch.nume || (bestMatch as any).name || clientName
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
                email: email.email,
                telefon: email.telefon,
              }))
              .catch((error) => {
                console.error(`Error fetching email for technician ${tech}:`, error)
                return {
                  name: tech,
                  email: null,
                  telefon: null,
                }
              }),
          )
        } else {
          // If tech is an object
          technicianPromises.push(
            Promise.resolve({
              name: tech.displayName || tech.name || tech,
              email: tech.email || null,
              telefon: tech.telefon || null,
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

    // Ensure emails from workOrderData.persoaneContact are included regardless of client lookup success
    try {
      const directContacts = Array.isArray(workOrderData?.persoaneContact) ? workOrderData.persoaneContact : []
      const existingLower = new Set((locationContactEmails || []).map((e) => String(e).toLowerCase()))
      for (const c of directContacts) {
        const e = String((c as any)?.email || '').trim()
        if (isValidEmail(e) && !existingLower.has(e.toLowerCase())) {
          locationContactEmails.push(e)
          existingLower.add(e.toLowerCase())
        }
      }
    } catch {}

    // DEBUG: Log resolved location contact emails
    try {
      console.log("[WorkOrderNotify] Location email resolution debug:")
      console.log("- Selected location name:", (workOrderData.locatie || (workOrderData as any)?.clientInfo?.locationName || ""))
      console.log("- Selected location ID:", (workOrderData as any)?.clientInfo?.locationId || (workOrderData as any)?.clientInfo?.locatieId || "")
      console.log("- Selected contact name:", (workOrderData.persoanaContact || ""))
      console.log("- Resolved locationContactEmails (unique):", (locationContactEmails || []).join(", "))
    } catch {}

    // Prepare combined recipients:
    // - If we have location contact emails, send ONLY to those (and location email)
    // - Else, fallback to client's main email
    const clientRecipientSet = new Set<string>()
    const addIfValid = (e?: string) => {
      if (!e) return
      const s = String(e).trim().toLowerCase()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) clientRecipientSet.add(s)
    }
    if ((locationContactEmails || []).length > 0) {
      ;(locationContactEmails || []).forEach((e) => addIfValid(e))
      // When sending to location contacts, do NOT include client main email
      try { console.log("[WorkOrderNotify] Using LOCATION CONTACT recipients only.") } catch {}
    } else {
      addIfValid(clientEmail || undefined)
      try { console.log("[WorkOrderNotify] Fallback to CLIENT email (no location contact emails found).") } catch {}
    }

    // Prepare notification data
    // DEBUG: Final recipients list before API call
    try {
      console.log("[WorkOrderNotify] Final client recipients:", Array.from(clientRecipientSet))
      console.log("[WorkOrderNotify] Client email fallback:", clientEmail)
    } catch {}

    const notificationData = {
      client: {
        name: clientName,
        // If we use location contacts, do not pass client email to avoid API preferring it
        email: (locationContactEmails || []).length > 0 ? "" : clientEmail,
        contactPerson: contactPerson,
      },
      technicians: technicians,
      details: {
        workType: workOrderData.tipLucrare || "",
        issueDate: workOrderData.dataEmiterii || (() => {
        const date = new Date()
        const day = date.getDate().toString().padStart(2, "0")
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear()
        return `${day}.${month}.${year}`
      })(),
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
      clientEmails: Array.from(clientRecipientSet),
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
    return { success: false, error: (error as Error).message || "Unknown error" }
  }
}

/**
 * Sends a client notification specifically for postponed work orders
 * Prefers location contact email; falls back to client's main email
 */
export async function sendWorkOrderPostponedNotification(workOrderData: any) {
  try {
    // Resolve client record (by id if present; else by name)
    let clientRecord: any | null = null
    let clientEmail: string | null = null
    let contactEmail: string | null = null
    let clientName: string = typeof workOrderData.client === "string" ? workOrderData.client : (workOrderData.client?.nume || workOrderData.client?.name || "")

    if (workOrderData.client && typeof workOrderData.client === "object" && workOrderData.client.id) {
      try {
        clientRecord = await getClientById(workOrderData.client.id)
      } catch {}
    }

    if (!clientRecord && typeof workOrderData.client === "string" && workOrderData.client) {
      try {
        clientRecord = await getClientByName(workOrderData.client)
      } catch {}
    }

    // Prefer email-ul persoanei de contact de la locație, dacă există
    if (clientRecord && Array.isArray(clientRecord.locatii) && workOrderData.locatie) {
      const loc = clientRecord.locatii.find((l: any) => l?.nume === workOrderData.locatie)
      if (loc && Array.isArray(loc.persoaneContact)) {
        const contact = workOrderData.persoanaContact
          ? loc.persoaneContact.find((c: any) => c?.nume === workOrderData.persoanaContact)
          : null
        contactEmail = contact?.email || null
      }
    }

    // Email-ul principal al clientului
    if (clientRecord && clientRecord.email) {
      clientEmail = clientRecord.email
    } else if (workOrderData.client && typeof workOrderData.client === "object" && workOrderData.client.email) {
      clientEmail = workOrderData.client.email
    }

    // Dacă nu avem încă un nume client de la record, folosește din workOrderData
    if (clientRecord && (clientRecord.nume || (clientRecord as any).name)) {
      clientName = clientRecord.nume || (clientRecord as any).name
    }

    // Construim lista finală de destinatari (client principal + persoana de contact de la locație)
    const recipients = Array.from(
      new Set(
        [clientEmail, contactEmail]
          .filter((e): e is string => Boolean(e))
          .map((e) => e.trim().toLowerCase()),
      ),
    )

    const payload = {
      workOrderId: workOrderData.id || workOrderData.lucrareId || "",
      workOrderNumber: workOrderData.number || workOrderData.id || "",
      client: {
        name: clientName,
        email: clientEmail,
        contactPerson: workOrderData.persoanaContact || null,
      },
      clientEmails: recipients,
      technicians: [], // nu notificăm tehnicieni la amânare, doar clientul
      details: {
        eventType: "postponed",
        postponeReason: workOrderData.motivAmanare || workOrderData.motiv || "",
        postponedAt: workOrderData.dataAmanare || null,
        status: "Amânată",
        location: workOrderData.locatie || "",
        workType: workOrderData.tipLucrare || "",
        interventionDate: workOrderData.dataInterventie || "",
      },
    }

    const response = await fetch("/api/notifications/work-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: errorData.error || response.statusText }
    }

    const result = await response.json().catch(() => ({}))
    return { success: true, result }
  } catch (error: any) {
    return { success: false, error: error?.message || "Unknown error" }
  }
}

/**
 * Fetches a technician's email and phone from Firestore
 * @param technicianName The technician's name
 * @returns Promise with the email address, phone number or null
 */
async function fetchTechnicianEmail(technicianName: string): Promise<{ email: string | null; telefon: string | null }> {
  try {
    console.log("Fetching email and phone for technician:", technicianName)

    // Query the users collection to find the technician by displayName
    const usersRef = collection(db, "users")
    const q = query(usersRef, where("displayName", "==", technicianName))
    const querySnapshot = await getDocs(q)

    if (!querySnapshot.empty) {
      const techData = querySnapshot.docs[0].data()
      console.log("Found technician data:", techData.displayName, techData.email, techData.telefon)
      return { 
        email: techData.email || null,
        telefon: techData.telefon || null
      }
    }

    console.warn("Technician not found in database:", technicianName)
    return { email: null, telefon: null }
  } catch (error) {
    console.error(`Error fetching technician data for ${technicianName}:`, error)
    return { email: null, telefon: null }
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
