import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import type { CrmClientContact } from "@/lib/crm/types"
import { getClientLevelContactsFromRecord, getClientLocationContactsFromRecord } from "@/lib/client-contacts"

function mapResolvedContact(clientId: string, contact: Record<string, unknown>): CrmClientContact {
  const email = String(contact.email || "").trim()

  return {
    id: String(contact.id || ""),
    clientId,
    name: String(contact.nume || ""),
    phone: String(contact.telefon || ""),
    email: email || undefined,
    locationName: typeof contact.locationName === "string" && contact.locationName.trim() ? contact.locationName.trim() : undefined,
  }
}

export async function listResolvedCrmClientContacts(clientId: string): Promise<CrmClientContact[]> {
  if (!clientId) return []

  const legacySnap = await getDoc(doc(db, "clienti", clientId))
  if (legacySnap.exists()) {
    const legacy = legacySnap.data() as Record<string, unknown>
    const locationContacts = getClientLocationContactsFromRecord(clientId, legacy)
      .map((contact) => mapResolvedContact(clientId, contact as Record<string, unknown>))
      .sort((left, right) => {
        const locationCompare = String(left.locationName || "").localeCompare(String(right.locationName || ""), "ro", { sensitivity: "base" })
        if (locationCompare !== 0) return locationCompare
        return left.name.localeCompare(right.name, "ro", { sensitivity: "base" })
      })

    if (locationContacts.length > 0) {
      return locationContacts
    }

    const inlineContacts = getClientLevelContactsFromRecord(clientId, legacy)
      .map((contact) => mapResolvedContact(clientId, contact as Record<string, unknown>))
      .sort((left, right) => left.name.localeCompare(right.name, "ro", { sensitivity: "base" }))

    if (inlineContacts.length > 0) {
      return inlineContacts
    }
  }

  const rows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.clientContacts), where("clientId", "==", clientId), orderBy("name", "asc"), limit(300))
  )

  return rows.docs.map((snap) => {
    const data = snap.data() as Record<string, unknown>
    return {
      id: snap.id,
      clientId,
      name: String(data.name || ""),
      phone: String(data.phone || ""),
      email: typeof data.email === "string" && data.email.trim() ? data.email.trim() : undefined,
      locationName: typeof data.locationName === "string" && data.locationName.trim() ? data.locationName.trim() : undefined,
      createdAt: data.createdAt as CrmClientContact["createdAt"],
      updatedAt: data.updatedAt as CrmClientContact["updatedAt"],
    }
  })
}
