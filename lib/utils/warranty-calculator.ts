/**
 * Utilități pentru calculul garanției echipamentelor
 * BACKWARD COMPATIBLE - pentru echipamentele existente fără garanție setată
 */

import { format, addMonths, differenceInDays, parseISO, isValid } from "date-fns"
import { ro } from "date-fns/locale"
import type { Echipament } from "@/lib/firebase/firestore"

// Constante pentru garanție
export const DEFAULT_WARRANTY_MONTHS = 12
export const WARRANTY_MESSAGE_NO_DATA = "echipament fără garanție introdusă, implicit 12 luni"

/**
 * Calculează data expirării garanției pentru un echipament
 * @param echipament Echipamentul pentru care se calculează garanția
 * @returns Obiect cu informații despre garanție
 */
export function calculateWarranty(echipament: Echipament) {
  // Verificăm dacă avem data instalării (backward compatible cu ambele nume)
  const dataInstalarii = echipament.dataInstalarii || echipament.dataInstalare
  if (!dataInstalarii) {
    return {
      hasWarrantyData: false,
      isInWarranty: false,
      warrantyExpires: null,
      daysRemaining: 0,
      monthsRemaining: 0,
      warrantyMessage: "Data instalării lipsește - nu se poate calcula garanția",
      hasExplicitWarranty: false
    }
  }

  // Parsăm data instalării
  let installationDate: Date
  try {
    // Suportăm mai multe formate de dată
    if (dataInstalarii.includes('.')) {
      // Format DD.MM.YYYY
      const [day, month, year] = dataInstalarii.split('.')
      
      // Convertim la numere și validăm
      const dayNum = parseInt(day, 10)
      const monthNum = parseInt(month, 10)
      const yearNum = parseInt(year, 10)
      
      // Validăm valorile
      if (isNaN(dayNum) || isNaN(monthNum) || isNaN(yearNum)) {
        throw new Error("Valori numerice invalide în dată")
      }
      
      if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
        throw new Error("Valori de dată în afara limitelor normale")
      }
      
      installationDate = new Date(yearNum, monthNum - 1, dayNum)
    } else {
      // Format ISO sau alte formate
      installationDate = parseISO(dataInstalarii)
    }

    if (!isValid(installationDate)) {
      throw new Error("Data invalidă")
    }
  } catch (error) {
    return {
      hasWarrantyData: false,
      isInWarranty: false,
      warrantyExpires: null,
      daysRemaining: 0,
      monthsRemaining: 0,
      warrantyMessage: "Data instalării este invalidă",
      hasExplicitWarranty: false
    }
  }

  // Determinăm câte luni de garanție are
  const warrantyMonths = Number(echipament.garantieLuni ?? DEFAULT_WARRANTY_MONTHS)
  const hasExplicitWarranty = echipament.garantieLuni !== undefined

  // Calculăm data expirării garanției - METODA CORECTATĂ
  const warrantyExpirationDate = new Date(installationDate)
  // Adăugăm lunile manual pentru a evita probleme cu addMonths
  const newYear = warrantyExpirationDate.getFullYear()
  const newMonth = warrantyExpirationDate.getMonth() + warrantyMonths
  const newDay = warrantyExpirationDate.getDate()
  
  // Calculăm anii și lunile corecte
  const finalYear = newYear + Math.floor(newMonth / 12)
  const finalMonth = newMonth % 12
  
  warrantyExpirationDate.setFullYear(finalYear, finalMonth, newDay)

  // Calculăm diferența față de azi
  const today = new Date()
  const daysRemaining = differenceInDays(warrantyExpirationDate, today)
  const isInWarranty = daysRemaining > 0

  // Calculăm câte luni întregi mai rămân
  const monthsRemaining = Math.max(0, Math.floor(daysRemaining / 30))

  // Mesaj pentru garanție
  let warrantyMessage = ""
  if (!hasExplicitWarranty) {
    warrantyMessage = WARRANTY_MESSAGE_NO_DATA
  } else if (isInWarranty) {
    if (daysRemaining > 30) {
      warrantyMessage = `Garanție validă - expiră peste ${monthsRemaining} luni și ${daysRemaining % 30} zile`
    } else {
      warrantyMessage = `Garanție validă - expiră peste ${daysRemaining} zile`
    }
  } else {
    const daysExpired = Math.abs(daysRemaining)
    warrantyMessage = `Garanție expirată de ${daysExpired} zile`
  }

  return {
    hasWarrantyData: true,
    isInWarranty,
    warrantyExpires: format(warrantyExpirationDate, "dd.MM.yyyy", { locale: ro }),
    warrantyExpirationDate,
    daysRemaining: Math.max(0, daysRemaining),
    monthsRemaining,
    warrantyMessage,
    hasExplicitWarranty,
    warrantyMonths,
    installationDate: format(installationDate, "dd.MM.yyyy", { locale: ro })
  }
}

/**
 * Verifică rapid dacă un echipament este în garanție
 * @param echipament Echipamentul de verificat
 * @returns true dacă este în garanție, false altfel
 */
export function isEquipmentInWarranty(echipament: Echipament): boolean {
  const warranty = calculateWarranty(echipament)
  return warranty.isInWarranty
}

/**
 * Obține un mesaj scurt despre statusul garanției
 * @param echipament Echipamentul pentru care se generează mesajul
 * @returns Mesaj despre statusul garanției
 */
export function getWarrantyStatusMessage(echipament: Echipament): string {
  const warranty = calculateWarranty(echipament)
  
  if (!warranty.hasWarrantyData) {
    return warranty.warrantyMessage
  }

  if (warranty.isInWarranty) {
    return `În garanție până la ${warranty.warrantyExpires}`
  } else {
    return `Garanție expirată la ${warranty.warrantyExpires}`
  }
}

/**
 * Obține informații detaliate despre garanție pentru afișare
 * @param echipament Echipamentul pentru care se generează informațiile
 * @returns Obiect cu informații formatate pentru UI
 */
export function getWarrantyDisplayInfo(echipament: Echipament) {
  const warranty = calculateWarranty(echipament)
  
  return {
    ...warranty,
    statusColor: warranty.isInWarranty ? "green" : "red",
    statusText: warranty.isInWarranty ? "În garanție" : "Garanție expirată",
    statusBadgeClass: warranty.isInWarranty 
      ? "bg-green-100 text-green-800 border-green-200"
      : "bg-red-100 text-red-800 border-red-200",
    warningClass: !warranty.hasExplicitWarranty 
      ? "bg-yellow-100 text-yellow-800 border-yellow-200"
      : ""
  }
}

/**
 * Calculează și setează informațiile de garanție pentru o lucrare
 * @param lucrare Lucrarea pentru care se calculează garanția
 * @param echipament Echipamentul asociat lucrării
 * @returns Obiect cu datele actualizate pentru lucrare
 */
export function updateWorkOrderWarrantyInfo(lucrare: any, echipament: Echipament) {
  // Calculăm garanția doar pentru "Intervenție în garanție"
  if (lucrare.tipLucrare !== "Intervenție în garanție") {
    return lucrare
  }

  const warranty = calculateWarranty(echipament)
  
  return {
    ...lucrare,
    garantieExpira: warranty.warrantyExpires,
    garantieZileRamase: warranty.daysRemaining,
    // Nu setăm garantieVerificata sau esteInGarantie aici - acestea vor fi setate de tehnician
  }
} 