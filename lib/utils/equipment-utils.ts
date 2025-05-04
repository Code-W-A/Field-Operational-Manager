import type { Echipament } from "@/lib/firebase/firestore"

/**
 * Verifică dacă un cod de echipament este valid (maxim 10 caractere, conține cifre și litere)
 */
export function isValidEquipmentCode(code: string): boolean {
  // Verifică dacă codul are maxim 10 caractere
  if (code.length > 10) return false

  // Verifică dacă codul conține cel puțin o literă
  const hasLetter = /[a-zA-Z]/.test(code)

  // Verifică dacă codul conține cel puțin o cifră
  const hasNumber = /[0-9]/.test(code)

  // Codul este valid dacă conține atât litere cât și cifre
  return hasLetter && hasNumber
}

/**
 * Verifică dacă un echipament corespunde cu o lucrare
 */
export function verifyEquipmentMatch(
  scannedEquipment: {
    code: string
    name?: string
    client?: string
    location?: string
  },
  workOrder: {
    echipamentCod?: string
    echipament?: string
    client: string
    locatie: string
  },
): { isMatch: boolean; errors: string[] } {
  const errors: string[] = []

  // Verificăm codul echipamentului
  if (workOrder.echipamentCod && scannedEquipment.code !== workOrder.echipamentCod) {
    errors.push(
      `Cod echipament necorespunzător. Așteptat: ${workOrder.echipamentCod}, Scanat: ${scannedEquipment.code}`,
    )
  }

  // Verificăm numele clientului
  if (scannedEquipment.client && scannedEquipment.client !== workOrder.client) {
    errors.push(`Client necorespunzător. Așteptat: ${workOrder.client}, Scanat: ${scannedEquipment.client}`)
  }

  // Verificăm numele locației
  if (scannedEquipment.location && scannedEquipment.location !== workOrder.locatie) {
    errors.push(`Locație necorespunzătoare. Așteptat: ${workOrder.locatie}, Scanat: ${scannedEquipment.location}`)
  }

  return {
    isMatch: errors.length === 0,
    errors,
  }
}

/**
 * Găsește un echipament după cod în lista de locații a unui client
 */
export function findEquipmentByCode(
  locations: Array<{ nume: string; echipamente?: Echipament[] }>,
  code: string,
): { equipment: Echipament; locationName: string } | null {
  for (const location of locations) {
    if (!location.echipamente) continue

    const equipment = location.echipamente.find((e) => e.cod === code)
    if (equipment) {
      return {
        equipment,
        locationName: location.nume,
      }
    }
  }

  return null
}
