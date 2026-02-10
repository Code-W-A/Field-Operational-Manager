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
  writeBatch,
  limit,
  startAfter,
} from "firebase/firestore"
import { db } from "./firebase"
import { trackLucrareUpdate } from "@/lib/utils/work-modifications-tracker"
import { getLucrareTitle } from "@/lib/utils/work-modifications-tracker"
import type { WorkRevisionMeta } from "@/types/revision"

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
  // Backward-compatible IDs (optional): help resolve live client/location data even if names change
  clientId?: string
  locationId?: string
  locationName?: string
  persoanaContactEmail?: string
  telefon: string
  dataEmiterii: string
  dataInterventie: string
  tipLucrare: string
  locatie: string
  echipament?: string
  echipamentCod?: string
  echipamentModel?: string
  descriere: string
  // Notă internă introdusă la creare de către dispecer/admin
  statusLucrare: string
  statusFacturare: string
  tehnicieni: string[]
  descriereInterventie?: string
  constatareLaLocatie?: string
  contract?: string
  contractNumber?: string
  contractType?: string
  defectReclamat?: string
  // Istoric defecte reclamate: [original, RE1, RE2, ...]
  defectReclamatHistory?: string[]
  // Text suplimentar specific reintervenției (doar pentru lucrări create ca reintervenție)
  textReinterventie?: string
  // Câmpuri noi pentru verificarea echipamentului
  equipmentVerified?: boolean
  equipmentVerifiedAt?: string
  equipmentVerifiedBy?: string
  createdAt?: Timestamp
  updatedAt?: Timestamp
  createdBy?: string
  updatedBy?: string
  createdByName?: string
  updatedByName?: string
  // Add new field for all contact persons
  persoaneContact?: PersoanaContact[]
  // Add new field for dispatcher pickup status
  preluatDispecer?: boolean
  // Cine a preluat lucrarea (numele dispecerului/adminului)
  preluatDe?: string
  raportGenerat?: boolean
  // Adăugăm câmpul pentru statusul echipamentului
  statusEchipament?: string
  // Adăugăm câmpul pentru necesitatea unei oferte
  necesitaOferta?: boolean
  // Câmpuri pentru ofertă (conținut + istoric). Tipurile sunt relaxate pentru compatibilitate.
  products?: ProductItem[]
  offerTotal?: number
  offerAdjustmentPercent?: number
  offerSendCount?: number
  offerPreparedBy?: string
  offerPreparedAt?: any
  offerVersions?: Array<{
    savedAt: any
    savedBy?: string
    total: number
    products: ProductItem[]
  }>
  // Răspuns ofertă (accept / reject) – backward compatible
  offerResponse?: {
    status: "accept" | "reject"
    reason?: string
    at: any
    by?: string
  }
  // Token de acțiune pentru ofertă (link din email)
  offerActionToken?: string
  offerActionExpiresAt?: any
  offerActionUsedAt?: any
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
    // Feedback client înghețat în snapshot
    clientRating?: number
    clientReview?: string
  }
  // Flag pentru a indica că datele sunt blocate
  raportDataLocked?: boolean
  // CÂMPURI NOI PENTRU GARANȚIE - BACKWARD COMPATIBLE
  // Aplicabile doar pentru "Intervenție în garanție"
  garantieVerificata?: boolean     // Dacă tehnicianul a verificat garanția prin QR code
  esteInGarantie?: boolean        // Declarația tehnicianului dacă echipamentul e în garanție
  garantieExpira?: string         // Data când expiră garanția (calculată automat)
  garantieZileRamase?: number     // Câte zile mai are garanție (calculat automat)
  // CÂMP NOU PENTRU STATUS FINALIZARE INTERVENȚIE - BACKWARD COMPATIBLE
  statusFinalizareInterventie?: "FINALIZAT" | "NEFINALIZAT"  // Status-ul finalizării intervenției (independent de statusLucrare)
  // CÂMP NOU PENTRU REFERINȚĂ LA LUCRAREA ORIGINALĂ - BACKWARD COMPATIBLE
  lucrareOriginala?: string       // ID-ul lucrării originale în caz de reatribuire
  mesajReatribuire?: string       // Mesajul de reatribuire (ex: "reintervenită în urma lucrării x")
  // CÂMP NOU PENTRU CONFIRMAREA GARANȚIEI DE CĂTRE TEHNICIAN - BACKWARD COMPATIBLE
  tehnicianConfirmaGarantie?: boolean  // Confirmarea tehnicianului la fața locului despre garanție (doar pentru "Intervenție în garanție")
  statusOferta?: "NU" | "DA" | "OFERTAT" // Nou câmp pentru managementul statusului ofertei
  // CÂMP NOU PENTRU NUMĂRUL FACTURII - BACKWARD COMPATIBLE
  numarFactura?: string // Numărul facturii (opțional, pentru lucrările facturate)
  // CÂMP NOU PENTRU MOTIV NEFACTURARE - BACKWARD COMPATIBLE
  motivNefacturare?: string // Motivul pentru care nu se facturează
  // CÂMP NOU PENTRU NUMĂRUL RAPORTULUI - BACKWARD COMPATIBLE
  numarRaport?: string // Numărul raportului (format: #00001, generat automat la prima generare raport)
  // CÂMP NOU PENTRU NUMĂR LUCRARE - BACKWARD COMPATIBLE (egal cu numarRaport la generare)
  nrLucrare?: string
  // CÂMPURI NOI PENTRU DOCUMENTE PDF - BACKWARD COMPATIBLE
  facturaDocument?: {
    url: string         // URL-ul documentului în Firebase Storage
    fileName: string    // Numele original al fișierului
    uploadedAt: string  // Data încărcării
    uploadedBy: string  // Cine a încărcat
    numarFactura: string // Numărul facturii (editabil)
    dataFactura: string  // Data facturii (editabil)
  }
  ofertaDocument?: {
    url: string         // URL-ul documentului în Firebase Storage  
    fileName: string    // Numele original al fișierului
    uploadedAt: string  // Data încărcării
    uploadedBy: string  // Cine a încărcat
    numarOferta: string  // Numărul ofertei (editabil)
    dataOferta: string   // Data ofertei (editabil)
  }
  // CÂMPURI NOI PENTRU IMAGINI DEFECTE - BACKWARD COMPATIBLE
  imaginiDefecte?: Array<{
    url: string         // URL-ul imaginii în Firebase Storage
    fileName: string    // Numele original al fișierului
    uploadedAt: string  // Data încărcării
    uploadedBy: string  // Cine a încărcat (tehnicianul)
    compressed: boolean // Dacă imaginea a fost comprimată
  }>
  // CÂMPURI NOI PENTRU AMÂNAREA LUCRĂRII - BACKWARD COMPATIBLE
  motivAmanare?: string    // Motivul pentru care lucrarea a fost amânată
  dataAmanare?: string     // Data când lucrarea a fost amânată
  amanataDe?: string       // Cine a amânat lucrarea (tehnicianul)
  // CÂMPURI NOI PENTRU ARHIVAREA LUCRĂRII - BACKWARD COMPATIBLE
  archivedAt?: Timestamp   // Data și ora când lucrarea a fost arhivată
  archivedBy?: string      // Cine a arhivat lucrarea (admin/dispecer)
  // CÂMPURI NOI PENTRU MOTIVELE REINTERVENȚIEI - BACKWARD COMPATIBLE
  reinterventieMotiv?: {
    remediereNeconforma?: boolean     // Remediere neconformă
    necesitaTimpSuplimentar?: boolean // Necesită timp suplimentar
    necesitaPieseSuplimentare?: boolean // Necesită piese suplimentare
    garantieInterventiei?: boolean    // Garanția intervenției (maxim 6 luni)
    motive?: string[]                 // Motive dinamice din setări
    dataReinterventie?: string        // Data când s-a decis reintervenția
    decisaDe?: string                 // Cine a decis reintervenția (admin/dispecer)
  }
  // CÂMP NOU: Blochează editarea unei lucrări după ce a generat reintervenții
  lockedAfterReintervention?: boolean
  // CÂMPURI NOI: backfill/flag lansare reintervenție
  reinterventieLansata?: boolean
  reinterventieLucrareId?: string
  reinterventieLansataAt?: any
  // CÂMPURI NOI PENTRU NOTIFICATION TRACKING - BACKWARD COMPATIBLE
  notificationRead?: boolean          // Backward compatibility: dacă notificarea a fost citită (general)
  notificationReadBy?: string[]       // Array cu ID-urile utilizatorilor care au citit notificarea
  // CÂMP NOU: Notă internă a tehnicianului (nu apare în raportul final)
  notaInternaTehnician?: string
  // Feedback client – rating (1..5) și recenzie text
  clientRating?: number
  clientReview?: string
  // Email statuses (denormalized quick view)
  lastReportEmail?: {
    sentAt?: any
    to?: string[]
    status?: "queued" | "sent" | "failed" | "bounced" | "delivered"
    messageId?: string
  }
  lastOfferEmail?: {
    sentAt?: any
    to?: string[]
    status?: "queued" | "sent" | "failed" | "bounced" | "delivered"
    messageId?: string
  }
  // Revizie (multi-echipament)
  equipmentIds?: string[]           // Lista echipamentelor pentru lucrarea de tip Revizie
  revision?: WorkRevisionMeta       // Metadate revizie (versiune checklist, progres)
}

