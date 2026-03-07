import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import {
  CRM_COLLECTIONS,
  CRM_COUNTER_DOCS,
  CRM_PIPELINE_STAGE_LABELS,
  CRM_STAGE_AUTOMATION,
  formatOpportunityCode,
} from "@/lib/crm/constants"
import { hasOpportunityViewAccess } from "@/lib/crm/access"
import { logCrmActivity, getDateValue } from "@/lib/crm/activity"
import { listResolvedCrmClientContacts } from "@/lib/crm/client-contacts"
import { rebuildOpportunitySearchIndex } from "@/lib/crm/opportunity-search-index"
import { createCrmTask, createCrmTaskIfMissing } from "@/lib/crm/tasks"
import type {
  CrmClient,
  CrmClientContact,
  CrmFilters,
  CrmOpportunity,
  CrmOpportunityAccess,
  CrmOpportunityContact,
  CrmPermission,
  CrmPipelineStage,
  CrmUserOption,
  CreateOpportunityInput,
} from "@/lib/crm/types"

const OPPORTUNITY_BATCH_SIZE = 10

function mapOpportunity(docId: string, data: Record<string, unknown>): CrmOpportunity {
  return {
    id: docId,
    number: Number(data.number || 0),
    code: String(data.code || ""),
    title: String(data.title || ""),
    displayTitle: String(data.displayTitle || ""),
    clientId: String(data.clientId || ""),
    primaryContactId: typeof data.primaryContactId === "string" ? data.primaryContactId : undefined,
    ownerId: String(data.ownerId || ""),
    priority: (data.priority as CrmOpportunity["priority"]) || "MEDIUM",
    workStatus: (data.workStatus as CrmOpportunity["workStatus"]) || "OPEN",
    pipelineStage: (data.pipelineStage as CrmPipelineStage) || "NOU",
    opportunityType: (data.opportunityType as CrmOpportunity["opportunityType"]) || "ACASA",
    amount: typeof data.amount === "number" ? data.amount : undefined,
    closeDate: (data.closeDate as CrmOpportunity["closeDate"]) || undefined,
    wonAt: (data.wonAt as CrmOpportunity["wonAt"]) || undefined,
    lostAt: (data.lostAt as CrmOpportunity["lostAt"]) || undefined,
    lostReason: typeof data.lostReason === "string" ? data.lostReason : undefined,
    searchIndex: typeof data.searchIndex === "string" ? data.searchIndex : undefined,
    createdAt: (data.createdAt as CrmOpportunity["createdAt"]) || undefined,
    updatedAt: (data.updatedAt as CrmOpportunity["updatedAt"]) || undefined,
    createdById: String(data.createdById || ""),
    updatedById: typeof data.updatedById === "string" ? data.updatedById : undefined,
    readUserIds: Array.isArray(data.readUserIds) ? (data.readUserIds as string[]) : [],
    editUserIds: Array.isArray(data.editUserIds) ? (data.editUserIds as string[]) : [],
  }
}

function chunk<T>(items: T[], size = OPPORTUNITY_BATCH_SIZE) {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size))
  }
  return result
}

export async function listCrmUsers(): Promise<CrmUserOption[]> {
  const userRows = await getDocs(query(collection(db, "users"), orderBy("displayName", "asc"), limit(300)))
  return userRows.docs
    .map((snap) => {
      const data = snap.data() as Record<string, unknown>
      return {
        uid: snap.id,
        displayName: String(data.displayName || data.email || snap.id),
        email: String(data.email || ""),
        role: String(data.role || ""),
      }
    })
    .filter((user) => user.role !== "client" && user.role !== "kiosk")
}

