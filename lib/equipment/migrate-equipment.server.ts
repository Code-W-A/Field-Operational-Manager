import { createHash, randomUUID } from "node:crypto"
import type { Firestore } from "firebase-admin/firestore"
import { FieldValue } from "firebase-admin/firestore"

const CHUNK = 10
const BATCH_SIZE = 400
const MIGRATIONS_COLLECTION = "equipmentMigrations"

export class MigrateEquipmentError extends Error {
  readonly statusCode: number
  readonly details?: unknown

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message)
    this.name = "MigrateEquipmentError"
    this.statusCode = statusCode
    this.details = details
  }
}

export type MigrateEquipmentMode = "move" | "copy"

export type MigrateEquipmentInput = {
  sourceClientId: string
  targetClientId: string
  /** Preferat: `locatii[].id` pe clientul destinație */
  targetLocationId?: string
  /** Fallback dacă lipsește id-ul; trebuie să fie unic pe client */
  targetLocationName?: string
  equipmentIds: string[]
  /** Opțional: `contracte[].id` pe clientul destinație */
  targetContractId?: string | null
  /** `move` = șterge de la sursă + actualizează lucrări (implicit). `copy` = clonă cu id nou, sursă și lucrări neschimbate. */
  mode?: MigrateEquipmentMode
  dryRun?: boolean
  idempotencyKey?: string | null
}

export type MigrateEquipmentDryRunResult = {
  dryRun: true
  mode: MigrateEquipmentMode
  /** La `copy`, lucrările nu se modifică. */
  willUpdateLucrari: boolean
  equipmentCount: number
  equipmentPreview: Array<{
    id: string
    cod: string
    nume: string
    sourceLocationName: string
  }>
  affectedLucrareIds: string[]
  sourceContractChanges: Array<{
    contractId?: string
    contractNumber?: string
    removedEquipmentIds: string[]
  }>
  targetContractAddition?: {
    contractId?: string
    contractNumber?: string
    equipmentIdsToAdd: string[]
    /** La copiere: numărul de id-uri noi care vor fi alocate la commit (preview fără id-uri stabile între cereri). */
    pendingNewIdsCount?: number
  }
}

export type MigrateEquipmentCommitResult = {
  dryRun: false
  success: true
  mode: MigrateEquipmentMode
  /** Id-uri finale pe destinație: la `move` aceleași ca sursa; la `copy` id-uri noi generate. */
  migratedEquipmentIds: string[]
  affectedLucrareIds: string[]
  updatedLucrariCount: number
  willUpdateLucrari: boolean
  sourceContractChanges: MigrateEquipmentDryRunResult["sourceContractChanges"]
  targetContractAddition?: MigrateEquipmentDryRunResult["targetContractAddition"]
  idempotentReplay?: boolean
  idempotencyKey?: string
}

export type MigrateEquipmentResult = MigrateEquipmentDryRunResult | MigrateEquipmentCommitResult

function norm(s: unknown): string {
  return String(s ?? "").trim()
}

/** Firestore nu acceptă `undefined`; păstrăm obiecte speciale (ex. Timestamp) nemodificate. */
function omitUndefinedShallow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v
  }
  return out
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function stableInputHash(input: Omit<MigrateEquipmentInput, "dryRun" | "idempotencyKey">): string {
  const mode: MigrateEquipmentMode = input.mode === "copy" ? "copy" : "move"
  const normalized = {
    mode,
    sourceClientId: norm(input.sourceClientId),
    targetClientId: norm(input.targetClientId),
    targetLocationId: norm(input.targetLocationId),
    targetLocationName: norm(input.targetLocationName),
    targetContractId: norm(input.targetContractId),
    equipmentIds: [...new Set(input.equipmentIds.map((id) => norm(id)).filter(Boolean))].sort(),
  }
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex")
}

