import { db } from "./firebase"
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore"
import type { Equipment, EquipmentScanResult } from "@/types/equipment"
import { generateQRCode } from "../utils/qr-code"

// Colecția pentru echipamente
const EQUIPMENT_COLLECTION = "equipment"

// Generare cod unic de 4 cifre
export const generateUniqueCode = async (): Promise<string> => {
  let isUnique = false
  let code = ""

  while (!isUnique) {
    // Generează un cod aleatoriu de 4 cifre
    code = Math.floor(1000 + Math.random() * 9000).toString()

    // Verifică dacă codul există deja
    const equipmentQuery = query(collection(db, EQUIPMENT_COLLECTION), where("code", "==", code))
    const querySnapshot = await getDocs(equipmentQuery)

    if (querySnapshot.empty) {
      isUnique = true
    }
  }

  return code
}

// Adăugare echipament nou
export const addEquipment = async (
  equipmentData: Omit<Equipment, "id" | "qrCode" | "code" | "createdAt" | "updatedAt">,
): Promise<Equipment> => {
  try {
    // Generează cod unic
    const code = await generateUniqueCode()

    // Generează QR code (URL către o pagină care va afișa detaliile echipamentului)
    const qrCodeUrl = await generateQRCode(`${window.location.origin}/equipment/${code}`)

    const newEquipment = {
      ...equipmentData,
      code,
      qrCode: qrCodeUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const docRef = await addDoc(collection(db, EQUIPMENT_COLLECTION), newEquipment)

    return {
      id: docRef.id,
      ...newEquipment,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as Equipment
  } catch (error) {
    console.error("Error adding equipment:", error)
    throw error
  }
}

// Actualizare echipament
export const updateEquipment = async (id: string, equipmentData: Partial<Equipment>): Promise<void> => {
  try {
    const equipmentRef = doc(db, EQUIPMENT_COLLECTION, id)
    await updateDoc(equipmentRef, {
      ...equipmentData,
      updatedAt: serverTimestamp(),
    })
  } catch (error) {
    console.error("Error updating equipment:", error)
    throw error
  }
}

// Ștergere echipament
export const deleteEquipment = async (id: string): Promise<void> => {
  try {
    const equipmentRef = doc(db, EQUIPMENT_COLLECTION, id)
    await deleteDoc(equipmentRef)
  } catch (error) {
    console.error("Error deleting equipment:", error)
    throw error
  }
}

// Obținere echipament după ID
export const getEquipmentById = async (id: string): Promise<Equipment | null> => {
  try {
    const equipmentRef = doc(db, EQUIPMENT_COLLECTION, id)
    const equipmentSnap = await getDoc(equipmentRef)

    if (equipmentSnap.exists()) {
      return { id: equipmentSnap.id, ...equipmentSnap.data() } as Equipment
    }

    return null
  } catch (error) {
    console.error("Error getting equipment:", error)
    throw error
  }
}

// Obținere echipament după cod
export const getEquipmentByCode = async (code: string): Promise<Equipment | null> => {
  try {
    const equipmentQuery = query(collection(db, EQUIPMENT_COLLECTION), where("code", "==", code))
    const querySnapshot = await getDocs(equipmentQuery)

    if (!querySnapshot.empty) {
      const equipmentDoc = querySnapshot.docs[0]
      return { id: equipmentDoc.id, ...equipmentDoc.data() } as Equipment
    }

    return null
  } catch (error) {
    console.error("Error getting equipment by code:", error)
    throw error
  }
}

// Obținere echipamente pentru o locație
export const getEquipmentsByLocation = async (locationId: string): Promise<Equipment[]> => {
  try {
    const equipmentQuery = query(collection(db, EQUIPMENT_COLLECTION), where("locationId", "==", locationId))
    const querySnapshot = await getDocs(equipmentQuery)

    return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Equipment)
  } catch (error) {
    console.error("Error getting equipment by location:", error)
    throw error
  }
}

// Verificare echipament scanat
export const verifyScannedEquipment = async (
  code: string,
  workOrderId: string,
  locationId: string,
): Promise<EquipmentScanResult> => {
  try {
    const equipment = await getEquipmentByCode(code)

    if (!equipment) {
      return {
        isValid: false,
        message: "Echipamentul nu a fost găsit în sistem.",
      }
    }

    if (equipment.locationId !== locationId) {
      return {
        isValid: false,
        message: "Echipamentul nu aparține locației specificate în lucrare.",
        equipment,
      }
    }

    return {
      isValid: true,
      message: "Echipamentul a fost verificat cu succes.",
      equipment,
    }
  } catch (error) {
    console.error("Error verifying equipment:", error)
    throw error
  }
}

// Obținere statistici pentru un echipament
export const getEquipmentStats = async (
  equipmentId: string,
  year: number,
): Promise<{ totalInterventions: number; interventionDates: string[] }> => {
  try {
    // Implementare pentru obținerea statisticilor
    // Aceasta ar trebui să interogeze colecția de lucrări pentru a găsi toate intervențiile pentru echipamentul dat

    // Exemplu simplu:
    const startDate = new Date(year, 0, 1).toISOString()
    const endDate = new Date(year, 11, 31).toISOString()

    const workOrdersQuery = query(
      collection(db, "workOrders"),
      where("equipmentId", "==", equipmentId),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
    )

    const querySnapshot = await getDocs(workOrdersQuery)
    const interventionDates = querySnapshot.docs.map((doc) => doc.data().date as string)

    return {
      totalInterventions: interventionDates.length,
      interventionDates,
    }
  } catch (error) {
    console.error("Error getting equipment stats:", error)
    throw error
  }
}