export async function listCrmClients(): Promise<CrmClient[]> {
  const [crmRows, legacyRows] = await Promise.all([
    getDocs(query(collection(db, CRM_COLLECTIONS.clients), orderBy("name", "asc"), limit(500))),
    getDocs(query(collection(db, "clienti"), orderBy("nume", "asc"), limit(500))),
  ])

  const mappedCrm = crmRows.docs.map((snap) => {
    const data = snap.data() as Record<string, unknown>
    return {
      id: snap.id,
      name: String(data.name || "").trim(),
      type: String(data.type || "Persoană juridică"),
      address: String(data.address || ""),
      createdAt: data.createdAt as CrmClient["createdAt"],
      updatedAt: data.updatedAt as CrmClient["updatedAt"],
    } satisfies CrmClient
  })

  const mappedLegacy = legacyRows.docs.map((snap) => {
    const data = snap.data() as Record<string, unknown>
    return {
      id: snap.id,
      name: String(data.nume || "").trim(),
      type: "Persoană juridică",
      address: String(data.adresa || ""),
      createdAt: data.createdAt as CrmClient["createdAt"],
      updatedAt: data.updatedAt as CrmClient["updatedAt"],
    } satisfies CrmClient
  })

  const merged = [...mappedCrm, ...mappedLegacy].filter((client) => client.name.length > 0)
  // De-duplicate by id while preserving first occurrence.
  const byId = new Map<string, CrmClient>()
  merged.forEach((client) => {
    if (!byId.has(client.id)) byId.set(client.id, client)
  })

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "ro"))
}

export async function getCrmClientById(clientId: string): Promise<CrmClient | null> {
  const crmSnap = await getDoc(doc(db, CRM_COLLECTIONS.clients, clientId))
  if (crmSnap.exists()) {
    const data = crmSnap.data() as Record<string, unknown>
    return {
      id: crmSnap.id,
      name: String(data.name || ""),
      type: String(data.type || "Persoană juridică"),
      address: String(data.address || ""),
      createdAt: data.createdAt as CrmClient["createdAt"],
      updatedAt: data.updatedAt as CrmClient["updatedAt"],
    }
  }

  const legacySnap = await getDoc(doc(db, "clienti", clientId))
  if (!legacySnap.exists()) return null
  const legacy = legacySnap.data() as Record<string, unknown>
  return {
    id: legacySnap.id,
    name: String(legacy.nume || ""),
    type: "Persoană juridică",
    address: String(legacy.adresa || ""),
    createdAt: legacy.createdAt as CrmClient["createdAt"],
    updatedAt: legacy.updatedAt as CrmClient["updatedAt"],
  }
}

export async function createCrmClient(input: { name: string; type: string; address: string }) {
  const ref = await addDoc(collection(db, CRM_COLLECTIONS.clients), {
    name: input.name.trim(),
    type: input.type.trim(),
    address: input.address.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return ref.id
}

export async function listCrmClientContacts(clientId: string): Promise<CrmClientContact[]> {
  return listResolvedCrmClientContacts(clientId)
}

export async function createCrmClientContact(input: {
  clientId: string
  name: string
  phone: string
  email?: string
}) {
  const ref = await addDoc(collection(db, CRM_COLLECTIONS.clientContacts), {
    clientId: input.clientId,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  return ref.id
}

export async function listCrmOpportunityAccess(opportunityId: string) {
  const rows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.opportunityAccess), where("opportunityId", "==", opportunityId), limit(200))
  )

  return rows.docs.map((snap) => ({
    id: snap.id,
    ...(snap.data() as Omit<CrmOpportunityAccess, "id">),
  }))
}

export async function setCrmOpportunityAccess(input: {
  opportunityId: string
  userId: string
  permission: CrmPermission
  createdById: string
}) {
  const existing = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.opportunityAccess),
      where("opportunityId", "==", input.opportunityId),
      where("userId", "==", input.userId),
      limit(1)
    )
  )

  if (!existing.empty) {
    const row = existing.docs[0]
    await updateDoc(row.ref, {
      permission: input.permission,
      createdById: input.createdById,
      createdAt: serverTimestamp(),
    })
    return row.id
  }

  const ref = await addDoc(collection(db, CRM_COLLECTIONS.opportunityAccess), {
    opportunityId: input.opportunityId,
    userId: input.userId,
    permission: input.permission,
    createdById: input.createdById,
    createdAt: serverTimestamp(),
  })

  return ref.id
}

async function listAccessibleOpportunityIds(userId: string) {
  const idSet = new Set<string>()

  const ownerRows = await getDocs(query(collection(db, CRM_COLLECTIONS.opportunities), where("ownerId", "==", userId), limit(200)))
  ownerRows.docs.forEach((snap) => idSet.add(snap.id))

  const readRows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.opportunities), where("readUserIds", "array-contains", userId), limit(200))
  )
  readRows.docs.forEach((snap) => idSet.add(snap.id))

  const editRows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.opportunities), where("editUserIds", "array-contains", userId), limit(200))
  )
  editRows.docs.forEach((snap) => idSet.add(snap.id))

  const accessRows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.opportunityAccess), where("userId", "==", userId), limit(200))
  )
  accessRows.docs.forEach((snap) => {
    const data = snap.data() as Record<string, unknown>
    const opportunityId = String(data.opportunityId || "")
    if (opportunityId) idSet.add(opportunityId)
  })

  return Array.from(idSet)
}