function allEquipmentIdsOnClient(clientData: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  const locatii = Array.isArray(clientData.locatii) ? (clientData.locatii as any[]) : []
  for (const loc of locatii) {
    const list = Array.isArray(loc?.echipamente) ? loc.echipamente : []
    for (const eq of list) {
      const id = norm(eq?.id)
      if (id) ids.add(id)
    }
  }
  const root = Array.isArray(clientData.echipamente) ? (clientData.echipamente as any[]) : []
  for (const eq of root) {
    const id = norm(eq?.id)
    if (id) ids.add(id)
  }
  return ids
}

type FoundEquipment = {
  equipment: Record<string, unknown>
  sourceLocationLabel: string
}

/**
 * Găsește echipamentele după id în `locatii[].echipamente` și opțional `echipamente` la rădăcina clientului.
 */
function findEquipmentsOnSource(
  clientData: Record<string, unknown>,
  wanted: Set<string>,
): { byId: Map<string, FoundEquipment>; missing: string[]; duplicateIds: string[] } {
  const byId = new Map<string, FoundEquipment>()
  const duplicateIdSet = new Set<string>()

  const tryAdd = (id: string, equipment: any, sourceLocationLabel: string) => {
    if (!wanted.has(id)) return
    if (byId.has(id)) {
      duplicateIdSet.add(id)
      return
    }
    byId.set(id, { equipment: { ...equipment }, sourceLocationLabel })
  }

  const locatii = Array.isArray(clientData.locatii) ? (clientData.locatii as any[]) : []
  for (const loc of locatii) {
    const label = norm(loc?.nume) || "Locație"
    const list = Array.isArray(loc?.echipamente) ? loc.echipamente : []
    for (const eq of list) {
      const id = norm(eq?.id)
      if (id) tryAdd(id, eq, label)
    }
  }

  const root = Array.isArray(clientData.echipamente) ? (clientData.echipamente as any[]) : []
  for (const eq of root) {
    const id = norm(eq?.id)
    if (id) tryAdd(id, eq, "Client (fără locație)")
  }

  const missing: string[] = []
  for (const id of wanted) {
    if (!byId.has(id)) missing.push(id)
  }

  return { byId, missing, duplicateIds: [...duplicateIdSet] }
}

function resolveTargetLocation(
  clientData: Record<string, unknown>,
  targetLocationId?: string,
  targetLocationName?: string,
): { locatie: any; locIndex: number } {
  const locatii = Array.isArray(clientData.locatii) ? ([...clientData.locatii] as any[]) : []
  if (locatii.length === 0) {
    throw new MigrateEquipmentError("Clientul destinație nu are locații definite.", 400)
  }

  const tid = norm(targetLocationId)
  const tname = norm(targetLocationName)

  if (tid) {
    const idxs = locatii.map((l, i) => (norm(l?.id) === tid ? i : -1)).filter((i) => i >= 0)
    if (idxs.length === 0) {
      throw new MigrateEquipmentError(`Locația destinație cu id „${tid}” nu a fost găsită.`, 400)
    }
    if (idxs.length > 1) {
      throw new MigrateEquipmentError("Mai multe locații au același id pe clientul destinație.", 409)
    }
    const locIndex = idxs[0]!
    return { locatie: locatii[locIndex], locIndex }
  }

  if (tname) {
    const idxs = locatii.map((l, i) => (norm(l?.nume) === tname ? i : -1)).filter((i) => i >= 0)
    if (idxs.length === 0) {
      throw new MigrateEquipmentError(`Locația destinație „${tname}” nu a fost găsită.`, 400)
    }
    if (idxs.length > 1) {
      throw new MigrateEquipmentError(
        `Numele de locație „${tname}” nu este unic pe clientul destinație. Folosiți targetLocationId.`,
        409,
      )
    }
    const locIndex = idxs[0]!
    return { locatie: locatii[locIndex], locIndex }
  }

  throw new MigrateEquipmentError("Lipsește targetLocationId sau targetLocationName.", 400)
}

