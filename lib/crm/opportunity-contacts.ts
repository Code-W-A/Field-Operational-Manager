import type { CrmClientContact, CrmOpportunity } from "@/lib/crm/types"

/**
 * All client contacts for an opportunity context: primary follows opportunity.primaryContactId
 * when present on the client list, else the client-level primary/fallback contact,
 * else the first contact with email, else the first contact.
 * Secondary = remaining contacts (same ordering as input).
 */
export function resolveClientContactsForOpportunity(
  clientContacts: CrmClientContact[],
  opportunity: Pick<CrmOpportunity, "primaryContactId"> | null
): { primary: CrmClientContact | null; secondary: CrmClientContact[] } {
  if (!clientContacts.length) {
    return { primary: null, secondary: [] }
  }

  const primary =
    (opportunity?.primaryContactId
      ? clientContacts.find((c) => c.id === opportunity.primaryContactId)
      : undefined) ||
    clientContacts.find((c) => c.isPrimary) ||
    clientContacts.find((c) => !c.locationName) ||
    clientContacts.find((c) => Boolean(c.email)) ||
    clientContacts[0] ||
    null

  const secondary = clientContacts.filter((c) => c.id !== primary?.id)
  return { primary, secondary }
}