async function getOpportunitiesByIds(opportunityIds: string[]) {
  const result: CrmOpportunity[] = []
  for (const ids of chunk(opportunityIds)) {
    const rows = await getDocs(
      query(collection(db, CRM_COLLECTIONS.opportunities), where(documentId(), "in", ids))
    )
    rows.docs.forEach((snap) => result.push(mapOpportunity(snap.id, snap.data() as Record<string, unknown>)))
  }
  return result
}

async function getClientsMap(clientIds: string[]) {
  const map = new Map<string, CrmClient>()
  const ids = Array.from(new Set(clientIds.filter(Boolean)))

  for (const clientIdChunk of chunk(ids)) {
    const rows = await getDocs(query(collection(db, CRM_COLLECTIONS.clients), where(documentId(), "in", clientIdChunk)))
    rows.docs.forEach((snap) => {
      const data = snap.data() as Record<string, unknown>
      map.set(snap.id, {
        id: snap.id,
        name: String(data.name || ""),
        type: String(data.type || ""),
        address: String(data.address || ""),
        createdAt: data.createdAt as CrmClient["createdAt"],
        updatedAt: data.updatedAt as CrmClient["updatedAt"],
      })
    })
  }

  return map
}

async function getOpportunitySearchContactMap(opportunities: CrmOpportunity[]) {
  const opportunityIds = opportunities.map((opportunity) => opportunity.id)
  const joinRows = await Promise.all(
    chunk(opportunityIds).map((ids) =>
      getDocs(query(collection(db, CRM_COLLECTIONS.opportunityContacts), where("opportunityId", "in", ids)))
    )
  )

  const opportunityToContactIds = new Map<string, Set<string>>()
  const contactIds = new Set<string>()

  joinRows.forEach((rows) => {
    rows.docs.forEach((snap) => {
      const data = snap.data() as Record<string, unknown>
      const opportunityId = String(data.opportunityId || "")
      const contactId = String(data.contactId || "")
      if (!opportunityId || !contactId) return

      if (!opportunityToContactIds.has(opportunityId)) {
        opportunityToContactIds.set(opportunityId, new Set<string>())
      }
      opportunityToContactIds.get(opportunityId)?.add(contactId)
      contactIds.add(contactId)
    })
  })

  if (contactIds.size === 0) {
    return new Map<string, string>()
  }

  const contactMapByClientId = new Map<string, Map<string, CrmClientContact>>()
  const clientIds = Array.from(new Set(opportunities.map((opportunity) => opportunity.clientId).filter(Boolean)))
  const contactsByClient = await Promise.all(
    clientIds.map(async (clientId) => ({
      clientId,
      contacts: await listCrmClientContacts(clientId),
    }))
  )
  contactsByClient.forEach(({ clientId, contacts }) => {
    contactMapByClientId.set(
      clientId,
      new Map(contacts.map((contact) => [contact.id, contact]))
    )
  })
  const opportunityClientMap = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity.clientId]))

  const searchMap = new Map<string, string>()

  opportunityToContactIds.forEach((ids, opportunityId) => {
    const clientId = opportunityClientMap.get(opportunityId) || ""
    const contactMap = contactMapByClientId.get(clientId)
    const searchText = Array.from(ids)
      .map((contactId) => contactMap?.get(contactId))
      .filter(Boolean)
      .map((contact) => `${contact?.name || ""} ${contact?.phone || ""} ${contact?.email || ""} ${contact?.locationName || ""}`)
      .join(" ")
    searchMap.set(opportunityId, searchText)
  })

  return searchMap
}

