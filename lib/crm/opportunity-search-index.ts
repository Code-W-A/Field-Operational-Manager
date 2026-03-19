import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { listResolvedCrmClientContacts } from "@/lib/crm/client-contacts"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"

function normalizePart(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
}

function pushText(parts: string[], value: unknown) {
  const normalized = normalizePart(value)
  if (normalized) parts.push(normalized)
}

export async function rebuildOpportunitySearchIndex(opportunityId: string) {
  const opportunityRef = doc(db, CRM_COLLECTIONS.opportunities, opportunityId)
  const opportunitySnap = await getDoc(opportunityRef)
  if (!opportunitySnap.exists()) return

  const opportunityData = opportunitySnap.data() as Record<string, unknown>
  const parts: string[] = []

  pushText(parts, opportunityData.code)
  pushText(parts, opportunityData.title)
  pushText(parts, opportunityData.displayTitle)

  const clientId = String(opportunityData.clientId || "")
  if (clientId) {
    const crmClientSnap = await getDoc(doc(db, CRM_COLLECTIONS.clients, clientId))
    if (crmClientSnap.exists()) {
      const clientData = crmClientSnap.data() as Record<string, unknown>
      pushText(parts, clientData.name)
    } else {
      const legacyClientSnap = await getDoc(doc(db, "clienti", clientId))
      if (legacyClientSnap.exists()) {
        const legacyData = legacyClientSnap.data() as Record<string, unknown>
        pushText(parts, legacyData.nume)
      }
    }
  }

  const opportunityContactsRows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.opportunityContacts), where("opportunityId", "==", opportunityId), limit(200))
  )
  const contactIds = Array.from(
    new Set(
      opportunityContactsRows.docs
        .map((row) => String((row.data() as Record<string, unknown>).contactId || ""))
        .filter(Boolean)
    )
  )

  if (contactIds.length > 0 && clientId) {
    const clientContacts = await listResolvedCrmClientContacts(clientId)
    const contactsById = new Map(clientContacts.map((contact) => [contact.id, contact]))

    for (const id of contactIds) {
      const contact = contactsById.get(id)
      if (!contact) continue
      pushText(parts, contact.name)
      pushText(parts, contact.phone)
      pushText(parts, contact.email)
      pushText(parts, contact.locationName)
    }
  }

  const [taskRows, noteRows, internalNoteRows, emailRows, calendarRows, fileRows] = await Promise.all([
    getDocs(query(collection(db, CRM_COLLECTIONS.tasks), where("opportunityId", "==", opportunityId), limit(300))),
    getDocs(query(collection(db, CRM_COLLECTIONS.notes), where("opportunityId", "==", opportunityId), limit(300))),
    getDocs(query(collection(db, CRM_COLLECTIONS.internalNotes), where("opportunityId", "==", opportunityId), limit(300))),
    getDocs(query(collection(db, CRM_COLLECTIONS.emails), where("opportunityId", "==", opportunityId), limit(300))),
    getDocs(query(collection(db, CRM_COLLECTIONS.calendarEvents), where("opportunityId", "==", opportunityId), limit(300))),
    getDocs(query(collection(db, CRM_COLLECTIONS.files), where("opportunityId", "==", opportunityId), limit(300))),
  ])

  let offerDocs: Record<string, unknown>[] = []
  try {
    const offerRows = await getDocs(
      query(collection(db, CRM_COLLECTIONS.offers), where("opportunityId", "==", opportunityId), limit(300))
    )
    offerDocs = offerRows.docs.map((row) => row.data() as Record<string, unknown>)
  } catch {
    offerDocs = []
  }

  taskRows.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>
    pushText(parts, data.title)
  })
  noteRows.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>
    pushText(parts, data.content)
  })
  internalNoteRows.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>
    pushText(parts, data.message)
    pushText(parts, data.confirmationMessage)
  })
  emailRows.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>
    pushText(parts, data.subject)
    pushText(parts, data.bodySnippet)
    pushText(parts, data.from)
    const to = Array.isArray(data.to) ? (data.to as unknown[]) : []
    to.forEach((entry) => pushText(parts, entry))
  })
  calendarRows.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>
    pushText(parts, data.title)
    pushText(parts, data.location)
  })
  fileRows.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>
    pushText(parts, data.filename)
  })
  offerDocs.forEach((data) => {
    pushText(parts, data.subject)
    pushText(parts, data.message)
    pushText(parts, data.recipientEmail)
    const snapshot = (data.snapshot || {}) as Record<string, unknown>
    const products = Array.isArray(snapshot.products) ? (snapshot.products as Record<string, unknown>[]) : []
    products.forEach((product) => pushText(parts, product.name))
  })

  const searchIndex = Array.from(new Set(parts)).join(" ")
  await updateDoc(opportunityRef, {
    searchIndex,
    searchIndexUpdatedAt: serverTimestamp(),
  })
}
