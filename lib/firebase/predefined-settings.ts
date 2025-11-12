/**
 * Setări predefinite care se creează automat în sistem
 * Acestea sunt separate de setările dinamice create manual de utilizatori
 */

import { db } from "./config"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

export interface PredefinedSetting {
  id: string
  name: string
  description: string
  defaultValue: any
  valueType: "string" | "number" | "boolean"
}

/**
 * Lista setărilor predefinite
 */
export const PREDEFINED_SETTINGS: PredefinedSetting[] = [
  {
    id: "contracts_default_days_before_work",
    name: "Zile înainte pentru revizii",
    description: "Numărul de zile înainte de data programată pentru revizie când se va genera lucrarea automată",
    defaultValue: 10,
    valueType: "number",
  },
  // Aici pot fi adăugate alte setări predefinite în viitor
  // {
  //   id: "invoices_default_payment_days",
  //   name: "Zile termen plată facturi",
  //   description: "Numărul implicit de zile pentru termenul de plată al facturilor",
  //   defaultValue: 30,
  //   valueType: "number",
  // },
]

/**
 * Verifică și creează setările predefinite dacă nu există
 */
export async function ensurePredefinedSettings() {
  const promises = PREDEFINED_SETTINGS.map(async (setting) => {
    try {
      const settingRef = doc(db, "predefinedSettings", setting.id)
      const settingDoc = await getDoc(settingRef)
      
      if (!settingDoc.exists()) {
        // Creează setarea cu valoarea default
        await setDoc(settingRef, {
          ...setting,
          value: setting.defaultValue,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        console.log(`✅ Setare predefinită creată: ${setting.name}`)
      }
    } catch (error) {
      console.error(`❌ Eroare la crearea setării predefinite ${setting.id}:`, error)
    }
  })
  
  await Promise.all(promises)
}

/**
 * Obține valoarea unei setări predefinite
 */
export async function getPredefinedSettingValue(settingId: string): Promise<any> {
  try {
    const settingRef = doc(db, "predefinedSettings", settingId)
    const settingDoc = await getDoc(settingRef)
    
    if (settingDoc.exists()) {
      return settingDoc.data().value
    }
    
    // Dacă nu există, returnează valoarea default
    const predefinedSetting = PREDEFINED_SETTINGS.find((s) => s.id === settingId)
    return predefinedSetting?.defaultValue
  } catch (error) {
    console.error(`Eroare la citirea setării predefinite ${settingId}:`, error)
    // Returnează valoarea default în caz de eroare
    const predefinedSetting = PREDEFINED_SETTINGS.find((s) => s.id === settingId)
    return predefinedSetting?.defaultValue
  }
}

/**
 * Actualizează valoarea unei setări predefinite
 */
export async function updatePredefinedSettingValue(settingId: string, newValue: any): Promise<void> {
  try {
    const settingRef = doc(db, "predefinedSettings", settingId)
    await setDoc(
      settingRef,
      {
        value: newValue,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    )
    console.log(`✅ Setare predefinită actualizată: ${settingId} = ${newValue}`)
  } catch (error) {
    console.error(`❌ Eroare la actualizarea setării predefinite ${settingId}:`, error)
    throw error
  }
}