function stripEquipmentFromContracts(
  contracte: any[] | undefined,
  removeIds: Set<string>,
): { next: any[]; changes: MigrateEquipmentDryRunResult["sourceContractChanges"] } {
  const list = Array.isArray(contracte) ? contracte : []
  const changes: MigrateEquipmentDryRunResult["sourceContractChanges"] = []
  const next = list.map((c) => {
    const ids = Array.isArray(c?.equipmentIds) ? c.equipmentIds.map((x: any) => norm(x)).filter(Boolean) : []
    const removed = ids.filter((id: string) => removeIds.has(id))
    if (removed.length === 0) return c
    changes.push({
      contractId: norm(c?.id) || undefined,
      contractNumber: norm(c?.number) || norm(c?.numar) || undefined,
      removedEquipmentIds: removed,
    })
    const kept = ids.filter((id: string) => !removeIds.has(id))
    return { ...c, equipmentIds: kept }
  })
  return { next, changes }
}

function addEquipmentToTargetContract(
  contracte: any[] | undefined,
  targetContractId: string,
  addIds: string[],
): { next: any[]; addition?: MigrateEquipmentDryRunResult["targetContractAddition"] } {
  const list = Array.isArray(contracte) ? [...contracte] : []
  const want = new Set(addIds.map(norm).filter(Boolean))
  let addition: MigrateEquipmentDryRunResult["targetContractAddition"] | undefined
  const tcid = norm(targetContractId)

  const next = list.map((c) => {
    const cid = norm(c?.id)
    if (cid !== tcid) return c
    const existing = Array.isArray(c?.equipmentIds) ? c.equipmentIds.map((x: any) => norm(x)).filter(Boolean) : []
    const merged = Array.from(new Set([...existing, ...Array.from(want)]))
    const added = Array.from(want).filter((id) => !existing.includes(id))
    if (added.length) {
      addition = {
        contractId: cid || undefined,
        contractNumber: norm(c?.number) || norm(c?.numar) || undefined,
        equipmentIdsToAdd: addIds,
      }
    }
    return { ...c, equipmentIds: merged }
  })

  if (!addition && tcid) {
    const found = list.some((c) => norm(c?.id) === tcid)
    if (!found) {
      throw new MigrateEquipmentError(`Contractul destinație cu id „${tcid}” nu există pe clientul țintă.`, 400)
    }
  }

  return { next, addition }
}

function removeEquipmentFromClientTree(
  clientData: Record<string, unknown>,
  removeIds: Set<string>,
): { locatii: any[]; rootEchipamente: any[] | undefined; removed: Map<string, any> } {
  const removed = new Map<string, any>()
  const locatii = Array.isArray(clientData.locatii) ? ([...clientData.locatii] as any[]) : []

  const nextLocatii = locatii.map((loc) => {
    const list = Array.isArray(loc.echipamente) ? loc.echipamente : []
    const kept: any[] = []
    for (const eq of list) {
      const id = norm(eq?.id)
      if (id && removeIds.has(id)) {
        removed.set(id, eq)
      } else {
        kept.push(eq)
      }
    }
    return { ...loc, echipamente: kept }
  })

  let rootEchipamente: any[] | undefined
  if (Array.isArray(clientData.echipamente)) {
    const kept: any[] = []
    for (const eq of clientData.echipamente as any[]) {
      const id = norm(eq?.id)
      if (id && removeIds.has(id)) {
        removed.set(id, eq)
      } else {
        kept.push(eq)
      }
    }
    rootEchipamente = kept.length ? kept : []
  }

  return { locatii: nextLocatii, rootEchipamente, removed }
}

function workTouchesMovedEquipment(work: Record<string, unknown>, movedIds: Set<string>): boolean {
  const eid = norm(work.echipamentId)
  if (eid && movedIds.has(eid)) return true
  const eqIds = Array.isArray(work.equipmentIds) ? work.equipmentIds : []
  return eqIds.some((x) => movedIds.has(norm(x)))
}

