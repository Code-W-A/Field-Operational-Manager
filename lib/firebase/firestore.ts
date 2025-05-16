import { db, auth } from "./config"
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type DocumentData,
  type QueryConstraint,
  Timestamp,
} from "firebase/firestore"

// Interfețe pentru tipurile de date
export interface User {
  id?: string
  email: string | null
  displayName: string | null
  role: "admin" | "dispecer" | "tehnician"
  phoneNumber?: string
  photoURL?: string
  createdAt?: Date
  lastLogin?: Date
  active?: boolean
  notifications?: {
    email?: boolean
    push?: boolean
    sms?: boolean
  }
}

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

export interface Locatie {
  nume: string
  adresa: string
  persoaneContact: PersoanaContact[]
  echipamente?: Echipament[] // Lista de echipamente pentru această locație
}

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

export interface Contract {
  id?: string
  number: string
  clientId: string
  startDate: string
  endDate: string
  value?: number
  currency?: string
  status?: string
  type?: string
  notes?: string
  createdAt?: any
  updatedAt?: any
  createdBy?: string
  active?: boolean
  equipmentIds?: string[]
}

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
  // Câmpuri pentru raport generat
  hasGeneratedReport?: boolean
  reportGeneratedAt?: string
  reportGeneratedBy?: string
  transferredToDispatcher?: boolean
  transferredAt?: string
  transferredBy?: string
  // Câmpuri pentru asignare
  assignedTo?: string | null
}

export interface PersoanaContact {
  nume: string
  telefon: string
  email?: string
  functie?: string
}

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

// Funcții pentru utilizatori
export const addUser = async (userData: User): Promise<string> => {
  const userRef = await addDoc(collection(db, "users"), {
    ...userData,
    createdAt: serverTimestamp(),
  })
  return userRef.id
}

export const getUserById = async (userId: string): Promise<User | null> => {
  const userDoc = await getDoc(doc(db, "users", userId))
  if (userDoc.exists()) {
    return { id: userDoc.id, ...userDoc.data() } as User
  }
  return null
}

export const getUserByEmail = async (email: string): Promise<User | null> => {
  const usersRef = collection(db, "users")
  const q = query(usersRef, where("email", "==", email))
  const querySnapshot = await getDocs(q)

  if (!querySnapshot.empty) {
    const userDoc = querySnapshot.docs[0]
    return { id: userDoc.id, ...userDoc.data() } as User
  }

  return null
}

export const updateUser = async (userId: string, userData: Partial<User>): Promise<void> => {
  const userRef = doc(db, "users", userId)
  await updateDoc(userRef, userData)
}

export const deleteUser = async (userId: string): Promise<void> => {
  await deleteDoc(doc(db, "users", userId))
}

export const getAllUsers = async (): Promise<User[]> => {
  const usersSnapshot = await getDocs(collection(db, "users"))
  return usersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as User)
}

