import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  type DocumentData,
  type QueryConstraint,
  Timestamp,
  where,
} from "firebase/firestore"
import { db } from "./config"
import { auth } from "./config"

// Update the Echipament interface to reflect the new code format
export interface Echipament {
  id?: string
  nume: string
  cod: string // Cod unic format din 4 litere + 4 cifre
  model?: string
  serie?: string
  dataInstalare?: string
  ultimaInterventie?: string
  observatii?: string
}

// Tipuri pentru lucrări
// Actualizăm interfața Lucrare pentru a include tipul contractului
export interface Lucrare {
  id?: string
  client: string
  persoanaContact: string
  telefon: string
  dataEmiterii: string
  dataInterventie: string
  tipLucrare: string
  locatie: string
  echipament?: string
  echipamentCod?: string
  descriere: string
  statusLucrare: string
  statusFacturare: string
  tehnicieni: string[]
  descriereInterventie?: string
  constatareLaLocatie?: string // New field for technician's on-site assessment
  contract?: string
  contractNumber?: string
  contractType?: string // Adăugăm tipul contractului
  defectReclamat?: string
  // Câmpuri noi pentru verificarea echipamentului
  equipmentVerified?: boolean
  equipmentVerifiedAt?: string
  equipmentVerifiedBy?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  createdBy?: string
  updatedBy?: string
  // Add new field for all contact persons
  persoaneContact?: PersoanaContact[]
}

// Adăugăm interfața pentru persoanele de contact
export interface PersoanaContact {
  nume: string
  telefon: string
  email?: string
  functie?: string
}

// Adăugăm interfața pentru locații - actualizată pentru a include echipamente
export interface Locatie {
  nume: string
  adresa: string
  persoaneContact: PersoanaContact[]
  echipamente?: Echipament[] // Lista de echipamente pentru această locație
}

// Tipuri pentru clienți - actualizăm pentru a include CIF și locații
export interface Client {
  id?: string
  nume: string
  cif?: string // Adăugăm CIF
  adresa: string
  persoanaContact: string // Păstrăm pentru compatibilitate cu datele existente
  telefon: string
  email: string
  numarLucrari?: number
  // Adăugăm câmpul pentru persoanele de contact
  persoaneContact?: PersoanaContact[]
  // Adăugăm câmpul pentru locații
  locatii?: Locatie[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

// Tipuri pentru loguri
export interface Log {
  id?: string
  timestamp: Timestamp
  utilizator: string
  utilizatorId?: string
  actiune: string
  detalii: string
  tip: string
  categorie: string
}

// Tipuri pentru autentificare
export type UserRole = "admin" | "dispecer" | "tehnician"

export interface UserData {
  uid: string
  email: string | null
  displayName: string | null
  role: UserRole
  telefon?: string
  createdAt?: Date
  lastLogin?: Date
}

// Funcție pentru a obține numele colecției într-un format mai prietenos
const getCollectionDisplayName = (collectionName: string): string => {
  const displayNames: Record<string, string> = {
    lucrari: "lucrare",
    clienti: "client",
    users: "utilizator",
    logs: "log",
  }

  return displayNames[collectionName] || collectionName
}

// Funcție pentru a obține detalii despre document în funcție de colecție
const getDocumentDetails = async (collectionName: string, docId: string, data?: any): Promise<string> => {
  try {
    // Dacă avem deja datele, le folosim
    if (data) {
      if (collectionName === "clienti" && data.nume) {
        return `clientul "${data.nume}"`
      } else if (collectionName === "lucrari" && data.client) {
        return `lucrarea pentru clientul "${data.client}" din data ${data.dataInterventie || "N/A"}`
      } else if (collectionName === "users" && data.displayName) {
        return `utilizatorul "${data.displayName}"`
      }
    }

    // Altfel, încercăm să obținem documentul
    const docRef = doc(db, collectionName, docId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      const docData = docSnap.data()
      if (collectionName === "clienti" && docData.nume) {
        return `clientul "${docData.nume}"`
      } else if (collectionName === "lucrari" && docData.client) {
        return `lucrarea pentru clientul "${docData.client}" din data ${docData.dataInterventie || "N/A"}`
      } else if (collectionName === "users" && docData.displayName) {
        return `utilizatorul "${docData.displayName}"`
      }
    }

    // Dacă nu putem obține detalii specifice, returnăm un mesaj generic
    return `${getCollectionDisplayName(collectionName)} cu ID-ul ${docId}`
  } catch (error) {
    console.error(`Eroare la obținerea detaliilor documentului:`, error)
    return `${getCollectionDisplayName(collectionName)} cu ID-ul ${docId}`
  }
}

// Funcție pentru a formata modificările într-un mod mai prietenos
const formatChanges = (oldData: any, newData: any): string[] => {
  const changes: string[] = []

  // Ignorăm câmpurile de sistem
  const ignoredFields = ["updatedAt", "updatedBy", "createdAt", "createdBy"]

  for (const key in newData) {
    if (ignoredFields.includes(key)) continue

    // Verificăm dacă valoarea s-a schimbat
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      // Formatăm modificarea în funcție de tipul câmpului
      if (key === "tehnicieni" && Array.isArray(oldData[key]) && Array.isArray(newData[key])) {
        changes.push(`tehnicieni din [${oldData[key].join(", ")}] în [${newData[key].join(", ")}]`)
      } else if (key === "statusLucrare") {
        changes.push(`status lucrare din "${oldData[key] || "Nespecificat"}" în "${newData[key]}"`)
      } else if (key === "statusFacturare") {
        changes.push(`status facturare din "${oldData[key] || "Nespecificat"}" în "${newData[key]}"`)
      } else {
        // Pentru câmpuri simple, afișăm valoarea veche și cea nouă
        const oldValue = oldData[key] !== undefined ? `"${oldData[key]}"` : "nespecificat"
        changes.push(`${key} din ${oldValue} în "${newData[key]}"`)
      }
    }
  }

  return changes
}

// Funcție generică pentru a obține toate documentele dintr-o colecție
export const getCollection = async <T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
): Promise<T[]> => {
  try {
    const q = query(collection(db, collectionName), ...constraints)
    const querySnapshot = await getDocs(q)

    return querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as T[]
  } catch (error) {
    console.error(`Eroare la obținerea colecției ${collectionName}:`, error)
    throw error
  }
}

