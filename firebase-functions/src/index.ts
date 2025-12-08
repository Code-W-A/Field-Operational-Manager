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

async function fetchClient(clientId?: string): Promise<{ name?: string; data?: Client }> {
  if (!clientId) return {}
  try {
    const snap = await db.collection("clienti").doc(clientId).get()
    if (snap.exists) {
      const data = snap.data() as Client
      return { name: data?.nume, data }
    }
  } catch (e) {
    console.error("fetchClient error", clientId, e)
  }
  return {}
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

async function getNextReportNumberAdmin(): Promise<string> {
  const ref = db.collection("numarRaport").doc("document-numar-raport")
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        tx.set(ref, { numarRaport: 2 })
        return 1
      }
      const current = (snap.data() as any)?.numarRaport || 1
      const next = current + 1
      tx.update(ref, { numarRaport: next })
      return current
    })
    return `#${result.toString().padStart(6, "0")}`
  } catch (e) {
    console.error("getNextReportNumberAdmin error", e)
    return `#${Date.now().toString().slice(-6)}`
  }
}

function createWorkPayload(params: {
  contract: Contract
  clientName?: string
  clientInfo?: Client
  locationId?: string
  locationName?: string
  scheduledDate: Date
  nrLucrare: string
  equipmentIds?: string[]
}): Record<string, any> {
  const nowIso = toIsoDate(new Date())
  const scheduledIso = toIsoDate(params.scheduledDate)
  const equipmentIds =
    (Array.isArray(params.equipmentIds) ? params.equipmentIds : undefined) ??
    (Array.isArray(params.contract.equipmentIds) ? params.contract.equipmentIds : [])
  const contactName =
    (params.clientInfo as any)?.contact ||
    (params.clientInfo as any)?.persoanaContact ||
    (params.clientInfo as any)?.contactPerson ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.nume ||
    ""
  const contactPhone =
    (params.clientInfo as any)?.telefon ||
    (params.clientInfo as any)?.phone ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.telefon ||
    (params.clientInfo as any)?.persoaneContact?.[0]?.phone ||
    ""

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
    statusLucrare: "Listată",
    statusFacturare: "Nefacturat",
    client: params.clientName || params.contract.clientId || "Client",
    clientId: params.contract.clientId || null,
    clientInfo: params.clientInfo || null,
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
    persoanaContact: contactName,
    telefon: contactPhone,
    contact: contactName,
    equipmentIds,
    revision,
    echipamentId: "",
    echipamentCod: "",
    descriere: "Revizie programată automat",
    defectReclamat: "",
    necesitaOferta: false,
    statusOferta: "NU",
    nrLucrare: params.nrLucrare,
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
  .pubsub.schedule("*/5 * * * *") // la fiecare 5 minute (pentru test)
  .timeZone(TIMEZONE)
  .onRun(async () => {
    const now = new Date()
    const contractsSnap = await db.collection("contracts").get()
    const contracts: Contract[] = contractsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

    let created = 0

    for (const contract of contracts) {
      if (!contract.revisionSchedulePreview || !Array.isArray(contract.revisionSchedulePreview)) continue

      const clientPayload = await fetchClient(contract.clientId)
      const locationEquipments = new Map<string, string[]>()
      const locs = (clientPayload.data as any)?.locatii
      if (Array.isArray(locs)) {
        for (const loc of locs) {
          const locName = loc?.nume
          if (!locName) continue
          const eqIds = Array.isArray(loc?.echipamente)
            ? loc.echipamente
                .map((eq: any) => eq?.id)
                .filter((id: any) => typeof id === "string" && id.length > 0)
            : []
          if (eqIds.length) {
            locationEquipments.set(locName, eqIds)
          }
        }
      }

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

        const nrLucrare = await getNextReportNumberAdmin()
        const payload = createWorkPayload({
          contract,
          clientName: clientPayload.name,
          clientInfo: clientPayload.data,
          locationId: entry.locationId,
          locationName: entry.locationName,
          scheduledDate: entry.scheduledAt,
          nrLucrare,
          equipmentIds: locationEquipments.get(entry.locationName || "") || undefined,
        })
        await db.collection("lucrari").add(payload)
        created += 1
      }
    }

    console.log("generateRevisionWorksCron completed", { created })
    return null
  })

