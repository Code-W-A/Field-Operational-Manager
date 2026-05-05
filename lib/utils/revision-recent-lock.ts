import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { WORK_STATUS } from "@/lib/utils/constants"

export const RECENT_REVISION_BLOCK_DAYS = 30

export type RevisionEquipmentRef = {
  id: string
  cod?: string
  name?: string
}

export type RecentRevisionHit = {
  equipmentId: string
  matchedKey: string
  workId: string
  nrDisplay: string
  date: Date
  dateLabel: string
  statusLucrare?: string
}

const normalize = (value: unknown) => String(value ?? "").trim()

const toDate = (value: any): Date | null => {
  if (!value) return null
  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
    if (typeof value?.toDate === "function") {
      const d = value.toDate()
      return Number.isNaN(d.getTime()) ? null : d
    }
    if (typeof value?.seconds === "number") {
      const d = new Date(value.seconds * 1000)
      return Number.isNaN(d.getTime()) ? null : d
    }
    if (typeof value === "number") {
      const d = new Date(value)
      return Number.isNaN(d.getTime()) ? null : d
    }

    const raw = String(value || "").trim()
    if (!raw) return null

    const direct = new Date(raw)
    if (!Number.isNaN(direct.getTime())) return direct

    const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
    if (match) {
      const day = Number(match[1])
      const month = Number(match[2]) - 1
      const year = Number(match[3])
      const hour = Number(match[4] || 0)
      const minute = Number(match[5] || 0)
      const d = new Date(year, month, day, hour, minute)
      return Number.isNaN(d.getTime()) ? null : d
    }
  } catch {
    return null
  }
  return null
}