async function discoverAffectedLucrareIds(adminDb: Firestore, movedIds: Set<string>): Promise<string[]> {
  const found = new Set<string>()
  const ids = Array.from(movedIds)

  for (const part of chunk(ids, CHUNK)) {
    if (part.length === 0) continue
    const snap = await adminDb.collection("lucrari").where("echipamentId", "in", part).get()
    snap.docs.forEach((d) => found.add(d.id))
  }

  for (const part of chunk(ids, CHUNK)) {
    if (part.length === 0) continue
    const snap = await adminDb.collection("lucrari").where("equipmentIds", "array-contains-any", part).get()
    snap.docs.forEach((d) => found.add(d.id))
  }

  const verified: string[] = []
  for (const id of found) {
    const doc = await adminDb.collection("lucrari").doc(id).get()
    if (!doc.exists) continue
    const data = doc.data() as Record<string, unknown>
    if (workTouchesMovedEquipment(data, movedIds)) verified.push(id)
  }

  return verified.sort()
}

function buildLucrarePatch(
  work: Record<string, unknown>,
  movedIds: Set<string>,
  equipmentById: Map<string, FoundEquipment>,
  targetClientId: string,
  targetClientName: string,
  targetLocId: string,
  targetLocName: string,
): Record<string, unknown> | null {
  if (!workTouchesMovedEquipment(work, movedIds)) return null

  const patch: Record<string, unknown> = {
    clientId: targetClientId,
    client: targetClientName,
    locatie: targetLocName,
    locationId: targetLocId,
    locationName: targetLocName,
    updatedAt: FieldValue.serverTimestamp(),
  }

  const primaryId = norm(work.echipamentId)
  if (primaryId && movedIds.has(primaryId)) {
    const meta = equipmentById.get(primaryId)
    if (meta) {
      const eq = meta.equipment
      patch.echipamentId = primaryId
      patch.echipamentCod = norm(eq.cod) || null
      patch.echipament = norm(eq.nume) || null
      patch.echipamentModel = norm(eq.model) || null
    }
  }

  const rs = work.raportSnapshot
  if (rs && typeof rs === "object" && !Array.isArray(rs)) {
    const snap = { ...(rs as Record<string, unknown>) }
    const oldClient = norm(work.client)
    const oldLoc = norm(work.locatie)
    let touched = false
    for (const key of Object.keys(snap)) {
      const v = snap[key]
      if (typeof v === "string") {
        if (oldClient && v === oldClient) {
          ;(snap as any)[key] = targetClientName
          touched = true
        } else if (oldLoc && v === oldLoc) {
          ;(snap as any)[key] = targetLocName
          touched = true
        }
      }
    }
    if (touched) patch.raportSnapshot = snap
  }

  return patch
}

