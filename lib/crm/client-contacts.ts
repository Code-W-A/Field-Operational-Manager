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

type RawClientContact = ClientLevelContact & { label?: string }

function normalizeText(value: unknown) {
  return String(value || "").trim()
}

function normalizeContactSignature(contact: Partial<RawClientContact>) {
  return [
    normalizeText(contact.nume).toLowerCase(),
    normalizeText(contact.telefon).toLowerCase(),
    normalizeText(contact.email).toLowerCase(),
    normalizeText(contact.locationName).toLowerCase(),
  ].join("|")
}

function hasAnyContactContent(contact: Partial<RawClientContact>) {
  return Boolean(
    normalizeText(contact.nume) ||
      normalizeText(contact.telefon) ||
      normalizeText(contact.email) ||
      normalizeText(contact.functie) ||
      normalizeText(contact.label)
  )
}

function mapResolvedContact(clientId: string, contact: Record<string, unknown>): CrmClientContact {
  const email = String(contact.email || "").trim()
  const functie = typeof contact.functie === "string" && contact.functie.trim()
    ? contact.functie.trim()
    : ""
  const label = typeof contact.label === "string" && contact.label.trim()
    ? contact.label.trim()
    : functie

  return {
    id: String(contact.id || ""),
    clientId,
    name: String(contact.nume || ""),
    phone: String(contact.telefon || ""),
    email: email || undefined,
    functie: functie || undefined,
    label: label || undefined,
    locationName: typeof contact.locationName === "string" && contact.locationName.trim() ? contact.locationName.trim() : undefined,
    isPrimary: contact.isPrimary === true,
    source:
      contact.source === "client" || contact.source === "location" || contact.source === "legacy" || contact.source === "crm"
        ? contact.source
        : undefined,
  }
}

function getInlineClientContacts(clientId: string, rawClient: Record<string, unknown>): RawClientContact[] {
  return ensureClientContactIds(
    clientId,
    Array.isArray(rawClient.persoaneContact) ? (rawClient.persoaneContact as RawClientContact[]) : []
  ).filter((contact) => hasAnyContactContent(contact))
}

function findPreferredClientLevelContact(contacts: RawClientContact[], rawClient: Record<string, unknown>) {
  if (!contacts.length) return null

  const preferredNames = [
    normalizeText(rawClient.persoanaContact).toLowerCase(),
    normalizeText(rawClient.reprezentantFirma).toLowerCase(),
    normalizeText(rawClient.contactPerson).toLowerCase(),
  ].filter(Boolean)

  return (
    contacts.find((contact) => preferredNames.includes(normalizeText(contact.nume).toLowerCase())) ||
    contacts[0] ||
    null
  )
}

function dedupeResolvedContacts(contacts: CrmClientContact[]) {
  const seenIds = new Set<string>()
  const seenSignatures = new Set<string>()

  return contacts.filter((contact) => {
    const contactId = normalizeText(contact.id)
    const signature = normalizeContactSignature({
      nume: contact.name,
      telefon: contact.phone,
      email: contact.email,
      locationName: contact.locationName,
    })

    if (contactId && seenIds.has(contactId)) {
      return false
    }
    if (signature && seenSignatures.has(signature)) {
      return false
    }

    if (contactId) seenIds.add(contactId)
    if (signature) seenSignatures.add(signature)
    return true
  })
}

export async function listResolvedCrmClientContacts(clientId: string): Promise<CrmClientContact[]> {
  if (!clientId) return []

  const legacySnap = await getDoc(doc(db, "clienti", clientId))
  if (legacySnap.exists()) {
    const legacy = legacySnap.data() as Record<string, unknown>
    const explicitPrimaryContact = deriveLegacyPrimaryClientContact(clientId, legacy)
    const inlineContacts = getInlineClientContacts(clientId, legacy)
    const preferredInlineContact = explicitPrimaryContact ? null : findPreferredClientLevelContact(inlineContacts, legacy)
    const secondaryInlineContacts = inlineContacts.filter((contact) => contact.id !== preferredInlineContact?.id)
    const locationContacts = getClientLocationContactsFromRecord(clientId, legacy)
      .filter((contact) => hasAnyContactContent(contact))
      .sort((left, right) => {
        const locationCompare = String(left.locationName || "").localeCompare(String(right.locationName || ""), "ro", {
          sensitivity: "base",
        })
        if (locationCompare !== 0) return locationCompare
        return normalizeText(left.nume).localeCompare(normalizeText(right.nume), "ro", { sensitivity: "base" })
      })

    const mergedContacts = dedupeResolvedContacts([
      ...(explicitPrimaryContact
        ? [
            mapResolvedContact(clientId, {
              ...explicitPrimaryContact,
              isPrimary: true,
              source: "legacy",
            }),
          ]
        : []),
      ...(preferredInlineContact
        ? [
            mapResolvedContact(clientId, {
              ...preferredInlineContact,
              isPrimary: true,
              source: "client",
            }),
          ]
        : []),
      ...secondaryInlineContacts
        .sort((left, right) => normalizeText(left.nume).localeCompare(normalizeText(right.nume), "ro", { sensitivity: "base" }))
        .map((contact) =>
          mapResolvedContact(clientId, {
            ...contact,
            source: "client",
          })
        ),
      ...locationContacts.map((contact) =>
        mapResolvedContact(clientId, {
          ...contact,
          source: "location",
        })
      ),
    ])

    if (mergedContacts.length > 0) {
      return mergedContacts
    }
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
