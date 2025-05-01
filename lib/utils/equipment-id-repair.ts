import { db } from "@/lib/firebase/config"
import { doc, getDoc, updateDoc } from "firebase/firestore"
import { v4 as uuidv4 } from "uuid"

/**
 * Verifică și repară ID-urile echipamentelor pentru un client
 * @param clientId ID-ul clientului
 * @returns Un obiect cu rezultatele reparării
 */
export async function repairEquipmentIds(clientId: string) {
  try {
    // Obținem documentul clientului
    const clientRef = doc(db, "clienti", clientId)
    const clientSnap = await getDoc(clientRef)

    if (!clientSnap.exists()) {
      return { success: false, message: "Clientul nu există" }
    }

    const clientData = clientSnap.data()
    let modified = false
    let repairCount = 0

    // Verificăm dacă clientul are locații
    if (!clientData.locatii || !Array.isArray(clientData.locatii)) {
      return { success: false, message: "Clientul nu are locații definite" }
    }

    // Parcurgem toate locațiile
    const updatedLocatii = clientData.locatii.map((locatie) => {
      // Verificăm dacă locația are echipamente
      if (!locatie.echipamente || !Array.isArray(locatie.echipamente)) {
        return locatie
      }

      // Parcurgem toate echipamentele și ne asigurăm că au ID-uri valide
      const updatedEchipamente = locatie.echipamente.map((echipament) => {
        if (!echipament.id) {
          // Generăm un ID nou pentru echipament
          echipament.id = uuidv4()
          modified = true
          repairCount++
        }
        return echipament
      })

      return {
        ...locatie,
        echipamente: updatedEchipamente,
      }
    })

    // Dacă am făcut modificări, actualizăm documentul
    if (modified) {
      await updateDoc(clientRef, {
        locatii: updatedLocatii,
      })

      return {
        success: true,
        message: `S-au reparat ${repairCount} echipamente pentru clientul ${clientData.nume}`,
        repairCount,
      }
    }

    return {
      success: true,
      message: "Nu au fost necesare reparații pentru echipamente",
      repairCount: 0,
    }
  } catch (error) {
    console.error("Eroare la repararea ID-urilor echipamentelor:", error)
    return {
      success: false,
      message: `Eroare la repararea ID-urilor: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

/**
 * Verifică și repară ID-urile echipamentelor pentru toți clienții
 * @returns Un obiect cu rezultatele reparării
 */
export async function repairAllEquipmentIds() {
  try {
    // Obținem toți clienții
    const clientsRef = doc(db, "clienti")
    const clientsSnap = await getDoc(clientsRef)

    if (!clientsSnap.exists()) {
      return { success: false, message: "Nu există clienți" }
    }

    const clientsData = clientsSnap.data()
    let totalRepairs = 0
    const results = []

    // Parcurgem toți clienții
    for (const clientId in clientsData) {
      const result = await repairEquipmentIds(clientId)
      results.push({
        clientId,
        ...result,
      })

      if (result.success && result.repairCount) {
        totalRepairs += result.repairCount
      }
    }

    return {
      success: true,
      message: `S-au reparat ${totalRepairs} echipamente în total`,
      totalRepairs,
      results,
    }
  } catch (error) {
    console.error("Eroare la repararea ID-urilor pentru toți clienții:", error)
    return {
      success: false,
      message: `Eroare la repararea ID-urilor: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
