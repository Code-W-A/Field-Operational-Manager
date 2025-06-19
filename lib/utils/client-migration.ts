import { getClienti, updateClient } from "../firebase/firestore"

interface MigrationResult {
  totalClients: number
  migratedClients: number
  errors: string[]
  details: string[]
}

export async function migrateClientData(): Promise<MigrationResult> {
  const result: MigrationResult = {
    totalClients: 0,
    migratedClients: 0,
    errors: [],
    details: []
  }

  try {
    // Obținem toți clienții
    const clients = await getClienti()
    result.totalClients = clients.length
    
    console.log(`Găsite ${clients.length} clienți pentru migrare...`)

    for (const client of clients) {
      try {
        let needsUpdate = false
        const updates: any = {}

        // Verificăm și adăugăm telefon dacă lipsește
        if (!client.telefon) {
          // Încercăm să găsim un telefon din prima persoană de contact din prima locație
          let foundPhone = ""
          if (client.locatii && client.locatii.length > 0) {
            const firstLocation = client.locatii[0]
            if (firstLocation.persoaneContact && firstLocation.persoaneContact.length > 0) {
              foundPhone = firstLocation.persoaneContact[0].telefon || ""
            }
          } else if ((client as any).persoanaContact) {
            // Fallback la structura veche
            foundPhone = (client as any).telefon || ""
          }
          
          updates.telefon = foundPhone || ""
          needsUpdate = true
          result.details.push(`Client ${client.nume}: Adăugat telefon "${foundPhone || 'Gول'}"`)
        }

        // Verificăm și adăugăm reprezentantFirma dacă lipsește
        if (!client.reprezentantFirma) {
          // Încercăm să găsim un nume din prima persoană de contact din prima locație
          let foundRepresentative = ""
          if (client.locatii && client.locatii.length > 0) {
            const firstLocation = client.locatii[0]
            if (firstLocation.persoaneContact && firstLocation.persoaneContact.length > 0) {
              foundRepresentative = firstLocation.persoaneContact[0].nume || ""
            }
          } else if ((client as any).persoanaContact) {
            // Fallback la structura veche
            foundRepresentative = (client as any).persoanaContact || ""
          }
          
          updates.reprezentantFirma = foundRepresentative || ""
          needsUpdate = true
          result.details.push(`Client ${client.nume}: Adăugat reprezentant "${foundRepresentative || 'GOUL'}"`)
        }

        // Actualizăm clientul dacă este necesar
        if (needsUpdate && client.id) {
          await updateClient(client.id, updates)
          result.migratedClients++
          console.log(`✅ Migrat client: ${client.nume}`)
        }

      } catch (error) {
        const errorMessage = `Eroare la migrarea clientului ${client.nume}: ${error}`
        result.errors.push(errorMessage)
        console.error(errorMessage)
      }
    }

    console.log(`✅ Migrare completă: ${result.migratedClients}/${result.totalClients} clienți migrați`)
    
    return result

  } catch (error) {
    const errorMessage = `Eroare la încărcarea clienților: ${error}`
    result.errors.push(errorMessage)
    console.error(errorMessage)
    return result
  }
}

// Funcție pentru verificarea stării clienților
export async function checkClientDataIntegrity() {
  try {
    const clients = await getClienti()
    
    const stats = {
      total: clients.length,
      withTelefon: 0,
      withReprezentant: 0,
      missingTelefon: [] as string[],
      missingReprezentant: [] as string[]
    }

    clients.forEach(client => {
      if (client.telefon) {
        stats.withTelefon++
      } else {
        stats.missingTelefon.push(client.nume)
      }

      if (client.reprezentantFirma) {
        stats.withReprezentant++
      } else {
        stats.missingReprezentant.push(client.nume)
      }
    })

    console.log("📊 Statistici integritate date clienți:")
    console.log(`Total clienți: ${stats.total}`)
    console.log(`Cu telefon: ${stats.withTelefon}/${stats.total}`)
    console.log(`Cu reprezentant: ${stats.withReprezentant}/${stats.total}`)
    
    if (stats.missingTelefon.length > 0) {
      console.log(`❌ Lipsește telefonul la: ${stats.missingTelefon.join(", ")}`)
    }
    
    if (stats.missingReprezentant.length > 0) {
      console.log(`❌ Lipsește reprezentantul la: ${stats.missingReprezentant.join(", ")}`)
    }

    return stats

  } catch (error) {
    console.error("Eroare la verificarea integrității datelor:", error)
    throw error
  }
} 