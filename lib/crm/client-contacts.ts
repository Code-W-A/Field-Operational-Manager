import { resolveLegacyCrmContacts, normalizeText } from "./resolved-contacts"
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { CRM_COLLECTIONS } from "@/lib/crm/constants"
import type { CrmClientContact } from "@/lib/crm/types"
import {
  deriveLegacyPrimaryClientContact,
  ensureClientContactIds,
  getClientLocationContactsFromRecord,
  type ClientLevelContact,
} from "@/lib/client-contacts"

export async function listResolvedCrmClientContacts(clientId: string): Promise<CrmClientContact[]> {
  if (!clientId) return []

  const legacySnap = await getDoc(doc(db, "clienti", clientId))
  if (legacySnap.exists()) {
    const legacy = legacySnap.data() as Record<string, unknown>
    const contacts = resolveLegacyCrmContacts(clientId, legacy)
    if (contacts.length) return contacts
  }

  const rows = await getDocs(
    query(collection(db, CRM_COLLECTIONS.clientContacts), where("clientId", "==", clientId), orderBy("name", "asc"), limit(300))
  )

  const crmContacts = rows.docs.map((snap) => {
    const data = snap.data() as Record<string, unknown>
    return {
      id: snap.id,
      clientId,
      name: String(data.name || ""),
      phone: String(data.phone || ""),
      email: typeof data.email === "string" && data.email.trim() ? data.email.trim() : undefined,
      functie: typeof data.functie === "string" && data.functie.trim() ? data.functie.trim() : undefined,
      label: typeof data.label === "string" && data.label.trim() ? data.label.trim() : undefined,
      locationName: typeof data.locationName === "string" && data.locationName.trim() ? data.locationName.trim() : undefined,
      createdAt: data.createdAt as CrmClientContact["createdAt"],
      updatedAt: data.updatedAt as CrmClientContact["updatedAt"],
      source: typeof data.locationName === "string" && data.locationName.trim() ? "location" : "crm",
    } satisfies CrmClientContact
  })

  const sortedCrmContacts = [...crmContacts].sort((left, right) => {
    const leftRank = normalizeText(left.locationName) ? 1 : 0
    const rightRank = normalizeText(right.locationName) ? 1 : 0
    if (leftRank !== rightRank) return leftRank - rightRank

    const locationCompare = normalizeText(left.locationName).localeCompare(normalizeText(right.locationName), "ro", {
      sensitivity: "base",
    })
    if (locationCompare !== 0) return locationCompare

    return normalizeText(left.name).localeCompare(normalizeText(right.name), "ro", { sensitivity: "base" })
  })

  const firstTopLevelContact = sortedCrmContacts.find((contact) => !normalizeText(contact.locationName))

  return sortedCrmContacts.map((contact) =>
    firstTopLevelContact && contact.id === firstTopLevelContact.id
      ? { ...contact, isPrimary: true }
      : contact
  )
}