const formatDateRo = (date: Date) => {
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yyyy = date.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

const getWorkRevisionDate = (work: any): Date | null => {
  const candidates = [
    work?.dataInterventie,
    work?.raportSnapshot?.dataGenerare,
    work?.timpPlecare,
    work?.updatedAt,
    work?.createdAt,
  ]
  for (const candidate of candidates) {
    const d = toDate(candidate)
    if (d) return d
  }
  return null
}

const getEquipmentRevisionDate = (work: any, key: string): Date | null => {
  const times = work?.revisionEquipmentTimes
  const equipmentTime = times && typeof times === "object" ? times[key] : null
  const candidates = [
    equipmentTime?.endIso,
    equipmentTime?.startIso,
    work?.raportSnapshot?.dataGenerare,
    work?.timpPlecare,
    work?.dataInterventie,
    work?.updatedAt,
    work?.createdAt,
  ]
  for (const candidate of candidates) {
    const d = toDate(candidate)
    if (d) return d
  }
  return getWorkRevisionDate(work)
}

const isCompletedRevisionForKey = (work: any, key: string): boolean => {
  const statusByEquipment = work?.revision?.equipmentStatus
  if (statusByEquipment && typeof statusByEquipment === "object") {
    const status = String(statusByEquipment[key] || "").toLowerCase()
    if (status === "done") return true
  }

  const status = String(work?.statusLucrare || "").toLowerCase()
  return (
    status === WORK_STATUS.COMPLETED.toLowerCase() ||
    status === WORK_STATUS.ARCHIVED.toLowerCase() ||
    Boolean(work?.raportGenerat)
  )
}

const firstDateForKeys = (work: any, keys: string[]): Date | null => {
  for (const key of keys) {
    const d = getEquipmentRevisionDate(work, key)
    if (d) return d
  }
  return null
}

const isCompletedRevisionForAnyKey = (work: any, keys: string[]): boolean => {
  return keys.some((key) => isCompletedRevisionForKey(work, key))
}

const chunk = <T,>(items: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export async function findRecentCompletedRevisionHits(params: {
  equipmentRefs: RevisionEquipmentRef[]
  clientId?: string
  clientName?: string
  locationId?: string
  locationName?: string
  excludeWorkId?: string
  days?: number
}): Promise<Record<string, RecentRevisionHit>> {
  const refs = params.equipmentRefs
    .map((ref) => ({
      id: normalize(ref.id),
      cod: normalize(ref.cod),
      name: normalize(ref.name),
    }))
    .filter((ref) => ref.id)

  if (refs.length === 0) return {}

  const refByKey = new Map<string, RevisionEquipmentRef>()
  for (const ref of refs) {
    refByKey.set(ref.id, ref)
    if (ref.cod) refByKey.set(ref.cod, ref)
  }

  const queryKeys = Array.from(refByKey.keys()).filter(Boolean)
  if (queryKeys.length === 0) return {}

  const now = new Date()
  const windowMs = (params.days ?? RECENT_REVISION_BLOCK_DAYS) * 24 * 60 * 60 * 1000
  const cutoff = new Date(now.getTime() - windowMs)
  const hits: Record<string, RecentRevisionHit> = {}
  const seenWorkIds = new Set<string>()

  for (const keys of chunk(queryKeys, 10)) {
    const snap = await getDocs(query(collection(db, "lucrari"), where("equipmentIds", "array-contains-any", keys)))
    for (const docSnap of snap.docs) {
      const work: any = { id: docSnap.id, ...docSnap.data() }
      if (params.excludeWorkId && String(work.id) === String(params.excludeWorkId)) continue
      if (seenWorkIds.has(work.id)) continue
      seenWorkIds.add(work.id)

      if (String(work?.tipLucrare || "").toLowerCase() !== "revizie") continue

      const workClientId = normalize(work?.clientId || work?.clientInfo?.id)
      const workClientName = normalize(work?.client)
      if (params.clientId && workClientId && workClientId !== normalize(params.clientId)) continue
      if (!params.clientId && params.clientName && workClientName && workClientName !== normalize(params.clientName)) continue

      const workLocationId = normalize(work?.locationId || work?.clientInfo?.locationId || work?.clientInfo?.locatieId)
      const workLocationName = normalize(work?.locatie || work?.locationName)
      if (params.locationId && workLocationId && workLocationId !== normalize(params.locationId)) continue
      if (!params.locationId && params.locationName && workLocationName && workLocationName !== normalize(params.locationName)) continue

      const workEquipmentIds = Array.isArray(work?.equipmentIds)
        ? work.equipmentIds.map((id: any) => normalize(id)).filter(Boolean)
        : []
      if (workEquipmentIds.length === 0) continue

      for (const key of workEquipmentIds) {
        const ref = refByKey.get(key)
        if (!ref?.id) continue
        const matchKeys = Array.from(new Set([key, normalize(ref.id), normalize(ref.cod)].filter(Boolean)))
        if (!isCompletedRevisionForAnyKey(work, matchKeys)) continue
        const revisionDate = firstDateForKeys(work, matchKeys)
        if (!revisionDate || revisionDate < cutoff || revisionDate > now) continue

        const existing = hits[ref.id]
        if (existing && existing.date >= revisionDate) continue

        hits[ref.id] = {
          equipmentId: ref.id,
          matchedKey: key,
          workId: work.id,
          nrDisplay: normalize(work?.nrLucrare || work?.numarRaport || work.id),
          date: revisionDate,
          dateLabel: formatDateRo(revisionDate),
          statusLucrare: normalize(work?.statusLucrare),
        }
      }
    }
  }

  return hits
}

export function buildRecentRevisionBlockMessage(hits: RecentRevisionHit[]): string {
  if (hits.length === 0) return ""
  const label = hits.length === 1 ? "echipament are" : "echipamente au"
  const details = hits
    .map((hit) => `${hit.nrDisplay || hit.workId} din ${hit.dateLabel}`)
    .join(", ")
  return `Nu puteți emite revizia: ${hits.length} ${label} revizie efectuată în ultimele ${RECENT_REVISION_BLOCK_DAYS} zile (${details}).`
}