export async function listCrmOpportunitiesForUser(userId: string, filters?: CrmFilters) {
  const accessibleIds = await listAccessibleOpportunityIds(userId)
  if (!accessibleIds.length) return []

  const opportunities = await getOpportunitiesByIds(accessibleIds)
  const clientsMap = await getClientsMap(opportunities.map((opportunity) => opportunity.clientId))
  const contactsSearch = await getOpportunitySearchContactMap(opportunities)

  let filtered = opportunities

  if (filters?.type && filters.type !== "ALL") {
    filtered = filtered.filter((opportunity) => opportunity.opportunityType === filters.type)
  }

  if (filters?.ownerId && filters.ownerId !== "ALL") {
    filtered = filtered.filter((opportunity) => opportunity.ownerId === filters.ownerId)
  }

  if (filters?.priority && filters.priority !== "ALL") {
    filtered = filtered.filter((opportunity) => opportunity.priority === filters.priority)
  }

  if (filters?.pipelineStage && filters.pipelineStage !== "ALL") {
    filtered = filtered.filter((opportunity) => opportunity.pipelineStage === filters.pipelineStage)
  }

  if (filters?.workStatus && filters.workStatus !== "ALL") {
    filtered = filtered.filter((opportunity) => opportunity.workStatus === filters.workStatus)
  }

  const searchText = (filters?.search || "").trim().toLowerCase()
  if (searchText) {
    filtered = filtered.filter((opportunity) => {
      const indexed = (opportunity.searchIndex || "").toLowerCase()
      if (indexed.includes(searchText)) return true
      const client = clientsMap.get(opportunity.clientId)
      const contactText = contactsSearch.get(opportunity.id) || ""
      const haystack = `${opportunity.code} ${opportunity.title} ${opportunity.displayTitle} ${client?.name || ""} ${contactText}`.toLowerCase()
      return haystack.includes(searchText)
    })
  }

  filtered.sort((a, b) => {
    const aDate = getDateValue(a.updatedAt)?.getTime() || 0
    const bDate = getDateValue(b.updatedAt)?.getTime() || 0
    return bDate - aDate
  })

  return filtered
}

export async function getCrmOpportunityById(opportunityId: string, userId?: string) {
  const snap = await getDoc(doc(db, CRM_COLLECTIONS.opportunities, opportunityId))
  if (!snap.exists()) return null

  const opportunity = mapOpportunity(snap.id, snap.data() as Record<string, unknown>)
  if (!userId) return opportunity

  const explicitAccessRows = await getDocs(
    query(
      collection(db, CRM_COLLECTIONS.opportunityAccess),
      where("opportunityId", "==", opportunityId),
      where("userId", "==", userId),
      limit(5)
    )
  )
  const explicitPermissions = explicitAccessRows.docs.map((row) => String(row.data().permission || "VIEW") as CrmPermission)

  if (!hasOpportunityViewAccess(opportunity, userId, explicitPermissions)) {
    return null
  }

  return opportunity
}

export async function createCrmOpportunity(input: CreateOpportunityInput) {
  if (!input.clientId) {
    throw new Error("Clientul este obligatoriu")
  }

  const counterRef = doc(db, CRM_COLLECTIONS.counters, CRM_COUNTER_DOCS.opportunity)
  const opportunityRef = doc(collection(db, CRM_COLLECTIONS.opportunities))

  const ownerUsers = Array.from(new Set([input.ownerId, input.createdById].filter(Boolean)))
  const assignedReadUsers = Array.from(new Set((input.assignedReadUserIds || []).filter(Boolean)))
  const readUsers = Array.from(new Set([...ownerUsers, ...assignedReadUsers]))

  const transactionResult = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef)
    const currentNumber = Number(counterSnap.data()?.nextNumber || 0)
    const nextNumber = currentNumber + 1
    if (nextNumber > 999999) {
      throw new Error("S-a atins limita maximă de oportunități (999999).")
    }
    const code = formatOpportunityCode(nextNumber)

    transaction.set(counterRef, { nextNumber }, { merge: true })
    transaction.set(opportunityRef, {
      number: nextNumber,
      code,
      title: input.title.trim(),
      displayTitle: `${code} - ${input.title.trim()}`,
      clientId: input.clientId,
      primaryContactId: input.primaryContactId || null,
      ownerId: input.ownerId,
      priority: input.priority,
      workStatus: input.workStatus || "OPEN",
      pipelineStage: input.pipelineStage,
      opportunityType: input.opportunityType,
      amount: input.amount ?? null,
      closeDate: input.closeDate ? Timestamp.fromDate(input.closeDate) : null,
      wonAt: null,
      lostAt: null,
      lostReason: null,
      createdById: input.createdById,
      updatedById: input.createdById,
      readUserIds: readUsers,
      editUserIds: ownerUsers,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    return {
      opportunityId: opportunityRef.id,
      code,
    }
  })

  if (input.contactIds?.length) {
    await setCrmOpportunityContacts(transactionResult.opportunityId, input.contactIds)
  }

  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const reminderAt = new Date(dueAt.getTime() - 2 * 60 * 60 * 1000)

  await createCrmTask({
    opportunityId: transactionResult.opportunityId,
    title: "Contactare lead",
    createdById: input.createdById,
    assigneeId: input.ownerId,
    dueAt,
    reminderAt,
    visibility: "PRIVATE",
    status: "TODO",
    automationKey: "opportunity_initial_contact",
  })

  await logCrmActivity({
    opportunityId: transactionResult.opportunityId,
    actorId: input.createdById,
    type: "CREATED",
    payload: {
      code: transactionResult.code,
      opportunity: {
        id: transactionResult.opportunityId,
        title: input.title.trim(),
        ownerId: input.ownerId,
        assignedReadUserIds: assignedReadUsers,
        stage: input.pipelineStage,
        priority: input.priority,
        workStatus: input.workStatus || "OPEN",
        opportunityType: input.opportunityType,
        clientId: input.clientId,
        primaryContactId: input.primaryContactId || null,
      },
    },
  })

  await logCrmActivity({
    opportunityId: transactionResult.opportunityId,
    actorId: input.createdById,
    type: "TASK_AUTO_CREATED",
    payload: {
      task: {
        title: "Contactare lead",
        dueAt: dueAt.toISOString(),
        reminderAt: reminderAt.toISOString(),
        status: "TODO",
        assigneeId: input.ownerId,
      },
    },
  })

  await rebuildOpportunitySearchIndex(transactionResult.opportunityId)

  return transactionResult
}