// Funcții pentru clienți
export const addClient = async (clientData: Client): Promise<string> => {
  const clientRef = await addDoc(collection(db, "clients"), {
    ...clientData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return clientRef.id
}

export const getClientById = async (clientId: string): Promise<Client | null> => {
  const clientDoc = await getDoc(doc(db, "clients", clientId))
  if (clientDoc.exists()) {
    return { id: clientDoc.id, ...clientDoc.data() } as Client
  }
  return null
}

export const updateClient = async (clientId: string, clientData: Partial<Client>): Promise<void> => {
  const clientRef = doc(db, "clients", clientId)
  await updateDoc(clientRef, {
    ...clientData,
    updatedAt: serverTimestamp(),
  })
}

export const deleteClient = async (clientId: string): Promise<void> => {
  await deleteDoc(doc(db, "clients", clientId))
}

export const getAllClients = async (): Promise<Client[]> => {
  const clientsSnapshot = await getDocs(collection(db, "clients"))
  return clientsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Client)
}

// Funcții pentru locații
export const addLocation = async (locationData: Locatie): Promise<string> => {
  const locationRef = await addDoc(collection(db, "locations"), {
    ...locationData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return locationRef.id
}

export const getLocationById = async (locationId: string): Promise<Locatie | null> => {
  const locationDoc = await getDoc(doc(db, "locations", locationId))
  if (locationDoc.exists()) {
    return { id: locationDoc.id, ...locationDoc.data() } as Locatie
  }
  return null
}

export const updateLocation = async (locationId: string, locationData: Partial<Locatie>): Promise<void> => {
  const locationRef = doc(db, "locations", locationId)
  await updateDoc(locationRef, {
    ...locationData,
    updatedAt: serverTimestamp(),
  })
}

export const deleteLocation = async (locationId: string): Promise<void> => {
  await deleteDoc(doc(db, "locations", locationId))
}

export const getLocationsByClientId = async (clientId: string): Promise<Locatie[]> => {
  const locationsRef = collection(db, "locations")
  const q = query(locationsRef, where("clientId", "==", clientId))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Locatie)
}

// Funcții pentru echipamente
export const addEquipment = async (equipmentData: Echipament): Promise<string> => {
  const equipmentRef = await addDoc(collection(db, "equipment"), {
    ...equipmentData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return equipmentRef.id
}

export const getEquipmentById = async (equipmentId: string): Promise<Echipament | null> => {
  const equipmentDoc = await getDoc(doc(db, "equipment", equipmentId))
  if (equipmentDoc.exists()) {
    return { id: equipmentDoc.id, ...equipmentDoc.data() } as Echipament
  }
  return null
}

export const updateEquipment = async (equipmentId: string, equipmentData: Partial<Echipament>): Promise<void> => {
  const equipmentRef = doc(db, "equipment", equipmentId)
  await updateDoc(equipmentRef, {
    ...equipmentData,
    updatedAt: serverTimestamp(),
  })
}

export const deleteEquipment = async (equipmentId: string): Promise<void> => {
  await deleteDoc(doc(db, "equipment", equipmentId))
}

export const getEquipmentByLocationId = async (locationId: string): Promise<Echipament[]> => {
  const equipmentRef = collection(db, "equipment")
  const q = query(equipmentRef, where("locationId", "==", locationId))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Echipament)
}

export const getEquipmentByClientId = async (clientId: string): Promise<Echipament[]> => {
  const equipmentRef = collection(db, "equipment")
  const q = query(equipmentRef, where("clientId", "==", clientId))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Echipament)
}

// Funcții pentru contracte
export const addContract = async (contractData: Contract): Promise<string> => {
  const contractRef = await addDoc(collection(db, "contracts"), {
    ...contractData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return contractRef.id
}

export const getContractById = async (contractId: string): Promise<Contract | null> => {
  const contractDoc = await getDoc(doc(db, "contracts", contractId))
  if (contractDoc.exists()) {
    return { id: contractDoc.id, ...contractDoc.data() } as Contract
  }
  return null
}

export const updateContract = async (contractId: string, contractData: Partial<Contract>): Promise<void> => {
  const contractRef = doc(db, "contracts", contractId)
  await updateDoc(contractRef, {
    ...contractData,
    updatedAt: serverTimestamp(),
  })
}

export const deleteContract = async (contractId: string): Promise<void> => {
  await deleteDoc(doc(db, "contracts", contractId))
}

export const getContractsByClientId = async (clientId: string): Promise<Contract[]> => {
  const contractsRef = collection(db, "contracts")
  const q = query(contractsRef, where("clientId", "==", clientId))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Contract)
}

// Funcții pentru lucrări
export const addLucrare = async (lucrareData: Omit<Lucrare, "id">): Promise<string> => {
  return addDocument<Omit<Lucrare, "id">>("lucrari", lucrareData)
}

export const getLucrareById = async (id: string): Promise<Lucrare | null> => {
  return getDocumentById<Lucrare>("lucrari", id)
}

export const updateLucrare = async (id: string, lucrare: Partial<Lucrare>): Promise<void> => {
  return updateDocument<Lucrare>("lucrari", id, lucrare)
}

export const deleteLucrare = async (id: string): Promise<void> => {
  return deleteDocument("lucrari", id)
}

export const getLucrariByClientId = async (clientId: string): Promise<Lucrare[]> => {
  const lucrariRef = collection(db, "lucrari")
  const q = query(lucrariRef, where("client", "==", clientId))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Lucrare)
}

// Funcție pentru a marca o lucrare ca având raport generat
export const markLucrareAsReportGenerated = async (id: string): Promise<void> => {
  const user = auth.currentUser
  const userName = user?.displayName || user?.email || "Sistem"

  await updateLucrare(id, {
    hasGeneratedReport: true,
    reportGeneratedAt: new Date().toISOString(),
    reportGeneratedBy: userName,
    statusLucrare: "Finalizată",
    transferredToDispatcher: true,
    transferredAt: new Date().toISOString(),
    transferredBy: userName,
    assignedTo: null, // Resetăm asignarea pentru a nu mai fi vizibilă pentru tehnician
  })

  // Adăugăm un log pentru acțiunea de generare raport
  await addLog(
    "Raport generat",
    `Utilizatorul ${userName} a generat raport pentru lucrare și a transferat-o către dispecer`,
    "Informație",
    "Lucrare",
  )
}

// Funcții pentru loguri
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

export const getLogById = async (logId: string): Promise<Log | null> => {
  const logDoc = await getDoc(doc(db, "logs", logId))
  if (logDoc.exists()) {
    return { id: logDoc.id, ...logDoc.data() } as Log
  }
  return null
}

export const getLogsByUserId = async (userId: string): Promise<Log[]> => {
  const logsRef = collection(db, "logs")
  const q = query(logsRef, where("utilizatorId", "==", userId), orderBy("timestamp", "desc"))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Log)
}

export const getLogsByEntityId = async (entityId: string): Promise<Log[]> => {
  const logsRef = collection(db, "logs")
  const q = query(logsRef, where("entityId", "==", entityId), orderBy("timestamp", "desc"))
  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Log)
}

// Funcție pentru a obține toate logurile
export const getAllLogs = async (limit?: number): Promise<Log[]> => {
  const logsRef = collection(db, "logs")
  let q = query(logsRef, orderBy("timestamp", "desc"))

  if (limit) {
    q = query(q, limit(limit))
  }

  const querySnapshot = await getDocs(q)
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Log)
}

// Funcții specifice pentru lucrări
export const getLucrari = async (constraints: QueryConstraint[] = []): Promise<Lucrare[]> => {
  return getCollection<Lucrare>("lucrari", [orderBy("dataEmiterii", "desc"), ...constraints])
}

// Funcții specifice pentru clienți
export const getClienti = async (constraints: QueryConstraint[] = []): Promise<Client[]> => {
  return getCollection<Client>("clienti", [orderBy("nume", "asc"), ...constraints])
}

// Funcții specifice pentru loguri - adăugăm această funcție pentru compatibilitate
export const getLogs = async (constraints: QueryConstraint[] = []): Promise<Log[]> => {
  return getCollection<Log>("logs", [orderBy("timestamp", "desc"), ...constraints])
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

// Funcții generice
const getCollectionDisplayName = (collectionName: string): string => {
  const displayNames: Record<string, string> = {
    lucrari: "lucrare",
    clienti: "client",
    users: "utilizator",
    logs: "log",
  }

  return displayNames[collectionName] || collectionName
}

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
