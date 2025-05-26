import type { Timestamp, DocumentData } from "firebase/firestore"
import type { PersoanaContact } from "./persoanaContact"
import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "firebase/firestore"
import { db } from "./firebase"

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
  echipamentModel?: string
  descriere: string
  statusLucrare: string
  statusFacturare: string
  tehnicieni: string[]
  descriereInterventie?: string
  constatareLaLocatie?: string
  contract?: string
  contractNumber?: string
  contractType?: string
  defectReclamat?: string
  // Câmpuri noi pentru verificarea echipamentului
  equipmentVerified?: boolean
  equipmentVerifiedAt?: string
  equipmentVerifiedBy?: string
  // Câmpuri pentru timpul de sosire
  dataSosire?: string // Format: dd-MM-yyyy
  oraSosire?: string // Format: HH:mm
  // Timestamp ISO for the exact arrival moment (date & time)
  timpSosire?: string
  // Câmpuri pentru plecare
  dataPlecare?: string // Format: dd-MM-yyyy
  oraPlecare?: string // Format: HH:mm
  // Timestamp ISO for departure
  timpPlecare?: string
  // Durata totală a intervenției (ex: "2h 30m" sau "150min")
  durataInterventie?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  createdBy?: string
  updatedBy?: string
  // Add new field for all contact persons
  persoaneContact?: PersoanaContact[]
  // Add new field for dispatcher pickup status
  preluatDispecer?: boolean
  raportGenerat?: boolean
  // Adăugăm câmpul pentru statusul echipamentului
  statusEchipament?: string
  // Adăugăm câmpul pentru necesitatea unei oferte
  necesitaOferta?: boolean
  // Adăugăm câmpul pentru comentarii legate de ofertă
  comentariiOferta?: string
}

export interface Client {
  id?: string
  nume: string
  adresa: string
  email: string
  telefon: string
  cui: string
  regCom: string
  contBancar: string
  banca: string
  persoaneContact?: PersoanaContact[]
  echipamente?: Echipament[]
  contracte?: Contract[]
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export interface Echipament {
  id?: string
  nume: string
  cod: string
  model?: string
  serie?: string
  status?: string
  clientId?: string
  ultimaInterventie?: string
}

export interface Contract {
  id?: string
  numar: string
  dataIncepere: string
  dataExpirare: string
  tip: string
  valoare: number
  moneda: string
  clientId?: string
}

export interface Log {
  id?: string
  userId: string
  action: string
  target: string
  targetId: string
  details: string
  timestamp: any
}

// Get all clients
export const getClienti = async () => {
  const clientsCollection = collection(db, "clienti")
  const clientsSnapshot = await getDocs(clientsCollection)
  return clientsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Client[]
}

// Get a client by ID
export const getClientById = async (id: string) => {
  const clientDoc = doc(db, "clienti", id)
  const clientSnapshot = await getDoc(clientDoc)
  if (clientSnapshot.exists()) {
    return {
      id: clientSnapshot.id,
      ...clientSnapshot.data(),
    } as Client
  }
  return null
}

// Add a new client
export const addClient = async (client: Client) => {
  const clientsCollection = collection(db, "clienti")
  client.createdAt = serverTimestamp() as Timestamp
  client.updatedAt = serverTimestamp() as Timestamp
  const docRef = await addDoc(clientsCollection, client)
  return {
    id: docRef.id,
    ...client,
  }
}

// Update a client
export const updateClient = async (id: string, client: Partial<Client>) => {
  const clientDoc = doc(db, "clienti", id)
  client.updatedAt = serverTimestamp() as Timestamp
  await updateDoc(clientDoc, client as DocumentData)
  return {
    id,
    ...client,
  }
}

// Delete a client
export const deleteClient = async (id: string) => {
  const clientDoc = doc(db, "clienti", id)
  await deleteDoc(clientDoc)
  return id
}

// Get all work orders
export const getLucrari = async () => {
  const lucrariCollection = collection(db, "lucrari")
  const lucrariSnapshot = await getDocs(lucrariCollection)
  return lucrariSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Lucrare[]
}

// Get a work order by ID
export const getLucrareById = async (id: string) => {
  const lucrareDoc = doc(db, "lucrari", id)
  const lucrareSnapshot = await getDoc(lucrareDoc)
  if (lucrareSnapshot.exists()) {
    return {
      id: lucrareSnapshot.id,
      ...lucrareSnapshot.data(),
    } as Lucrare
  }
  return null
}

// Add a new work order
export const addLucrare = async (lucrare: Lucrare) => {
  const lucrariCollection = collection(db, "lucrari")
  lucrare.createdAt = serverTimestamp() as Timestamp
  lucrare.updatedAt = serverTimestamp() as Timestamp
  const docRef = await addDoc(lucrariCollection, lucrare)
  return {
    id: docRef.id,
    ...lucrare,
  }
}

// Update a work order
export const updateLucrare = async (id: string, lucrare: Partial<Lucrare>) => {
  const lucrareDoc = doc(db, "lucrari", id)
  lucrare.updatedAt = serverTimestamp() as Timestamp
  await updateDoc(lucrareDoc, lucrare as DocumentData)
  return {
    id,
    ...lucrare,
  }
}

// Delete a work order
export const deleteLucrare = async (id: string) => {
  const lucrareDoc = doc(db, "lucrari", id)
  await deleteDoc(lucrareDoc)
  return id
}

// Check if equipment code is unique
export const isEchipamentCodeUnique = async (code: string, clientId?: string) => {
  let q
  if (clientId) {
    q = query(collection(db, "clienti"), where("echipamente", "array-contains", { cod: code, clientId: clientId }))
  } else {
    const clientsCollection = collection(db, "clienti")
    const clientsSnapshot = await getDocs(clientsCollection)
    const clients = clientsSnapshot.docs.map((doc) => doc.data() as Client)

    // Check across all clients' equipment
    const hasCodeMatch = clients.some((client) => client.echipamente?.some((equip) => equip.cod === code))

    return !hasCodeMatch
  }

  const querySnapshot = await getDocs(q)
  return querySnapshot.empty
}

// Get all logs
export const getLogs = async () => {
  const logsCollection = collection(db, "logs")
  const q = query(logsCollection, orderBy("timestamp", "desc"))
  const logsSnapshot = await getDocs(q)
  return logsSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Log[]
}

// Add a new log entry
export const addLog = async (log: Log) => {
  const logsCollection = collection(db, "logs")
  log.timestamp = serverTimestamp()
  const docRef = await addDoc(logsCollection, log)
  return {
    id: docRef.id,
    ...log,
  }
}