export async function updateCrmOpportunity(opportunityId: string, actorId: string, changes: Partial<CrmOpportunity>) {
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    updatedById: actorId,
  }

  if (typeof changes.title === "string") payload.title = changes.title
  if (typeof changes.displayTitle === "string") payload.displayTitle = changes.displayTitle
  if (typeof changes.ownerId === "string") payload.ownerId = changes.ownerId
  if ("primaryContactId" in changes) payload.primaryContactId = changes.primaryContactId || null
  if (changes.priority) payload.priority = changes.priority
  if (changes.workStatus) payload.workStatus = changes.workStatus
  if (changes.pipelineStage) payload.pipelineStage = changes.pipelineStage
  if (changes.opportunityType) payload.opportunityType = changes.opportunityType
  if (typeof changes.amount === "number") payload.amount = changes.amount
  if (changes.closeDate instanceof Date) payload.closeDate = Timestamp.fromDate(changes.closeDate)

  await updateDoc(doc(db, CRM_COLLECTIONS.opportunities, opportunityId), payload)

  await logCrmActivity({
    opportunityId,
    actorId,
    type: "UPDATED",
    payload: {
      changes: {
        title: typeof changes.title === "string" ? changes.title : undefined,
        displayTitle: typeof changes.displayTitle === "string" ? changes.displayTitle : undefined,
        ownerId: typeof changes.ownerId === "string" ? changes.ownerId : undefined,
        primaryContactId: "primaryContactId" in changes ? changes.primaryContactId || null : undefined,
        priority: changes.priority || undefined,
        workStatus: changes.workStatus || undefined,
        pipelineStage: changes.pipelineStage || undefined,
        opportunityType: changes.opportunityType || undefined,
        amount: typeof changes.amount === "number" ? changes.amount : undefined,
        closeDate: changes.closeDate instanceof Date ? changes.closeDate.toISOString() : undefined,
      },
    },
  })

  await rebuildOpportunitySearchIndex(opportunityId)
}

