export interface ClientLevelContact {
  id?: string
  nume?: string
  telefon?: string
  email?: string
  functie?: string
  locationName?: string
}

function normalizeText(value: unknown) {
  return String(value || "").trim()
}

function hashSeed(seed: string) {
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  return hash.toString(36)
}

export function createStableClientContactId(clientId: string, contact: ClientLevelContact, index: number) {
  const seed = [
    clientId,
    normalizeText(contact.nume).toLowerCase(),
    normalizeText(contact.telefon).toLowerCase(),
    normalizeText(contact.email).toLowerCase(),
    normalizeText(contact.functie).toLowerCase(),
    normalizeText(contact.locationName).toLowerCase(),
    String(index),
  ].join("|")

  return `client-contact-${hashSeed(seed)}`
}

export function ensureClientContactIds<T extends ClientLevelContact>(clientId: string, contacts?: T[] | null): T[] {
  if (!Array.isArray(contacts)) return []

  return contacts.map((contact, index) => ({
    ...contact,
    id: normalizeText(contact?.id) || createStableClientContactId(clientId, contact, index),
  }))
}

export function deriveLegacyPrimaryClientContact(clientId: string, rawClient: Record<string, unknown>) {
  const nume =
    normalizeText(rawClient.reprezentantFirma) ||
    normalizeText(rawClient.persoanaContact) ||
    normalizeText(rawClient.contactPerson)
  const telefon = normalizeText(rawClient.telefon) || normalizeText(rawClient.phone)
  const email = normalizeText(rawClient.email)
  const functie = normalizeText(rawClient.functieReprezentant)

  if (!nume && !telefon && !email && !functie) {
    return null
  }

  const contact = {
    nume: nume || "Contact principal",
    telefon,
    email: email || undefined,
    functie: functie || undefined,
  }

  return {
    ...contact,
    id: createStableClientContactId(clientId, contact, 0),
  }
}

export function getClientLevelContactsFromRecord(clientId: string, rawClient: Record<string, unknown>) {
  const inlineContacts = ensureClientContactIds(
    clientId,
    Array.isArray(rawClient?.persoaneContact) ? (rawClient.persoaneContact as ClientLevelContact[]) : []
  ).filter((contact) => {
    const nume = normalizeText(contact.nume)
    const telefon = normalizeText(contact.telefon)
    const email = normalizeText(contact.email)
    const functie = normalizeText(contact.functie)
    return Boolean(nume || telefon || email || functie)
  })

  if (inlineContacts.length > 0) {
    return inlineContacts
  }

  const legacyContact = deriveLegacyPrimaryClientContact(clientId, rawClient)
  return legacyContact ? [legacyContact] : []
}

export function getClientLocationContactsFromRecord(clientId: string, rawClient: Record<string, unknown>) {
  const locatii = Array.isArray(rawClient?.locatii) ? (rawClient.locatii as Array<Record<string, unknown>>) : []

  return locatii.flatMap((locatie, locatieIndex) => {
    const locationName = normalizeText(locatie?.nume) || `Locație ${locatieIndex + 1}`
    const contacts = Array.isArray(locatie?.persoaneContact)
      ? (locatie.persoaneContact as ClientLevelContact[])
      : []

    return contacts
      .map((contact, contactIndex) => ({
        ...contact,
        locationName,
        id:
          normalizeText(contact?.id) ||
          createStableClientContactId(
            clientId,
            {
              ...contact,
              locationName,
            },
            locatieIndex * 1000 + contactIndex
          ),
      }))
      .filter((contact) => {
        const nume = normalizeText(contact.nume)
        const telefon = normalizeText(contact.telefon)
        const email = normalizeText(contact.email)
        const functie = normalizeText(contact.functie)
        return Boolean(nume || telefon || email || functie)
      })
  })
}
