import type { Timestamp, DocumentData } from "firebase/firestore"
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
  getCountFromServer,
} from "firebase/firestore"
import { db } from "./firebase"

export interface PersoanaContact {
  id?: string
  nume: string
  telefon: string
  email?: string
  functie?: string
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
  // Câmpuri pentru timpul de sosire și plecare
  timpSosire?: string
  dataSosire?: string
  oraSosire?: string
  timpPlecare?: string
  dataPlecare?: string
  oraPlecare?: string
  durataInterventie?: string
  // Câmpuri pentru semnături
  semnaturaTehnician?: string
  semnaturaBeneficiar?: string
  // Câmpuri pentru numele semnatarilor
  numeTehnician?: string
  numeBeneficiar?: string
  // Câmp pentru informații client
  clientInfo?: any
  // Câmp pentru produse
  products?: ProductItem[]
  // CÂMPURI NOI PENTRU BLOCAREA DATELOR RAPORT - BACKWARD COMPATIBLE
  // Snapshot-ul datelor la prima generare a raportului
  raportSnapshot?: {
    timpPlecare: string
    dataPlecare: string
    oraPlecare: string
    durataInterventie: string
    products: ProductItem[]
    constatareLaLocatie?: string
    descriereInterventie?: string
    semnaturaTehnician?: string
    semnaturaBeneficiar?: string
    numeTehnician?: string
    numeBeneficiar?: string
    dataGenerare: string // când a fost generat prima dată
  }
  // Flag pentru a indica că datele sunt blocate
  raportDataLocked?: boolean
  // CÂMPURI NOI PENTRU GARANȚIE - BACKWARD COMPATIBLE
  // Aplicabile doar pentru "Intervenție în garanție"
  garantieVerificata?: boolean     // Dacă tehnicianul a verificat garanția prin QR code
  esteInGarantie?: boolean        // Declarația tehnicianului dacă echipamentul e în garanție
  garantieExpira?: string         // Data când expiră garanția (calculată automat)
  garantieZileRamase?: number     // Câte zile mai are garanție (calculat automat)
}

