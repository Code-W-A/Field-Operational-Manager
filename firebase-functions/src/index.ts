import * as functions from "firebase-functions"
import { initializeApp } from "firebase-admin/app"
import { getFirestore, Timestamp } from "firebase-admin/firestore"

// Initialize the default Firebase app for Admin SDK
initializeApp()

const db = getFirestore()
const REGION = "europe-west1"
const TIMEZONE = "Europe/Bucharest"
const MAX_WORKS_PER_RUN = 200

type Contract = {
  id: string
  name: string
  number?: string
  clientId?: string
  locationId?: string
  locationName?: string
  locationIds?: string[]
  locationNames?: string[]
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: "zile" | "luni"
  daysBeforeWork?: number
  lastAutoWorkGenerated?: string
}

type Client = {
  id: string
  nume?: string
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toIsoDate(date: Date): string {
  return date.toISOString()
}

async function fetchClientName(clientId?: string): Promise<string | undefined> {
  if (!clientId) return undefined
  try {
    const snap = await db.collection("clienti").doc(clientId).get()
    if (snap.exists) {
      const data = snap.data() as Client
      return data?.nume || undefined
    }
  } catch (e) {
    console.error("fetchClientName error", clientId, e)
  }
  return undefined
}

async function workExists(contractId: string, locationId: string | undefined, scheduledIso: string) {
  let q = db.collection("lucrari")
    .where("contract", "==", contractId)
    .where("dataInterventie", "==", scheduledIso)

  if (locationId) {
    q = q.where("locationId", "==", locationId)
  }

  const snap = await q.limit(1).get()
  return !snap.empty
}

function computeNextOccurrence(contract: Contract, now: Date): Date | null {
  if (!contract.startDate || !contract.recurrenceInterval || !contract.recurrenceUnit) return null
  const start = new Date(contract.startDate)
  if (Number.isNaN(start.getTime())) return null

  let occ = start
  const interval = Math.max(1, contract.recurrenceInterval)
  const maxLoops = 1000
  let loops = 0
  while (occ < now && loops < maxLoops) {
    if (contract.recurrenceUnit === "luni") {
      occ = addMonths(occ, interval)
    } else {
      occ = addDays(occ, interval)
    }
    loops++
  }
  return occ
}

function createWorkPayload(params: {
  contract: Contract
  clientName?: string
  locationId?: string
  locationName?: string
  scheduledDate: Date
}): Record<string, any> {
  const nowIso = toIsoDate(new Date())
  const scheduledIso = toIsoDate(params.scheduledDate)
  return {
    tipLucrare: "Revizie",
    statusLucrare: "Listată",
    statusFacturare: "Nefacturat",
    client: params.clientName || "Client",
    clientId: params.contract.clientId || null,
    locatie: params.locationName || "",
    locationId: params.locationId || null,
    locationName: params.locationName || null,
    contract: params.contract.id,
    contractNumber: params.contract.number || "",
    dataEmiterii: nowIso,
    dataInterventie: scheduledIso,
    tehnicieni: [] as string[],
    persoaneContact: [],
    equipmentIds: [],
    echipamentId: "",
    echipamentCod: "",
    descriere: "Revizie programată automat",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: "system",
    createdByName: "CRON Revizie",
    notificationRead: false,
    notificationReadBy: [],
    raportGenerat: false,
    necesitaOferta: false,
    preluatDispecer: false,
    preluatDe: "",
    statusEchipament: "",
    defectReclamat: "",
  }
}

export const generateRevisionWorksCron = functions
  .region(REGION)
  .pubsub.schedule("0 6 * * *") // 06:00 local
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const now = new Date()
    const contractsSnap = await db.collection("contracts").get()

    const contracts: Contract[] = contractsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
    let created = 0

    for (const contract of contracts) {
      if (!contract.startDate || !contract.recurrenceInterval || !contract.recurrenceUnit) continue

      const next = computeNextOccurrence(contract, now)
      if (!next) continue

      const lead = contract.daysBeforeWork ?? 0
      const createFrom = addDays(next, -lead)
      if (now < createFrom) continue

      const clientName = await fetchClientName(contract.clientId)
      const locIds = contract.locationIds || []
      const locNames = contract.locationNames || []

      const pairs = locIds.length
        ? locIds.map((id, idx) => ({ id, name: locNames[idx] }))
        : [{ id: contract.locationId || "", name: contract.locationName || "" }]

      for (const pair of pairs) {
        if (created >= MAX_WORKS_PER_RUN) {
          console.warn("Cron limit reached, skipping remaining.")
          return null
        }
        const scheduledIso = toIsoDate(next)
        const exists = await workExists(contract.id, pair.id, scheduledIso)
        if (exists) continue

        const payload = createWorkPayload({
          contract,
          clientName,
          locationId: pair.id,
          locationName: pair.name,
          scheduledDate: next,
        })
        await db.collection("lucrari").add(payload)
        created += 1
      }
    }

    console.log("generateRevisionWorksCron completed", { created })
    return null
  })