// Funcție generică pentru a obține un document după ID
export const getDocumentById = async <T extends DocumentData>(
  collectionName: string,
  docId: string,
): Promise<T | null> => {
  try {
    const docRef = doc(db, collectionName, docId)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as T
    }

    return null
  } catch (error) {
    console.error(`Eroare la obținerea documentului ${docId} din ${collectionName}:`, error)
    throw error
  }
}

// Funcție generică pentru a adăuga un document
export const addDocument = async <T extends DocumentData>(collectionName: string, data: T): Promise<string> => {
  try {
    const user = auth.currentUser
    const userName = user?.displayName || user?.email || "Sistem"

    // Asigurăm-ne că nu suprascriem câmpurile createdAt și updatedAt dacă sunt deja definite
    const docData = {
      ...data,
      createdAt: data.createdAt || serverTimestamp(),
      updatedAt: data.updatedAt || serverTimestamp(),
      createdBy: user?.uid || "system",
      updatedBy: user?.uid || "system",
    }

    const docRef = await addDoc(collection(db, collectionName), docData)

    // Obținem detalii despre document pentru un mesaj de log mai descriptiv
    let logDetails = ""

    if (collectionName === "clienti" && data.nume) {
      logDetails = `Utilizatorul ${userName} a adăugat un nou client: "${data.nume}"`
    } else if (collectionName === "lucrari" && data.client) {
      logDetails = `Utilizatorul ${userName} a adăugat o nouă lucrare pentru clientul "${data.client}" programată pe ${data.dataInterventie || "N/A"}`
    } else if (collectionName === "users" && data.displayName) {
      logDetails = `Utilizatorul ${userName} a adăugat un nou utilizator: "${data.displayName}" cu rolul ${data.role || "N/A"}`
    } else {
      logDetails = `Utilizatorul ${userName} a adăugat un nou ${getCollectionDisplayName(collectionName)}`
    }

    // Adăugăm un log pentru acțiunea de adăugare
    await addLog("Adăugare", logDetails, "Informație", "Date")

    return docRef.id
  } catch (error) {
    console.error(`Eroare la adăugarea documentului în ${collectionName}:`, error)
    throw error
  }
}