export interface Client {
  id?: string
  nume: string
  adresa: string
  email: string
  telefon?: string  // OPȚIONAL pentru compatibilitate cu date existente
  reprezentantFirma?: string  // OPȚIONAL pentru compatibilitate cu date existente
  cui: string
  regCom: string
  contBancar: string
  banca: string
  persoaneContact?: PersoanaContact[]
  echipamente?: Echipament[]
  contracte?: Contract[]
  locatii?: Locatie[]
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
  // CÂMPURI NOI PENTRU GARANȚIE - BACKWARD COMPATIBLE
  dataInstalarii?: string  // Data instalării echipamentului (format DD.MM.YYYY)
  dataInstalare?: string   // Alias pentru backward compatibility
  garantieLuni?: number    // Numărul de luni de garanție (implicit 12)
  observatii?: string      // Observații despre echipament
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

export interface Locatie {
  nume: string
  adresa: string
  persoaneContact: PersoanaContact[]
  echipamente: Echipament[]
}

export interface Log {
  id?: string
  userId: string
  action: string
  target: string
  targetId: string
  details: string
  timestamp?: any
}

export interface ProductItem {
  name: string
  quantity: number
  price: number
  um: string
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

// Efficiently count documents in a collection (no full read)
export const getCollectionCount = async (collectionName: string) => {
  const coll = collection(db, collectionName)
  const snapshot = await getCountFromServer(coll)
  return snapshot.data().count as number
}

// Contract assignment functions - BACKWARD COMPATIBLE
export const assignContractToClient = async (contractId: string, clientId: string): Promise<void> => {
  // Verificăm dacă contractul există și nu este deja asignat
  const contractRef = doc(db, "contracts", contractId)
  const contractSnap = await getDoc(contractRef)
  
  if (!contractSnap.exists()) {
    throw new Error("Contractul nu există")
  }
  
  const contractData = contractSnap.data()
  
  // Verificăm dacă contractul este deja asignat altui client
  if (contractData.clientId && contractData.clientId !== clientId) {
    // Obținem numele clientului pentru mesaj mai clar
    const existingClient = await getClientById(contractData.clientId)
    const clientName = existingClient ? existingClient.nume : "client necunoscut"
    throw new Error(`Contractul este deja asignat clientului: ${clientName}`)
  }
  
  // Asignăm contractul la client
  await updateDoc(contractRef, {
    clientId: clientId,
    updatedAt: serverTimestamp(),
  })
}

export const unassignContractFromClient = async (contractId: string): Promise<void> => {
  const contractRef = doc(db, "contracts", contractId)
  await updateDoc(contractRef, {
    clientId: null,
    updatedAt: serverTimestamp(),
  })
}

export const getContractsByClient = async (clientId: string) => {
  const contractsRef = collection(db, "contracts")
  const q = query(contractsRef, where("clientId", "==", clientId))
  const snapshot = await getDocs(q)
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}

export const getUnassignedContracts = async () => {
  const contractsRef = collection(db, "contracts")
  // Contractele fără clientId SUNT considerate neasignate (backward compatible)
  const q1 = query(contractsRef, where("clientId", "==", null))
  const q2 = query(contractsRef, where("clientId", "==", ""))
  
  const [snapshot1, snapshot2] = await Promise.all([
    getDocs(q1),
    getDocs(q2)
  ])
  
  // Obținem și contractele care nu au deloc câmpul clientId (datele vechi)
  const allContractsRef = collection(db, "contracts")
  const allSnapshot = await getDocs(allContractsRef)
  
  const unassignedContracts: any[] = []
  
  // Adăugăm contractele cu clientId null sau ""
  snapshot1.docs.forEach(doc => {
    unassignedContracts.push({ id: doc.id, ...doc.data() })
  })
  snapshot2.docs.forEach(doc => {
    unassignedContracts.push({ id: doc.id, ...doc.data() })
  })
  
  // Adăugăm contractele care nu au deloc câmpul clientId (backward compatibility)
  allSnapshot.docs.forEach(doc => {
    const data = doc.data()
    if (!data.hasOwnProperty('clientId')) {
      unassignedContracts.push({ id: doc.id, ...data })
    }
  })
  
  // Eliminăm duplicatele
  const uniqueContracts = unassignedContracts.filter((contract, index, self) => 
    index === self.findIndex(c => c.id === contract.id)
  )
  
  return uniqueContracts
}

export const isContractAvailableForClient = async (contractId: string, clientId: string): Promise<boolean> => {
  const contractRef = doc(db, "contracts", contractId)
  const contractSnap = await getDoc(contractRef)
  
  if (!contractSnap.exists()) {
    return false
  }
  
  const contractData = contractSnap.data()
  
  // Contractul este disponibil dacă:
  // 1. Nu are clientId setat (backward compatible)
  // 2. Are clientId null sau ""
  // 3. Are clientId setat la clientul curent
  return !contractData.clientId || 
         contractData.clientId === "" || 
         contractData.clientId === clientId
}

// Funcție pentru verificarea duplicatelor de contracte pe baza numărului
export const checkContractNumberDuplicate = async (contractNumber: string, excludeContractId?: string): Promise<{ isDuplicate: boolean; existingContract?: any; assignedClient?: any }> => {
  try {
    const contractsRef = collection(db, "contracts")
    const q = query(contractsRef, where("number", "==", contractNumber))
    const snapshot = await getDocs(q)
    
    // Filtrăm contractul curent dacă este editare
    const duplicateContracts = snapshot.docs.filter(doc => doc.id !== excludeContractId)
    
    if (duplicateContracts.length === 0) {
      return { isDuplicate: false }
    }
    
    const existingContract = duplicateContracts[0].data()
    let assignedClient = null
    
    // Dacă contractul este asignat unui client, obținem datele clientului
    if (existingContract.clientId) {
      assignedClient = await getClientById(existingContract.clientId)
    }
    
    return {
      isDuplicate: true,
      existingContract: { id: duplicateContracts[0].id, ...existingContract },
      assignedClient
    }
  } catch (error) {
    console.error("Eroare la verificarea duplicatelor de contracte:", error)
    throw error
  }
}

// Funcție pentru verificarea globală înainte de asignarea unui contract
export const validateContractAssignment = async (contractNumber: string, clientId: string, excludeContractId?: string): Promise<{ isValid: boolean; error?: string }> => {
  try {
    // 1. Verificăm dacă există alt contract cu același număr
    const duplicateCheck = await checkContractNumberDuplicate(contractNumber, excludeContractId)
    
    if (duplicateCheck.isDuplicate) {
      const existingContract = duplicateCheck.existingContract
      const assignedClient = duplicateCheck.assignedClient
      
      // Dacă contractul existent este asignat unui alt client
      if (existingContract.clientId && existingContract.clientId !== clientId) {
        const clientName = assignedClient ? assignedClient.nume : "client necunoscut"
        return {
          isValid: false,
          error: `Contractul "${contractNumber}" este deja asignat clientului: ${clientName}`
        }
      }
      
      // Dacă contractul existent nu este asignat, dar încercăm să-l asignăm
      if (!existingContract.clientId && clientId) {
        return {
          isValid: false,
          error: `Există deja un contract cu numărul "${contractNumber}" care nu este asignat. Asignați acel contract în loc să creați unul nou.`
        }
      }
    }
    
    // 2. Verificăm dacă clientul nu are deja un contract cu același număr
    if (clientId) {
      const clientContracts = await getContractsByClient(clientId)
      const hasContractWithSameNumber = clientContracts.some((contract: any) => 
        contract.number === contractNumber && contract.id !== excludeContractId
      )
      
      if (hasContractWithSameNumber) {
        const client = await getClientById(clientId)
        const clientName = client ? client.nume : "client necunoscut"
        return {
          isValid: false,
          error: `Clientul "${clientName}" are deja un contract cu numărul "${contractNumber}"`
        }
      }
    }
    
    return { isValid: true }
  } catch (error) {
    console.error("Eroare la validarea asignării contractului:", error)
    return {
      isValid: false,
      error: "A apărut o eroare la validarea contractului"
    }
  }
}
