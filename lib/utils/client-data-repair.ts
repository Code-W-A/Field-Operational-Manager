import { getClienti, updateClient } from "@/lib/firebase/firestore"
import type { Locatie } from "@/lib/firebase/firestore"

/**
 * Verifică și repară structura datelor pentru un client
 * @param clientId ID-ul clientului care trebuie verificat
 * @returns Un obiect cu rezultatele verificării și reparării
 */
export async function verifyAndRepairClientData(clientId: string) {
  try {
    // Obținem toți clienții pentru a găsi clientul după ID
    const clienti = await getClienti()
    const client = clienti.find((c) => c.id === clientId)

    if (!client) {
      return { success: false, message: "Clientul nu a fost găsit" }
    }

    let needsUpdate = false
    const repairLog = []

    // Verificăm dacă clientul are array-ul de locații
    if (!client.locatii) {
      client.locatii = []
      needsUpdate = true
      repairLog.push("Am creat array-ul de locații")
    }

    // Verificăm fiecare locație
    if (client.locatii && client.locatii.length > 0) {
      client.locatii.forEach((locatie, index) => {
        // Verificăm dacă locația are array-ul de echipamente
        if (!locatie.echipamente) {
          locatie.echipamente = []
          needsUpdate = true
          repairLog.push(`Am creat array-ul de echipamente pentru locația "${locatie.nume}"`)
        }

        // Verificăm dacă locația are array-ul de persoane de contact
        if (!locatie.persoaneContact) {
          locatie.persoaneContact = []
          needsUpdate = true
          repairLog.push(`Am creat array-ul de persoane de contact pentru locația "${locatie.nume}"`)
        }
      })
    } else if (client.persoanaContact || client.telefon) {
      // Dacă clientul nu are locații dar are persoană de contact, creăm o locație implicită
      const defaultLocatie: Locatie = {
        nume: "Sediu principal",
        adresa: client.adresa || "",
        persoaneContact: [
          {
            nume: client.persoanaContact || "Contact principal",
            telefon: client.telefon || "",
            email: client.email || "",
            functie: "",
          },
        ],
        echipamente: [],
      }

      client.locatii.push(defaultLocatie)
      needsUpdate = true
      repairLog.push("Am creat o locație implicită cu datele de contact existente")
    }

    // Dacă sunt necesare actualizări, salvăm clientul
    if (needsUpdate) {
      await updateClient(clientId, client)
      return {
        success: true,
        message: "Structura datelor clientului a fost reparată",
        details: repairLog,
        client,
      }
    }

    return {
      success: true,
      message: "Structura datelor clientului este corectă",
      client,
    }
  } catch (error) {
    console.error("Eroare la verificarea și repararea datelor clientului:", error)
    return {
      success: false,
      message: "A apărut o eroare la verificarea și repararea datelor clientului",
      error,
    }
  }
}

/**
 * Verifică și repară structura datelor pentru toți clienții
 * @returns Un obiect cu rezultatele verificării și reparării
 */
export async function verifyAndRepairAllClientsData() {
  try {
    const clienti = await getClienti()
    const results = []

    for (const client of clienti) {
      if (client.id) {
        const result = await verifyAndRepairClientData(client.id)
        results.push({
          clientId: client.id,
          clientName: client.nume,
          ...result,
        })
      }
    }

    return {
      success: true,
      message: `Verificare și reparare finalizată pentru ${results.length} clienți`,
      results,
    }
  } catch (error) {
    console.error("Eroare la verificarea și repararea datelor pentru toți clienții:", error)
    return {
      success: false,
      message: "A apărut o eroare la verificarea și repararea datelor pentru toți clienții",
      error,
    }
  }
}