// Email events tracking
export interface EmailEvent {
  id?: string
  type: "REPORT" | "OFFER" | "GENERIC" | "TECH_NOTIFY" | "INVITE" | "TEST"
  lucrareId?: string
  clientId?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  status: "queued" | "sent" | "failed" | "bounced" | "delivered" | "skipped"
  messageId?: string
  error?: string
  provider?: string
  meta?: any
  createdAt?: Timestamp
  updatedAt?: Timestamp
}

export async function logEmailEvent(event: Omit<EmailEvent, "createdAt" | "updatedAt" | "id">): Promise<string> {
  const ref = await addDoc(collection(db, "emailEvents"), {
    ...event,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateEmailEvent(id: string, updates: Partial<EmailEvent>): Promise<void> {
  const ref = doc(db, "emailEvents", id)
  await updateDoc(ref, { ...updates, updatedAt: serverTimestamp() })
}

export interface Client {
  id?: string
  nume: string
  adresa: string
  email: string
  telefon?: string  // OPȚIONAL pentru compatibilitate cu date existente
  reprezentantFirma?: string  // OPȚIONAL pentru compatibilitate cu date existente
  functieReprezentant?: string  // OPȚIONAL: funcția reprezentantului firmei
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
  // Setări dinamice asociate echipamentului (populate automat din Setări → Formular Echipament)
  dynamicSettings?: Record<string, any>
  // CÂMPURI NOI PENTRU GARANȚIE - BACKWARD COMPATIBLE
  dataInstalarii?: string  // Data instalării echipamentului (format DD.MM.YYYY)
  dataInstalare?: string   // Alias pentru backward compatibility
  garantieLuni?: number    // Numărul de luni de garanție (implicit 12)
  observatii?: string      // Observații despre echipament
  // Documentație tehnică PDF atașată echipamentului (vizibilă pentru tehnicieni)
  documentatie?: Array<{
    url: string
    fileName: string
    uploadedAt: string
    uploadedBy: string
  }>
  // Documentații (nou) - referință către biblioteca Documentații
  documentationFolderId?: string
  documentationSubfolderId?: string
  documentationFileIds?: string[]
  documentationLabel?: string
}

export interface Contract {
  id?: string
  name: string
  number: string
  clientId?: string
  locationId?: string  // ID-ul locației selectate
  locationName?: string  // Numele locației (pentru compatibilitate)
  equipmentIds?: string[]  // Array de ID-uri echipamente selectate
  
  // Recurență revizii
  startDate?: string  // Data de început/referință pentru recurență (ISO string)
  recurrenceInterval?: number  // Valoarea intervalului (ex: 90)
  recurrenceUnit?: 'zile' | 'luni'  // Unitatea (zile sau luni)
  recurrenceDayOfMonth?: number  // Ziua din lună (1-31) - doar pentru recurență lunară
  daysBeforeWork?: number  // X zile înainte de data programată
  
  // Prețuri per tip serviciu
  pricing?: {
    [serviceType: string]: number  // ex: { "Revizie": 500, "Intervenție": 300 }
  }
  
  // Ultima dată când s-a generat o lucrare automată
  lastAutoWorkGenerated?: string
  
  // Câmpuri legacy pentru compatibilitate retroactivă
  numar?: string  // Alias pentru number
  tip?: string  // Păstrat pentru compatibilitate
  valoare?: number
  moneda?: string
  dataIncepere?: string
  dataExpirare?: string
  locatie?: string  // Alias pentru locationName
  
  createdAt?: any
  updatedAt?: any
}

export interface Locatie {
  // ID stabil pentru locație (stocat în array-ul client.locatii). Backward compatible.
  id?: string
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

/**
 * Scrie în colecția `logs` folosind schema folosită de pagina Loguri (câmpuri în limba română).
 * Operă non‑blocantă: orice eroare este prinsă și ignorată.
 */
export async function addUserLogEntry(params: {
  utilizator?: string
  utilizatorId?: string
  actiune: string
  detalii: string
  tip?: "Informație" | "Avertisment" | "Eroare"
  categorie?: string
  // context opțional despre lucrare (backward-compatible)
  lucrareId?: string
  nrLucrare?: string
  lucrareTitlu?: string
  client?: string
  locatie?: string
  // Câmpuri suplimentare pentru evenimente critice de business
  entityType?: string // "Lucrare", "Client", "Echipament", "Utilizator", etc.
  entityId?: string
  actionOutcome?: "success" | "fail"
  errorMessage?: string
  before?: any // Date înainte de modificare (JSON)
  after?: any // Date după modificare (JSON)
  metadata?: any // Alte metadate relevante (JSON)
}) {
  try {
    const { serverTimestamp, addDoc, collection } = await import("firebase/firestore")

    // Best-effort: dacă ni se pasează "Sistem"/"system" sau lipsesc userii, încercăm să luăm userul curent din Auth (doar în browser)
    let finalUtilizator = params.utilizator
    let finalUtilizatorId = params.utilizatorId
    if (typeof window !== "undefined" && (!finalUtilizatorId || finalUtilizatorId === "system")) {
      try {
        const { auth } = await import("@/lib/firebase/config")
        const currentUser = auth.currentUser
        if (currentUser) {
          finalUtilizatorId = currentUser.uid
          finalUtilizator = currentUser.displayName || currentUser.email || finalUtilizator || "Utilizator"
        }
      } catch {
        // ignorăm, rămâne fallback‑ul
      }
    }
    const payload: Record<string, any> = {
      timestamp: serverTimestamp(),
      utilizator: finalUtilizator || "Sistem",
      utilizatorId: finalUtilizatorId || "system",
      actiune: params.actiune,
      detalii: params.detalii,
      tip: params.tip || "Informație",
      categorie: params.categorie || "Sistem",
      // câmpuri opționale pentru context lucrare
      lucrareId: params.lucrareId,
      nrLucrare: params.nrLucrare,
      lucrareTitlu: params.lucrareTitlu,
      client: params.client,
      locatie: params.locatie,
      // Câmpuri suplimentare pentru evenimente critice
      entityType: params.entityType,
      entityId: params.entityId,
      actionOutcome: params.actionOutcome,
      errorMessage: params.errorMessage,
      before: params.before,
      after: params.after,
      metadata: params.metadata,
    }
    // Firestore nu acceptă valori `undefined`
    for (const k of Object.keys(payload)) {
      if (payload[k] === undefined) delete payload[k]
    }
    await addDoc(collection(db, "logs"), payload)
  } catch (e) {
    // nu blocăm acțiunea principală
    console.warn("Log writing failed (non-blocking):", e)
  }
}

function valueToComparableString(value: any): string {
  if (value === null || value === undefined) return "-"
  // Firestore Timestamp compat
  if (value && typeof value === "object" && typeof (value as any).toDate === "function") {
    return (value as any).toDate().toISOString()
  }
  if (Array.isArray(value)) {
    return value.join(", ")
  }
  try {
    return String(value)
  } catch {
    return "-"
  }
}

function diffArrays(oldArr: any[] = [], newArr: any[] = []): string | null {
  const oldSet = new Set(oldArr)
  const newSet = new Set(newArr)
  const added: string[] = []
  const removed: string[] = []
  newArr.forEach((v) => {
    if (!oldSet.has(v)) added.push(String(v))
  })
  oldArr.forEach((v) => {
    if (!newSet.has(v)) removed.push(String(v))
  })
  const parts: string[] = []
  if (added.length) parts.push(`+${added.join(", ")}`)
  if (removed.length) parts.push(`-${removed.join(", ")}`)
  return parts.length ? parts.join("; ") : null
}

// Helpers pentru dif-uri compuse la Client.locatii (inclusiv persoane de contact și echipamente)
function keyOfLocatie(loc: any): string {
  const name = (loc?.nume || "").toString().trim()
  const addr = (loc?.adresa || "").toString().trim()
  return name || addr || JSON.stringify({ n: name, a: addr })
}

function keyOfContact(c: any): string {
  const name = (c?.nume || "").toString().trim()
  const tel = (c?.telefon || "").toString().trim()
  return `${name}|${tel}`
}

function keyOfEquip(e: any): string {
  const id = (e?.id || "").toString().trim()
  const cod = (e?.cod || "").toString().trim()
  const name = (e?.nume || "").toString().trim()
  return id || cod || name || JSON.stringify({ n: name, c: cod })
}

function diffContacts(oldContacts: any[] = [], newContacts: any[] = []): string[] {
  const oldMap = new Map<string, any>(oldContacts.map((c) => [keyOfContact(c), c]))
  const newMap = new Map<string, any>(newContacts.map((c) => [keyOfContact(c), c]))
  const changes: string[] = []
  // adăugate
  for (const [k, v] of newMap) if (!oldMap.has(k)) changes.push(`persoaneContact +${v.nume || "(fără nume)"}`)
  // eliminate
  for (const [k, v] of oldMap) if (!newMap.has(k)) changes.push(`persoaneContact -${v.nume || "(fără nume)"}`)
  return changes
}

function diffEquipments(oldEq: any[] = [], newEq: any[] = []): string[] {
  const oldMap = new Map<string, any>(oldEq.map((e) => [keyOfEquip(e), e]))
  const newMap = new Map<string, any>(newEq.map((e) => [keyOfEquip(e), e]))
  const changes: string[] = []
  // adăugate
  for (const [k, v] of newMap) if (!oldMap.has(k)) changes.push(`echipamente +${v.nume || v.cod || "(nou)"}`)
  // eliminate
  for (const [k, v] of oldMap) if (!newMap.has(k)) changes.push(`echipamente -${v.nume || v.cod || "(șters)"}`)
  // modificări la cele existente
  for (const [k, newVal] of newMap) {
    const oldVal = oldMap.get(k)
    if (oldVal) {
      const fields = ["nume", "cod", "model", "serie", "dataInstalare", "ultimaInterventie", "observatii", "garantieLuni"]
      const fieldChanges: string[] = []
      fields.forEach((f) => {
        const oldStr = valueToComparableString((oldVal as any)[f])
        const newStr = valueToComparableString((newVal as any)[f])
        if (oldStr !== newStr) fieldChanges.push(`${f}: "${oldStr}" → "${newStr}"`)
      })
      if (fieldChanges.length) {
        const label = newVal.nume || newVal.cod || k
        changes.push(`echipament(${label}) { ${fieldChanges.join("; ")} }`)
      }
    }
  }
  return changes
}

function diffLocatii(oldLocs: any[] = [], newLocs: any[] = []): string[] {
  const oldMap = new Map<string, any>(oldLocs.map((l) => [keyOfLocatie(l), l]))
  const newMap = new Map<string, any>(newLocs.map((l) => [keyOfLocatie(l), l]))
  const changes: string[] = []
  // adăugate
  for (const [k, v] of newMap) if (!oldMap.has(k)) changes.push(`locații +${v.nume || v.adresa || "(nouă)"}`)
  // eliminate
  for (const [k, v] of oldMap) if (!newMap.has(k)) changes.push(`locații -${v.nume || v.adresa || "(ștearsă)"}`)
  // modificări la comune
  for (const [k, newLoc] of newMap) {
    const oldLoc = oldMap.get(k)
    if (oldLoc) {
      const fieldChanges: string[] = []
      ;["nume", "adresa"].forEach((f) => {
        const oldStr = valueToComparableString((oldLoc as any)[f])
        const newStr = valueToComparableString((newLoc as any)[f])
        if (oldStr !== newStr) fieldChanges.push(`${f}: "${oldStr}" → "${newStr}"`)
      })
      // persoane de contact
      const contactChanges = diffContacts(oldLoc.persoaneContact || [], newLoc.persoaneContact || [])
      // echipamente
      const equipChanges = diffEquipments(oldLoc.echipamente || [], newLoc.echipamente || [])
      const all = [...fieldChanges, ...contactChanges, ...equipChanges]
      if (all.length) {
        const label = newLoc.nume || newLoc.adresa || k
        changes.push(`locație(${label}) { ${all.join("; ")} }`)
      }
    }
  }
  return changes
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

  // Helper: generate stable ids for nested objects (locații / persoaneContact) – backward compatible
  const genId = () => `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const ensureLocatiiIds = (locs?: any[]) => {
    if (!Array.isArray(locs)) return locs
    return locs.map((l: any) => {
      const next = { ...(l || {}) }
      if (!next.id) next.id = genId()
      if (Array.isArray(next.persoaneContact)) {
        next.persoaneContact = next.persoaneContact.map((p: any) => {
          const pp = { ...(p || {}) }
          if (!pp.id) pp.id = genId()
          return pp
        })
      }
      // Echipamente: asigurăm id stabil pentru fiecare echipament din locație (backward compatible)
      if (Array.isArray(next.echipamente)) {
        next.echipamente = next.echipamente.map((e: any) => {
          const ee = { ...(e || {}) }
          if (!ee.id) ee.id = genId()
          return ee
        })
      }
      return next
    })
  }

  // Pre-normalizăm structuri nested: nu rupe clienții vechi; doar completează id-uri lipsă.
  ;(client as any).locatii = ensureLocatiiIds((client as any).locatii)

  client.createdAt = serverTimestamp() as Timestamp
  client.updatedAt = serverTimestamp() as Timestamp

  // Stocăm și `id` în document (egal cu doc id) pentru interconectări mai ușoare.
  // Folosim setDoc pe doc precreat ca să evităm o scriere suplimentară.
  const { doc, setDoc } = await import("firebase/firestore")
  const docRef = doc(clientsCollection)
  ;(client as any).id = docRef.id
  await setDoc(docRef, client as any)
  // Log non‑blocking
  void addUserLogEntry({
    actiune: "Creare client",
    detalii: `ID: ${docRef.id}; nume: ${client.nume}; email: ${client.email || '-'}`,
    tip: "Informație",
    categorie: "Clienți",
  })
  return {
    id: docRef.id,
    ...client,
  }
}

// Update a client
export const updateClient = async (id: string, client: Partial<Client>) => {
  const clientDoc = doc(db, "clienti", id)
  // Citim datele vechi pentru a construi dif-ul (best-effort)
  let oldData: any = null
  try {
    const snap = await getDoc(clientDoc)
    if (snap.exists()) oldData = { id: snap.id, ...snap.data() }
  } catch (e) {
    console.warn("Nu s-au putut obține datele vechi ale clientului pentru log dif:", e)
  }

  // Helper: generate stable ids for nested objects (locații / persoaneContact) – backward compatible
  const genId = () => `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
  const ensureLocatiiIds = (locs?: any[]) => {
    if (!Array.isArray(locs)) return locs
    return locs.map((l: any) => {
      const next = { ...(l || {}) }
      if (!next.id) next.id = genId()
      if (Array.isArray(next.persoaneContact)) {
        next.persoaneContact = next.persoaneContact.map((p: any) => {
          const pp = { ...(p || {}) }
          if (!pp.id) pp.id = genId()
          return pp
        })
      }
      // Echipamente: asigurăm id stabil pentru fiecare echipament din locație (backward compatible)
      if (Array.isArray(next.echipamente)) {
        next.echipamente = next.echipamente.map((e: any) => {
          const ee = { ...(e || {}) }
          if (!ee.id) ee.id = genId()
          return ee
        })
      }
      return next
    })
  }

  // Dacă se editează locațiile, completăm id-uri lipsă înainte de update.
  if ("locatii" in (client as any)) {
    ;(client as any).locatii = ensureLocatiiIds((client as any).locatii)
  }
  // Dacă NU se trimit locațiile în payload, dar în DB există locații fără id-uri,
  // facem backfill automat la orice editare (chiar și când se schimbă doar nume/email).
  if (!("locatii" in (client as any)) && Array.isArray(oldData?.locatii)) {
    const needsBackfill = (oldData.locatii as any[]).some((l: any) => {
      if (!l?.id) return true
      const pcs = Array.isArray(l?.persoaneContact) ? l.persoaneContact : []
      if (pcs.some((p: any) => !p?.id)) return true
      const eqs = Array.isArray(l?.echipamente) ? l.echipamente : []
      if (eqs.some((e: any) => !e?.id)) return true
      return false
    })
    if (needsBackfill) {
      ;(client as any).locatii = ensureLocatiiIds(oldData.locatii)
    }
  }
  // Asigurăm că documentul are și câmp `id` (doar dacă nu e deja setat)
  ;(client as any).id = (client as any).id ?? id

  client.updatedAt = serverTimestamp() as Timestamp
  await updateDoc(clientDoc, client as DocumentData)

  // Log dif non‑blocking
  try {
    if (oldData) {
      const changedFields: string[] = []
      const whitelist: Array<keyof Client> = [
        "nume",
        "adresa",
        "email",
        "telefon" as any,
        "reprezentantFirma" as any,
        "functieReprezentant" as any,
        "cui" as any,
        "regCom" as any,
        "contBancar" as any,
        "banca" as any,
        "locatii" as any,
      ]
      whitelist.forEach((key) => {
        if (key in client) {
          const oldVal = (oldData as any)[key]
          const newVal = (client as any)[key]
          if (key === "locatii") {
            const locChanges = diffLocatii(oldVal || [], newVal || [])
            if (locChanges.length) changedFields.push(...locChanges)
          } else {
            const oldStr = valueToComparableString(oldVal)
            const newStr = valueToComparableString(newVal)
            if (oldStr !== newStr) {
              changedFields.push(`${String(key)}: "${oldStr}" → "${newStr}"`)
            }
          }
        }
      })
      const detalii = changedFields.length ? changedFields.join("; ") : "Actualizare fără câmpuri esențiale modificate"
      void addUserLogEntry({
        actiune: "Actualizare client",
        detalii: `ID: ${id}; ${detalii}`,
        tip: "Informație",
        categorie: "Clienți",
      })
    } else {
      void addUserLogEntry({
        actiune: "Actualizare client",
        detalii: `ID: ${id}; (detalii neidentificate)`,
        tip: "Informație",
        categorie: "Clienți",
      })
    }
  } catch (e) {
    console.warn("Log update client failed (non-blocking):", e)
  }
  return {
    id,
    ...client,
  }
}

// Delete a client
export const deleteClient = async (id: string) => {
  const clientDoc = doc(db, "clienti", id)
  let oldName: string | undefined
  try {
    const snap = await getDoc(clientDoc)
    if (snap.exists()) oldName = (snap.data() as any)?.nume
  } catch {}
  await deleteDoc(clientDoc)
  // Log non‑blocking
  void addUserLogEntry({
    actiune: "Ștergere client",
    detalii: `ID: ${id}${oldName ? `; nume: ${oldName}` : ""}`,
    tip: "Avertisment",
    categorie: "Clienți",
  })
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
  // Best-effort: derive stable IDs from clientInfo snapshot if present (backward compatible)
  try {
    const ci: any = (lucrare as any)?.clientInfo
    if (!lucrare.clientId && ci?.id) lucrare.clientId = String(ci.id)
    if (!lucrare.locationId && (ci?.locationId || ci?.locatieId)) lucrare.locationId = String(ci.locationId || ci.locatieId)
    if (!lucrare.locationName && ci?.locationName) lucrare.locationName = String(ci.locationName)
    if (!lucrare.persoanaContactEmail && (ci?.locationEmail || ci?.contactEmail || ci?.email)) {
      lucrare.persoanaContactEmail = String(ci.locationEmail || ci.contactEmail || ci.email)
    }
  } catch {
    // non-blocking
  }
  lucrare.createdAt = serverTimestamp() as Timestamp
  lucrare.updatedAt = serverTimestamp() as Timestamp
  const docRef = await addDoc(lucrariCollection, lucrare)
  // Log non‑blocking cu date complete
  void addUserLogEntry({
    utilizator: (lucrare as any).createdByName || (lucrare as any).createdBy || "Sistem",
    utilizatorId: (lucrare as any).createdBy || "system",
    actiune: "Creare lucrare",
    detalii: `ID: ${docRef.id}; client: ${lucrare.client}; tip: ${lucrare.tipLucrare}; dataInterventie: ${lucrare.dataInterventie || '-'}`,
    tip: "Informație",
    categorie: "Lucrări",
    lucrareId: docRef.id,
    nrLucrare: (lucrare as any).nrLucrare,
    lucrareTitlu: getLucrareTitle({ ...lucrare, id: docRef.id }),
    client: (lucrare as any).client,
    locatie: (lucrare as any).locatie,
    entityType: "Lucrare",
    entityId: docRef.id,
    actionOutcome: "success",
    after: {
      tipLucrare: lucrare.tipLucrare,
      statusLucrare: lucrare.statusLucrare,
      statusFacturare: lucrare.statusFacturare,
      tehnicieni: lucrare.tehnicieni,
      dataInterventie: lucrare.dataInterventie,
      client: lucrare.client,
      locatie: lucrare.locatie,
    },
  })
  return {
    id: docRef.id,
    ...lucrare,
  }
}

// Update a work order
export const updateLucrare = async (
  id: string, 
  lucrare: Partial<Lucrare>, 
  modifiedBy?: string, 
  modifiedByName?: string,
  silent?: boolean // Nou parametru pentru actualizări silentioase (ex: marcare ca citită)
) => {
  const lucrareDoc = doc(db, "lucrari", id)
  
  // Obținem datele vechi pentru tracking modificări
  let oldLucrareData = null
  try {
    const oldDoc = await getDoc(lucrareDoc)
    if (oldDoc.exists()) {
      oldLucrareData = { id: oldDoc.id, ...oldDoc.data() }
    }
  } catch (error) {
    console.warn("Nu s-au putut obține datele vechi (log dif optional):", error)
  }
  
  // Pentru actualizări silentioase (ex: marcare ca citită), nu actualizăm updatedAt și nu resetăm notificările
  if (!silent) {
    // Actualizăm lucrarea și resetăm notification status pentru a crea notificare nouă
    lucrare.updatedAt = serverTimestamp() as Timestamp
    
    // IMPORTANT: Resetăm notification status la fiecare modificare
    // Astfel lucrarea va apărea ca notificare nouă pentru toți utilizatorii
    lucrare.notificationRead = false
    lucrare.notificationReadBy = [] // Resetăm lista utilizatorilor care au citit
  }
  
  await updateDoc(lucrareDoc, lucrare as DocumentData)
  
  // Trackingul modificărilor (dacă avem informații despre utilizator și nu e actualizare silentioasă)
  if (oldLucrareData && modifiedBy && modifiedByName && !silent) {
    const newLucrareData = { ...oldLucrareData, ...lucrare }
    try {
      await trackLucrareUpdate(id, oldLucrareData, newLucrareData, modifiedBy, modifiedByName)
    } catch (error) {
      console.warn("Eroare la tracking modificări:", error)
      // Nu aruncăm eroarea pentru a nu bloca update-ul principal
    }
  }

  // Logăm dif-urile principale (non‑blocking, fără a afecta fluxul)
  if (oldLucrareData) {
    try {
      const changedFields: string[] = []
      const whitelist: Array<keyof Lucrare> = [
        "statusLucrare",
        "statusFacturare",
        "motivNefacturare",
        "statusOferta",
        "dataInterventie",
        "tehnicieni",
        "preluatDispecer",
        "archivedAt" as any,
        "lucrareOriginala",
        "numarRaport",
        "nrLucrare",
        "timpSosire",
        "timpPlecare",
        "durataInterventie",
      ]
      whitelist.forEach((key) => {
        if (key in lucrare) {
          const oldVal = (oldLucrareData as any)[key]
          const newVal = (lucrare as any)[key]
          if (key === "tehnicieni") {
            const diff = diffArrays(oldVal || [], newVal || [])
            if (diff) changedFields.push(`tehnicieni: ${diff}`)
          } else {
            const oldStr = valueToComparableString(oldVal)
            const newStr = valueToComparableString(newVal)
            if (oldStr !== newStr) {
              changedFields.push(`${String(key)}: "${oldStr}" → "${newStr}"`)
            }
          }
        }
      })

      const utilizator = modifiedByName || "Sistem"
      const utilizatorId = modifiedBy || "system"
      const detalii = changedFields.length ? changedFields.join("; ") : "Actualizare fără câmpuri esențiale modificate"
      
      // Build before/after for critical fields
      const before: any = {}
      const after: any = {}
      whitelist.forEach((key) => {
        if (key in lucrare) {
          before[String(key)] = (oldLucrareData as any)[key]
          after[String(key)] = (lucrare as any)[key]
        }
      })
      
      void addUserLogEntry({
        utilizator,
        utilizatorId,
        actiune: "Actualizare lucrare",
        detalii,
        tip: "Informație",
        categorie: "Lucrări",
        lucrareId: id,
        nrLucrare: (lucrare as any)?.nrLucrare ?? (oldLucrareData as any)?.nrLucrare,
        lucrareTitlu: getLucrareTitle({ ...(oldLucrareData as any), ...lucrare, id }),
        client: (lucrare as any)?.client ?? (oldLucrareData as any)?.client,
        locatie: (lucrare as any)?.locatie ?? (oldLucrareData as any)?.locatie,
        entityType: "Lucrare",
        entityId: id,
        actionOutcome: "success",
        before: Object.keys(before).length > 0 ? before : undefined,
        after: Object.keys(after).length > 0 ? after : undefined,
      })
    } catch (e) {
      console.warn("Log diff failed (non-blocking):", e)
    }
  }
  
  return {
    id,
    ...lucrare,
  }
}

// Delete a work order
export const deleteLucrare = async (id: string) => {
  const lucrareDoc = doc(db, "lucrari", id)
  // Încearcă să citești date minime pentru context în log
  let oldData: any = null
  try {
    const snap = await getDoc(lucrareDoc)
    if (snap.exists()) oldData = { id: snap.id, ...snap.data() }
  } catch {
    // ignore
  }
  await deleteDoc(lucrareDoc)
  // Log non‑blocking cu date complete
  void addUserLogEntry({
    utilizator: "Sistem",
    utilizatorId: "system",
    actiune: "Ștergere lucrare",
    detalii: `ID: ${id}`,
    tip: "Avertisment",
    categorie: "Lucrări",
    lucrareId: id,
    nrLucrare: oldData?.nrLucrare,
    lucrareTitlu: oldData ? getLucrareTitle(oldData) : undefined,
    client: oldData?.client,
    locatie: oldData?.locatie,
    entityType: "Lucrare",
    entityId: id,
    actionOutcome: "success",
    before: oldData ? {
      tipLucrare: oldData.tipLucrare,
      statusLucrare: oldData.statusLucrare,
      statusFacturare: oldData.statusFacturare,
      client: oldData.client,
      locatie: oldData.locatie,
      tehnicieni: oldData.tehnicieni,
    } : undefined,
  })
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

/**
 * Șterge loguri cu timestamp <= cutoffDate, în batch-uri, returnând numărul șters.
 * Atenție: Operațiune potențial costisitoare - folosiți perioade rezonabile.
 */
export const deleteLogsBefore = async (cutoffDate: Date): Promise<number> => {
  let totalDeleted = 0
  const logsCollection = collection(db, "logs")
  let lastDocRef: any = null
  const pageSize = 300

  while (true) {
    const qParts: any[] = [
      where("timestamp", "<=", cutoffDate),
      orderBy("timestamp", "asc"),
      limit(pageSize),
    ]
    if (lastDocRef) {
      qParts.push(startAfter(lastDocRef))
    }
    const q = query(logsCollection, ...qParts)
    const snapshot = await getDocs(q)
    if (snapshot.empty) break

    const batch = writeBatch(db)
    snapshot.docs.forEach((d) => {
      batch.delete(d.ref)
    })
    await batch.commit()

    totalDeleted += snapshot.docs.length
    lastDocRef = snapshot.docs[snapshot.docs.length - 1]

    // Dacă am luat mai puțin decât pageSize, probabil am terminat
    if (snapshot.docs.length < pageSize) break
  }
  return totalDeleted
}

/**
 * Șterge loguri specifice după ID-uri, în batch-uri.
 * Returnează numărul de loguri șterse efectiv.
 */
export const deleteLogsByIds = async (logIds: string[]): Promise<number> => {
  if (logIds.length === 0) return 0
  
  const logsCollection = collection(db, "logs")
  const batchSize = 500 // Firestore allows max 500 operations per batch
  let totalDeleted = 0

  // Split into chunks of batchSize
  for (let i = 0; i < logIds.length; i += batchSize) {
    const chunk = logIds.slice(i, i + batchSize)
    const batch = writeBatch(db)
    
    chunk.forEach((id) => {
      const docRef = doc(logsCollection, id)
      batch.delete(docRef)
    })
    
    await batch.commit()
    totalDeleted += chunk.length
  }
  
  return totalDeleted
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

/**
 * Funcții pentru gestionarea numerotării centralizate a rapoartelor
 */

/**
 * Obține următorul număr de raport și îl incrementează automat
 * @returns Promise<string> - Numărul raportului în format #000001
 */
export async function getNextReportNumber(): Promise<string> {
  console.log("🔢 getNextReportNumber: PORNIRE funcție de numerotare centralizată")
  
  const { doc, getDoc, updateDoc, runTransaction } = await import("firebase/firestore")
  
  const reportNumberRef = doc(db, "numarRaport", "document-numar-raport")
  
  try {
    console.log("🔢 getNextReportNumber: Încep tranzacția Firestore")
    // Folosim o tranzacție pentru a asigura atomicitatea operației
    const result = await runTransaction(db, async (transaction) => {
      const reportNumberDoc = await transaction.get(reportNumberRef)
      
      if (!reportNumberDoc.exists()) {
        // Dacă documentul nu există, îl creăm cu valoarea 1
        console.log("🔢 getNextReportNumber: Document nu există, creez cu valoarea 1")
        transaction.set(reportNumberRef, { numarRaport: 1 })
        return 1
      }
      
      const currentNumber = reportNumberDoc.data().numarRaport || 1
      const nextNumber = currentNumber + 1
      
      console.log("🔢 getNextReportNumber: Document există, numărul curent:", currentNumber)
      console.log("🔢 getNextReportNumber: Incrementez la:", nextNumber)
      
      // Incrementăm numărul în baza de date
      transaction.update(reportNumberRef, { numarRaport: nextNumber })
      
      // Returnăm numărul curent (care va fi folosit pentru acest raport)
      console.log("🔢 getNextReportNumber: Returnez numărul pentru acest raport:", currentNumber)
      return currentNumber
    })
    
    // Formatăm numărul cu 6 cifre
    const formattedNumber = `#${result.toString().padStart(6, '0')}`
    console.log("🔢 getNextReportNumber: SUCCESS - număr formatat:", formattedNumber)
    return formattedNumber
  } catch (error) {
    console.error("Eroare la obținerea numărului de raport:", error)
    // Fallback: folosim timestamp ca număr unic
    const fallbackNumber = Date.now().toString().slice(-6)
    return `#${fallbackNumber}`
  }
}

/**
 * Obține numărul curent de raport fără a-l incrementa
 * @returns Promise<number> - Numărul curent din baza de date
 */
export async function getCurrentReportNumber(): Promise<number> {
  const { doc, getDoc } = await import("firebase/firestore")
  
  const reportNumberRef = doc(db, "numarRaport", "document-numar-raport")
  
  try {
    const reportNumberDoc = await getDoc(reportNumberRef)
    
    if (!reportNumberDoc.exists()) {
      return 1 // Valoarea implicită
    }
    
    return reportNumberDoc.data().numarRaport || 1
  } catch (error) {
    console.error("Eroare la citirea numărului de raport:", error)
    return 1
  }
}

/**
 * Actualizează numărul curent de raport (pentru admin)
 * @param newNumber - Noul număr de start
 * @returns Promise<void>
 */
export async function updateReportNumber(newNumber: number): Promise<void> {
  const { doc, setDoc } = await import("firebase/firestore")
  
  const reportNumberRef = doc(db, "numarRaport", "document-numar-raport")
  
  try {
    await setDoc(reportNumberRef, { numarRaport: newNumber }, { merge: true })
    console.log("Numărul de raport actualizat la:", newNumber)
  } catch (error) {
    console.error("Eroare la actualizarea numărului de raport:", error)
    throw error
  }
}