export async function changeCrmOpportunityStage(input: {
  opportunityId: string
  actorId: string
  toStage: CrmPipelineStage
  lostReason?: string
  createRecontactTask?: boolean
}) {
  const snap = await getDoc(doc(db, CRM_COLLECTIONS.opportunities, input.opportunityId))
  if (!snap.exists()) {
    throw new Error("Oportunitatea nu există")
  }

  const opportunity = mapOpportunity(snap.id, snap.data() as Record<string, unknown>)

  if (input.toStage === "PIERDUT" && !input.lostReason?.trim()) {
    throw new Error("Motivul pierderii este obligatoriu")
  }

  const updatePayload: Record<string, unknown> = {
    pipelineStage: input.toStage,
    updatedAt: serverTimestamp(),
    updatedById: input.actorId,
  }

  if (input.toStage === "CASTIGAT") {
    updatePayload.wonAt = serverTimestamp()
    updatePayload.lostAt = null
    updatePayload.lostReason = null
  }

  if (input.toStage === "PIERDUT") {
    updatePayload.lostAt = serverTimestamp()
    updatePayload.lostReason = input.lostReason?.trim()
    updatePayload.wonAt = null
  }

  await updateDoc(doc(db, CRM_COLLECTIONS.opportunities, input.opportunityId), updatePayload)

  await logCrmActivity({
    opportunityId: input.opportunityId,
    actorId: input.actorId,
    type: "STAGE_CHANGED",
    payload: {
      from: opportunity.pipelineStage,
      to: input.toStage,
      fromLabel: CRM_PIPELINE_STAGE_LABELS[opportunity.pipelineStage],
      toLabel: CRM_PIPELINE_STAGE_LABELS[input.toStage],
      lostReason: input.lostReason || null,
    },
  })

  const automationForStage = CRM_STAGE_AUTOMATION[input.toStage] || []
  for (const automation of automationForStage) {
    const dueAt = new Date(Date.now() + automation.dueDaysOffset * 24 * 60 * 60 * 1000)
    const reminderAt = new Date(dueAt.getTime() - automation.reminderHoursBefore * 60 * 60 * 1000)

    await createCrmTaskIfMissing({
      opportunityId: input.opportunityId,
      title: automation.title,
      createdById: input.actorId,
      assigneeId: opportunity.ownerId,
      dueAt,
      reminderAt,
      visibility: "PRIVATE",
      status: "TODO",
      automationKey: automation.key,
    })
  }

  if (input.toStage === "PIERDUT" && input.createRecontactTask) {
    const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    const reminderAt = new Date(dueAt.getTime() - 4 * 60 * 60 * 1000)

    await createCrmTaskIfMissing({
      opportunityId: input.opportunityId,
      title: "Recontactare lead pierdut",
      createdById: input.actorId,
      assigneeId: opportunity.ownerId,
      dueAt,
      reminderAt,
      visibility: "PRIVATE",
      status: "TODO",
      automationKey: "stage_pierdut_recontactare",
    })
  }
}

export async function listCrmOpportunityContacts(opportunityId: string): Promise<CrmOpportunityContact[]> {
  const rows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.opportunityContacts), where("opportunityId", "==", opportunityId), limit(100))
  )

  return rows.docs.map((snap) => ({
    id: snap.id,
    ...(snap.data() as Omit<CrmOpportunityContact, "id">),
  }))
}

export async function setCrmOpportunityContacts(opportunityId: string, contactIds: string[]) {
  const existing = await getDocs(
    query(collection(db, CRM_COLLECTIONS.opportunityContacts), where("opportunityId", "==", opportunityId), limit(200))
  )

  const targetIds = new Set(contactIds.filter(Boolean))

  const deletions = existing.docs
    .filter((snap) => !targetIds.has(String(snap.data().contactId || "")))
    .map((snap) => deleteDoc(snap.ref))

  const existingContactIds = new Set(existing.docs.map((snap) => String(snap.data().contactId || "")))

  const additions = Array.from(targetIds)
    .filter((contactId) => !existingContactIds.has(contactId))
    .map((contactId) =>
      addDoc(collection(db, CRM_COLLECTIONS.opportunityContacts), {
        opportunityId,
        contactId,
        createdAt: serverTimestamp(),
      })
    )

  await Promise.all([...deletions, ...additions])
  await rebuildOpportunitySearchIndex(opportunityId)
}

export async function listCrmDashboardStats(userId: string) {
  const opportunities = await listCrmOpportunitiesForUser(userId)
  const stageCounts = CRM_STAGE_AUTOMATION
  const stageStats: Record<string, number> = {}

  Object.keys(stageCounts).forEach((stage) => {
    stageStats[stage] = opportunities.filter((opportunity) => opportunity.pipelineStage === stage).length
  })

  return {
    total: opportunities.length,
    won: opportunities.filter((opportunity) => opportunity.pipelineStage === "CASTIGAT").length,
    lost: opportunities.filter((opportunity) => opportunity.pipelineStage === "PIERDUT").length,
    stageStats,
  }
}
