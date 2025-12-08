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
  type?: string
  clientId?: string
  locationId?: string
  locationName?: string
  locationIds?: string[]
  locationNames?: string[]
  equipmentIds?: string[]
  startDate?: string
  recurrenceInterval?: number
  recurrenceUnit?: "zile" | "luni"
  daysBeforeWork?: number
  lastAutoWorkGenerated?: string
  revisionSchedulePreview?: RevisionPreview[]
}

type Client = {
  id: string
  nume?: string
}

type RevisionPreview = {
  scheduledIso?: string
  scheduledAt?: any
  generateIso?: string
  generateAt?: any
  locationId?: string
  locationName?: string
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

function createWorkPayload(params: {
  contract: Contract
  clientName?: string
  locationId?: string
  locationName?: string
  scheduledDate: Date
}): Record<string, any> {
  const nowIso = toIsoDate(new Date())
  const scheduledIso = toIsoDate(params.scheduledDate)
  const equipmentIds = Array.isArray(params.contract.equipmentIds) ? params.contract.equipmentIds : []

  // Metadata revizie: toate echipamentele sunt setate pe "pending"
  const revision = {
    checklistVersionId: "auto", // fallback; se poate sincroniza ulterior la primul checklist
    equipmentStatus: equipmentIds.reduce<Record<string, "pending">>((acc, id) => {
      acc[id] = "pending"
      return acc
    }, {}),
    doneCount: 0,
  }

  return {
    tipLucrare: "Revizie",
    statusLucrare: "În așteptare",
    statusFacturare: "Nefacturat",
    client: params.clientName || "Client",
    clientId: params.contract.clientId || null,
    locatie: params.locationName || "",
    locationId: params.locationId || null,
    locationName: params.locationName || null,
    contract: params.contract.id,
    contractNumber: params.contract.number || "",
    contractType: params.contract.type || "",
    dataEmiterii: nowIso,
    dataInterventie: scheduledIso,
    tehnicieni: [] as string[],
    persoaneContact: [],
    equipmentIds,
    revision,
    echipamentId: "",
    echipamentCod: "",
    descriere: "Revizie programată automat",
    defectReclamat: "",
    necesitaOferta: false,
    statusOferta: "NU",
    nrLucrare: `#AUTO-${Date.now().toString().slice(-6)}`,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    createdBy: "system",
    createdByName: "CRON Revizie",
    notificationRead: false,
    notificationReadBy: [],
    raportGenerat: false,
    preluatDispecer: false,
    preluatDe: "",
    statusEchipament: "",
  }
}

export const generateRevisionWorksCron = functions
  .region(REGION)
  .pubsub.schedule("0 7,13 * * *") // 07:00 și 13:00 local time
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const now = new Date()
    const contractsSnap = await db.collection("contracts").get()
    const contracts: Contract[] = contractsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

    let created = 0

    for (const contract of contracts) {
      if (!contract.revisionSchedulePreview || !Array.isArray(contract.revisionSchedulePreview)) continue

      // Normalize and sort by generate date
      const entries: { generateAt: Date; scheduledAt: Date; locationId?: string; locationName?: string }[] = []
      for (const raw of contract.revisionSchedulePreview) {
        const genRaw = (raw as any).generateAt?.toDate?.() ?? (raw as any).generateIso ?? (raw as any).generateDate
        const schedRaw = (raw as any).scheduledAt?.toDate?.() ?? (raw as any).scheduledIso ?? (raw as any).scheduledDate
        const gen = genRaw ? new Date(genRaw) : null
        const sched = schedRaw ? new Date(schedRaw) : null
        if (!gen || Number.isNaN(gen.getTime()) || !sched || Number.isNaN(sched.getTime())) continue
        entries.push({
          generateAt: gen,
          scheduledAt: sched,
          locationId: (raw as any).locationId,
          locationName: (raw as any).locationName,
        })
      }

      entries.sort((a, b) => a.generateAt.getTime() - b.generateAt.getTime())

      for (const entry of entries) {
        if (created >= MAX_WORKS_PER_RUN) {
          console.warn("Cron limit reached, skipping remaining.")
          return null
        }
        if (entry.generateAt > now) {
          // Entries are sorted; future ones can be skipped for this run
          break
        }

        const scheduledIso = toIsoDate(entry.scheduledAt)
        const exists = await workExists(contract.id, entry.locationId, scheduledIso)
        if (exists) continue

        const clientName = await fetchClientName(contract.clientId)
        const payload = createWorkPayload({
          contract,
          clientName,
          locationId: entry.locationId,
          locationName: entry.locationName,
          scheduledDate: entry.scheduledAt,
        })
        await db.collection("lucrari").add(payload)
        created += 1
      }
    }

    console.log("generateRevisionWorksCron completed", { created })
    return null
  })