// Funcție generică pentru a actualiza un document
export const updateDocument = async <T extends DocumentData>(
  collectionName: string,
  docId: string,
  data: Partial<T>,
): Promise<void> => {
  try {
    const user = auth.currentUser
    const userName = user?.displayName || user?.email || "Sistem"

    const docRef = doc(db, collectionName, docId)

    // Obținem documentul înainte de actualizare pentru a avea detalii pentru log
    const docSnap = await getDoc(docRef)
    let oldData = {}
    if (docSnap.exists()) {
      oldData = docSnap.data()
    }

    // Actualizăm documentul
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
      updatedBy: user?.uid || "system",
    })

    // Obținem detalii despre document pentru un mesaj de log mai descriptiv
    let logDetails = ""

    // Formatăm modificările pentru a fi mai descriptive
    const changes = formatChanges(oldData, data)

    if (collectionName === "clienti") {
      const clientName = data.nume || (oldData as any).nume || "Necunoscut"

      if (changes.length > 0) {
        logDetails = `Utilizatorul ${userName} a modificat pentru clientul "${clientName}" următoarele câmpuri: ${changes.join(", ")}`
      } else {
        logDetails = `Utilizatorul ${userName} a actualizat clientul "${clientName}" fără modificări vizibile`
      }
    } else if (collectionName === "lucrari") {
      const clientName = data.client || (oldData as any).client || "Necunoscut"

      if (changes.length > 0) {
        logDetails = `Utilizatorul ${userName} a modificat pentru lucrarea clientului "${clientName}" următoarele câmpuri: ${changes.join(", ")}`
      } else {
        logDetails = `Utilizatorul ${userName} a actualizat lucrarea pentru clientul "${clientName}" fără modificări vizibile`
      }
    } else if (collectionName === "users") {
      const userDisplayName = data.displayName || (oldData as any).displayName || "Necunoscut"

      if (changes.length > 0) {
        logDetails = `Utilizatorul ${userName} a modificat pentru utilizatorul "${userDisplayName}" următoarele câmpuri: ${changes.join(", ")}`
      } else {
        logDetails = `Utilizatorul ${userName} a actualizat utilizatorul "${userDisplayName}" fără modificări vizibile`
      }
    } else {
      const documentDetails = await getDocumentDetails(collectionName, docId)

      if (changes.length > 0) {
        logDetails = `Utilizatorul ${userName} a modificat pentru ${documentDetails} următoarele câmpuri: ${changes.join(", ")}`
      } else {
        logDetails = `Utilizatorul ${userName} a actualizat ${documentDetails} fără modificări vizibile`
      }
    }

    // Adăugăm un log pentru acțiunea de actualizare
    await addLog("Actualizare", logDetails, "Informație", "Date")
  } catch (error) {
    console.error(`Eroare la actualizarea documentului ${docId} din ${collectionName}:`, error)
    throw error
  }
}

// Funcție generică pentru a șterge un document
export const deleteDocument = async (collectionName: string, docId: string): Promise<void> => {
  try {
    const user = auth.currentUser
    const userName = user?.displayName || user?.email || "Sistem"

    const docRef = doc(db, collectionName, docId)

    // Obținem documentul înainte de ștergere pentru a avea detalii pentru log
    const docSnap = await getDoc(docRef)
    const documentDetails = await getDocumentDetails(
      collectionName,
      docId,
      docSnap.exists() ? docSnap.data() : undefined,
    )

    // Ștergem documentul
    await deleteDoc(docRef)

    // Obținem detalii despre document pentru un mesaj de log mai descriptiv
    const logDetails = `Utilizatorul ${userName} a șters ${documentDetails}`

    // Adăugăm un log pentru acțiunea de ștergere
    await addLog("Ștergere", logDetails, "Avertisment", "Date")
  } catch (error) {
    console.error(`Eroare la ștergerea documentului ${docId} din ${collectionName}:`, error)
    throw error
  }
}

// Funcții specifice pentru lucrări
export const getLucrari = async (constraints: QueryConstraint[] = []): Promise<Lucrare[]> => {
  return getCollection<Lucrare>("lucrari", [orderBy("dataEmiterii", "desc"), ...constraints])
}

export const getLucrareById = async (id: string): Promise<Lucrare | null> => {
  return getDocumentById<Lucrare>("lucrari", id)
}

export const addLucrare = async (lucrare: Omit<Lucrare, "id">): Promise<string> => {
  return addDocument<Omit<Lucrare, "id">>("lucrari", lucrare)
}