export async function migrateEquipment(adminDb: Firestore, input: MigrateEquipmentInput): Promise<MigrateEquipmentResult> {
  const sourceClientId = norm(input.sourceClientId)
  const targetClientId = norm(input.targetClientId)
  const dryRun = Boolean(input.dryRun)
  const idempotencyKey = norm(input.idempotencyKey)
  const mode: MigrateEquipmentMode = input.mode === "copy" ? "copy" : "move"

  if (!sourceClientId || !targetClientId) {
    throw new MigrateEquipmentError("sourceClientId și targetClientId sunt obligatorii.", 400)
  }
  if (sourceClientId === targetClientId) {
    throw new MigrateEquipmentError("Sursa și destinația trebuie să fie clienți diferiți.", 400)
  }

  const equipmentIds = Array.from(new Set(input.equipmentIds.map((x) => norm(x)).filter(Boolean)))
  if (equipmentIds.length === 0) {
    throw new MigrateEquipmentError("Lista equipmentIds este goală.", 400)
  }

  const wanted = new Set(equipmentIds)
  const payloadHash = stableInputHash({
    mode,
    sourceClientId,
    targetClientId,
    targetLocationId: input.targetLocationId,
    targetLocationName: input.targetLocationName,
    targetContractId: input.targetContractId ?? undefined,
    equipmentIds,
  })

  if (!dryRun && idempotencyKey) {
    const keyRef = adminDb.collection(MIGRATIONS_COLLECTION).doc(idempotencyKey)
    const existing = await keyRef.get()
    if (existing.exists) {
      const row = existing.data() as any
      const prevHash = norm(row?.inputHash)
      if (prevHash && prevHash !== payloadHash) {
        throw new MigrateEquipmentError("Cheie idempotency deja folosită cu alt payload.", 409, {
          idempotencyKey,
        })
      }
      if (row?.status === "completed" && prevHash === payloadHash) {
        const replayMode: MigrateEquipmentMode = row?.mode === "copy" ? "copy" : "move"
        return {
          dryRun: false,
          success: true,
          mode: replayMode,
          migratedEquipmentIds: Array.isArray(row?.migratedEquipmentIds) ? row.migratedEquipmentIds : equipmentIds,
          affectedLucrareIds: Array.isArray(row?.affectedLucrareIds) ? row.affectedLucrareIds : [],
          updatedLucrariCount: Number(row?.updatedLucrariCount) || 0,
          willUpdateLucrari: replayMode === "move",
          sourceContractChanges: Array.isArray(row?.sourceContractChanges) ? row.sourceContractChanges : [],
          targetContractAddition: row?.targetContractAddition,
          idempotentReplay: true,
          idempotencyKey,
        }
      }
    }
  }

  const sourceRef = adminDb.collection("clienti").doc(sourceClientId)
  const targetRef = adminDb.collection("clienti").doc(targetClientId)

  const [sourceSnap, targetSnap] = await Promise.all([sourceRef.get(), targetRef.get()])
  if (!sourceSnap.exists) {
    throw new MigrateEquipmentError(`Clientul sursă „${sourceClientId}” nu există.`, 404)
  }
  if (!targetSnap.exists) {
    throw new MigrateEquipmentError(`Clientul destinație „${targetClientId}” nu există.`, 404)
  }

  const sourceData = sourceSnap.data() as Record<string, unknown>
  const targetData = targetSnap.data() as Record<string, unknown>

  const { byId: foundMap, missing, duplicateIds } = findEquipmentsOnSource(sourceData, wanted)
  if (duplicateIds.length) {
    throw new MigrateEquipmentError("Aceleași id-uri de echipament apar de mai multe ori la clientul sursă.", 409, {
      duplicateIds,
    })
  }
  if (missing.length) {
    throw new MigrateEquipmentError("Unele echipamente nu au fost găsite la clientul sursă.", 409, { missing })
  }

  const targetExistingIds = allEquipmentIdsOnClient(targetData)
  if (mode === "move") {
    const collisions = equipmentIds.filter((id) => targetExistingIds.has(id))
    if (collisions.length) {
      throw new MigrateEquipmentError("Id-uri de echipament deja prezente la clientul destinație.", 409, { collisions })
    }
  }

  const { locatie: targetLoc } = resolveTargetLocation(targetData, input.targetLocationId, input.targetLocationName)
  const targetLocId = norm(targetLoc?.id) || norm(input.targetLocationId)
  const targetLocName = norm(targetLoc?.nume) || norm(input.targetLocationName) || "Locație"
  const targetClientName = norm(targetData.nume)
  if (!targetClientName) {
    throw new MigrateEquipmentError("Clientul destinație nu are nume (câmp „nume”).", 400)
  }

  const affectedLucrareIds = mode === "move" ? await discoverAffectedLucrareIds(adminDb, wanted) : []

  const sourceContractChanges: MigrateEquipmentDryRunResult["sourceContractChanges"] =
    mode === "move" ? stripEquipmentFromContracts(sourceData.contracte as any, wanted).changes : []

  let targetContractAddition: MigrateEquipmentDryRunResult["targetContractAddition"] | undefined
  const tcid = norm(input.targetContractId)
  if (tcid) {
    const idsForContractPreview = mode === "copy" ? equipmentIds.map(() => randomUUID()) : equipmentIds
    const { addition } = addEquipmentToTargetContract(targetData.contracte as any, tcid, idsForContractPreview)
    targetContractAddition = addition
      ? {
          contractId: addition.contractId,
          contractNumber: addition.contractNumber,
          equipmentIdsToAdd: mode === "move" ? addition.equipmentIdsToAdd : [],
          ...(mode === "copy" ? { pendingNewIdsCount: equipmentIds.length } : {}),
        }
      : undefined
  }

  const equipmentPreview = equipmentIds.map((id) => {
    const f = foundMap.get(id)!
    const eq = f.equipment
    return {
      id,
      cod: norm(eq.cod),
      nume: norm(eq.nume),
      sourceLocationName: f.sourceLocationLabel,
    }
  })

  if (dryRun) {
    return {
      dryRun: true,
      mode,
      willUpdateLucrari: mode === "move",
      equipmentCount: equipmentIds.length,
      equipmentPreview,
      affectedLucrareIds,
      sourceContractChanges,
      targetContractAddition,
    }
  }

  let finalMigratedIds: string[] = equipmentIds

  if (mode === "move") {
    const movedEquipments = equipmentIds.map((id) => {
      const { equipment } = foundMap.get(id)!
      return omitUndefinedShallow({ ...equipment, clientId: targetClientId })
    })

    await adminDb.runTransaction(async (tx) => {
      const sSnap = await tx.get(sourceRef)
      const tSnap = await tx.get(targetRef)
      if (!sSnap.exists || !tSnap.exists) {
        throw new MigrateEquipmentError("Client sursă sau destinație dispărut în timpul tranzacției.", 409)
      }
      const sData = sSnap.data() as Record<string, unknown>
      const tData = tSnap.data() as Record<string, unknown>

      const { locatii: sLocAfter, rootEchipamente: sRootAfter, removed } = removeEquipmentFromClientTree(sData, wanted)
      for (const id of equipmentIds) {
        if (!removed.has(id)) {
          throw new MigrateEquipmentError(`Echipamentul „${id}” nu mai este la clientul sursă (conflict concurență).`, 409)
        }
      }

      const { next: sContractsNext } = stripEquipmentFromContracts(sData.contracte as any, wanted)

      const { locIndex: txTargetLocIndex } = resolveTargetLocation(
        tData,
        input.targetLocationId,
        input.targetLocationName,
      )
      const tLocatii = Array.isArray(tData.locatii) ? ([...tData.locatii] as any[]) : []
      if (txTargetLocIndex < 0 || txTargetLocIndex >= tLocatii.length) {
        throw new MigrateEquipmentError("Index locație destinație invalid.", 500)
      }
      const loc = { ...tLocatii[txTargetLocIndex] }
      const existingList = Array.isArray(loc.echipamente) ? [...loc.echipamente] : []
      loc.echipamente = [...existingList, ...movedEquipments]
      tLocatii[txTargetLocIndex] = loc

      const sourceUpdate: Record<string, unknown> = {
        locatii: sLocAfter,
        contracte: sContractsNext,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (Array.isArray(sData.echipamente)) {
        sourceUpdate.echipamente = sRootAfter !== undefined ? sRootAfter : []
      }

      const targetUpdate: Record<string, unknown> = {
        locatii: tLocatii,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (tcid) {
        const { next: tContractsNext } = addEquipmentToTargetContract(tData.contracte as any, tcid, equipmentIds)
        targetUpdate.contracte = tContractsNext
      }

      tx.update(sourceRef, sourceUpdate as any)
      tx.update(targetRef, targetUpdate as any)
    })
  } else {
    const newIds = equipmentIds.map(() => randomUUID())
    for (const nid of newIds) {
      if (targetExistingIds.has(nid)) {
        throw new MigrateEquipmentError("Coliziune extrem de rară la generarea id-ului; reîncearcă.", 409)
      }
    }

    const clonedEquipments = equipmentIds.map((sourceEqId, i) => {
      const { equipment } = foundMap.get(sourceEqId)!
      const newId = newIds[i]!
      return omitUndefinedShallow({
        ...equipment,
        id: newId,
        clientId: targetClientId,
        migratedFromEquipmentId: sourceEqId,
        migratedFromClientId: sourceClientId,
      })
    })

    if (tcid) {
      const { addition } = addEquipmentToTargetContract(targetData.contracte as any, tcid, newIds)
      targetContractAddition = addition
        ? {
            contractId: addition.contractId,
            contractNumber: addition.contractNumber,
            equipmentIdsToAdd: addition.equipmentIdsToAdd,
          }
        : undefined
    }

    await adminDb.runTransaction(async (tx) => {
      const sSnap = await tx.get(sourceRef)
      const tSnap = await tx.get(targetRef)
      if (!sSnap.exists || !tSnap.exists) {
        throw new MigrateEquipmentError("Client sursă sau destinație dispărut în timpul tranzacției.", 409)
      }
      const sData = sSnap.data() as Record<string, unknown>
      const tData = tSnap.data() as Record<string, unknown>

      const verifyFound = findEquipmentsOnSource(sData, wanted)
      if (verifyFound.missing.length) {
        throw new MigrateEquipmentError("Echipamentul nu mai este la sursă (conflict concurență).", 409, {
          missing: verifyFound.missing,
        })
      }

      const { locIndex: txTargetLocIndex } = resolveTargetLocation(
        tData,
        input.targetLocationId,
        input.targetLocationName,
      )
      const tLocatii = Array.isArray(tData.locatii) ? ([...tData.locatii] as any[]) : []
      if (txTargetLocIndex < 0 || txTargetLocIndex >= tLocatii.length) {
        throw new MigrateEquipmentError("Index locație destinație invalid.", 500)
      }
      const loc = { ...tLocatii[txTargetLocIndex] }
      const existingList = Array.isArray(loc.echipamente) ? [...loc.echipamente] : []
      const existingIds = new Set(existingList.map((e: any) => norm(e?.id)).filter(Boolean))
      for (const c of clonedEquipments) {
        const id = norm((c as any).id)
        if (id && existingIds.has(id)) {
          throw new MigrateEquipmentError("Id clonă deja prezent pe locația destinație.", 409)
        }
      }
      loc.echipamente = [...existingList, ...clonedEquipments]
      tLocatii[txTargetLocIndex] = loc

      const targetUpdate: Record<string, unknown> = {
        locatii: tLocatii,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (tcid) {
        const { next: tContractsNext } = addEquipmentToTargetContract(tData.contracte as any, tcid, newIds)
        targetUpdate.contracte = tContractsNext
      }

      tx.update(targetRef, targetUpdate as any)
    })

    finalMigratedIds = newIds
  }

  let updatedLucrariCount = 0
  if (mode === "move") {
    const equipmentByIdForPatch = new Map<string, FoundEquipment>()
    for (const id of equipmentIds) {
      const f = foundMap.get(id)!
      equipmentByIdForPatch.set(id, f)
    }

    const workPatches: Array<{ id: string; patch: Record<string, unknown> }> = []
    for (const workId of affectedLucrareIds) {
      const wref = adminDb.collection("lucrari").doc(workId)
      const wsnap = await wref.get()
      if (!wsnap.exists) continue
      const wdata = wsnap.data() as Record<string, unknown>
      const patch = buildLucrarePatch(
        wdata,
        wanted,
        equipmentByIdForPatch,
        targetClientId,
        targetClientName,
        targetLocId,
        targetLocName,
      )
      if (patch) workPatches.push({ id: workId, patch })
    }

    for (const part of chunk(workPatches, BATCH_SIZE)) {
      const batch = adminDb.batch()
      for (const { id, patch } of part) {
        batch.update(adminDb.collection("lucrari").doc(id), patch as any)
      }
      await batch.commit()
      updatedLucrariCount += part.length
    }
  }

  if (idempotencyKey) {
    await adminDb
      .collection(MIGRATIONS_COLLECTION)
      .doc(idempotencyKey)
      .set(
        {
          status: "completed",
          completedAt: FieldValue.serverTimestamp(),
          inputHash: payloadHash,
          mode,
          sourceClientId,
          targetClientId,
          migratedEquipmentIds: finalMigratedIds,
          affectedLucrareIds,
          updatedLucrariCount,
          sourceContractChanges,
          targetContractAddition: targetContractAddition ?? null,
        },
        { merge: true },
      )
  }

  return {
    dryRun: false,
    success: true,
    mode,
    migratedEquipmentIds: finalMigratedIds,
    affectedLucrareIds,
    updatedLucrariCount,
    willUpdateLucrari: mode === "move",
    sourceContractChanges,
    targetContractAddition,
    idempotencyKey: idempotencyKey || undefined,
  }
}