export const updateLucrare = async (id: string, lucrare: Partial<Lucrare>): Promise<void> => {
  return updateDocument<Lucrare>("lucrari", id, lucrare)
}

export const deleteLucrare = async (id: string): Promise<void> => {
  return deleteDocument("lucrari", id)
}

// Funcții specifice pentru clienți
export const getClienti = async (constraints: QueryConstraint[] = []): Promise<Client[]> => {
  return getCollection<Client>("clienti", [orderBy("nume", "asc"), ...constraints])
}

export const getClientById = async (id: string): Promise<Client | null> => {
  return getDocumentById<Client>("clienti", id)
}

// Modificăm funcția addClient pentru a ne asigura că returnează corect ID-ul
export const addClient = async (client: Omit<Client, "id">): Promise<string> => {
  try {
    // Adăugăm explicit câmpurile createdAt și updatedAt
    const clientData = {
      ...client,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    return addDocument<Omit<Client, "id">>("clienti", clientData)
  } catch (err) {
    console.error("Eroare la adăugarea clientului:", err)
    throw err
  }
}

export const updateClient = async (id: string, client: Partial<Client>): Promise<void> => {
  return updateDocument<Client>("clienti", id, client)
}

export const deleteClient = async (id: string): Promise<void> => {
  return deleteDocument("clienti", id)
}

// Funcții specifice pentru loguri
export const getLogs = async (constraints: QueryConstraint[] = []): Promise<Log[]> => {
  return getCollection<Log>("logs", [orderBy("timestamp", "desc"), ...constraints])
}

// Adăugare log
export const addLog = async (
  actiune: string,
  detalii: string,
  tip = "Informație",
  categorie = "Sistem",
): Promise<string> => {
  try {
    const user = auth.currentUser

    const logData: Omit<Log, "id"> = {
      timestamp: Timestamp.now(),
      utilizator: user?.displayName || user?.email || "Sistem",
      // Asigurăm-ne că nu trimitem undefined pentru utilizatorId
      utilizatorId: user?.uid || null, // Folosim null în loc de undefined
      actiune,
      detalii,
      tip,
      categorie,
    }

    const docRef = await addDoc(collection(db, "logs"), logData)
    return docRef.id
  } catch (error) {
    console.error("Eroare la adăugarea logului:", error)
    throw error
  }
}

// Funcție pentru a verifica dacă un cod de echipament este unic pentru un client
export const isEchipamentCodeUnique = async (
  clientId: string,
  cod: string,
  excludeEchipamentId?: string,
): Promise<boolean> => {
  try {
    const client = await getClientById(clientId)
    if (!client || !client.locatii) return true

    // Verificăm toate locațiile clientului
    for (const locatie of client.locatii) {
      if (!locatie.echipamente) continue

      // Verificăm dacă există un echipament cu același cod
      const existingEchipament = locatie.echipamente.find(
        (e) => e.cod === cod && (!excludeEchipamentId || e.id !== excludeEchipamentId),
      )

      if (existingEchipament) return false
    }

    return true
  } catch (error) {
    console.error("Eroare la verificarea unicității codului de echipament:", error)
    throw error
  }
}

// Adaugă această funcție pentru căutarea echipamentelor după cod

/**
 * Caută un echipament după codul său
 * @param code Codul echipamentului
 * @returns Un obiect care conține echipamentul și clientul, sau null dacă nu este găsit
 */
export async function findEquipmentByCode(code: string): Promise<{ equipment: Echipament; client: Client } | null> {
  try {
    const clientsRef = collection(db, "clients")
    const clientsSnapshot = await getDocs(clientsRef)

    for (const clientDoc of clientsSnapshot.docs) {
      const clientId = clientDoc.id
      const equipmentRef = collection(db, "clients", clientId, "equipment")
      const q = query(equipmentRef, where("cod", "==", code))
      const equipmentSnapshot = await getDocs(q)

      if (!equipmentSnapshot.empty) {
        const equipmentDoc = equipmentSnapshot.docs[0]
        const equipment = { id: equipmentDoc.id, ...equipmentDoc.data() } as Echipament
        const client = { id: clientId, ...clientDoc.data() } as Client

        return { equipment, client }
      }
    }

    return null
  } catch (error) {
    console.error("Eroare la căutarea echipamentului după cod:", error)
    return null
  }
}
