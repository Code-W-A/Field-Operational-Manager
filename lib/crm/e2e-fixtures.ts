import type { CrmClient, CrmClientContact, CrmOffer, CrmOpportunity, CrmOfferSnapshot } from "@/lib/crm/types"

/**
 * Fixture CRM pentru Playwright (NEXT_PUBLIC_E2E_TEST_MODE=true).
 * `user1` este adminul mock din MockDataContext, deci trebuie să fie owner ca
 * verificările de acces din `hasOpportunityViewAccess` să treacă.
 */

export const E2E_CRM_OWNER_ID = "user1"
export const E2E_CRM_OPPORTUNITY_ID = "e2e-opp-offers"
export const E2E_CRM_CLIENT_ID = "e2e-client-1"

export const E2E_CRM_CLIENTS: CrmClient[] = [
  {
    id: E2E_CRM_CLIENT_ID,
    name: "Acme Access SRL",
    type: "Persoană juridică",
    address: "Str. Testelor 1, București",
    cui: "RO12345678",
  },
]

export const E2E_CRM_CONTACTS: CrmClientContact[] = [
  {
    id: "e2e-contact-1",
    clientId: E2E_CRM_CLIENT_ID,
    name: "Ion Popescu",
    phone: "0700000000",
    email: "ion.popescu@e2e.test",
    isPrimary: true,
    source: "crm",
  },
]

export const E2E_CRM_OPPORTUNITIES: CrmOpportunity[] = [
  {
    id: E2E_CRM_OPPORTUNITY_ID,
    number: 1,
    code: "OP.E2E.001",
    title: "Barieră acces parcare",
    displayTitle: "OP.E2E.001 — Barieră acces parcare",
    clientId: E2E_CRM_CLIENT_ID,
    primaryContactId: "e2e-contact-1",
    ownerId: E2E_CRM_OWNER_ID,
    priority: "MEDIUM",
    workStatus: "IN_PROGRESS",
    pipelineStage: "PREGATIRE_OFERTA",
    opportunityType: "OFERTE",
    createdById: E2E_CRM_OWNER_ID,
    readUserIds: [E2E_CRM_OWNER_ID],
    editUserIds: [E2E_CRM_OWNER_ID],
  },
]

export const E2E_CRM_USERS = [
  { uid: E2E_CRM_OWNER_ID, displayName: "Administrator", email: "admin@example.com", role: "admin" },
]

/** Draft cu opționale deja salvate, ca să testăm reîncărcarea în editor. */
const seededOffer: CrmOffer = {
  id: "e2e-offer-draft",
  opportunityId: E2E_CRM_OPPORTUNITY_ID,
  version: 1,
  status: "DRAFT",
  snapshot: {
    products: [
      { id: "p1", name: "Barieră automată 6m", um: "buc", quantity: 1, price: 4200, total: 4200 },
      { id: "p2", name: "Montaj", um: "buc", quantity: 2, price: 400, total: 800 },
    ],
    optionalProducts: [
      { id: "o1", name: "Iluminat LED pe braț", um: "buc", quantity: 1, price: 465, total: 465 },
      { id: "o2", name: "Buclă inductivă", um: "buc", quantity: 2, price: 320, total: 640 },
    ],
    vatPercent: 21,
    adjustmentPercent: 0,
    conditions: ["Plata: conform contract"],
    comments: "",
    subtotal: 5000,
    total: 5000,
  },
  recipientEmail: "ion.popescu@e2e.test",
  recipientName: "Ion Popescu",
  subject: "Ofertă OP.E2E.001",
  message: "Bună ziua,",
  createdById: E2E_CRM_OWNER_ID,
}

/** Ofertă veche, fără câmpul optionalProducts — trebuie să se deschidă normal. */
const legacyOffer: CrmOffer = {
  id: "e2e-offer-legacy",
  opportunityId: E2E_CRM_OPPORTUNITY_ID,
  version: 2,
  status: "DRAFT",
  snapshot: {
    products: [{ id: "p1", name: "Telecomandă", um: "buc", quantity: 4, price: 75, total: 300 }],
    vatPercent: 19,
    adjustmentPercent: 0,
    conditions: [],
    comments: "",
    subtotal: 300,
    total: 300,
  } as CrmOfferSnapshot,
  recipientEmail: "ion.popescu@e2e.test",
  recipientName: "Ion Popescu",
  subject: "Ofertă veche",
  message: "",
  createdById: E2E_CRM_OWNER_ID,
}

/**
 * Store in-memory pentru oferte: salvarea unui draft în E2E scrie aici, iar
 * reîncărcarea listei citește de aici, deci round-trip-ul e testabil fără API.
 */
let offerStore: CrmOffer[] = [seededOffer, legacyOffer]

export function listE2eCrmOffers(opportunityId: string): CrmOffer[] {
  return offerStore
    .filter((offer) => offer.opportunityId === opportunityId)
    .map((offer) => JSON.parse(JSON.stringify(offer)) as CrmOffer)
}

export function saveE2eCrmOfferDraft(input: {
  offerId?: string
  opportunityId: string
  snapshot: CrmOfferSnapshot
  recipientEmail?: string
  recipientName?: string
  subject?: string
  message?: string
}): string {
  const existingIndex = input.offerId ? offerStore.findIndex((offer) => offer.id === input.offerId) : -1
  const offerId = input.offerId || `e2e-offer-${offerStore.length + 1}`
  const nextOffer: CrmOffer = {
    id: offerId,
    opportunityId: input.opportunityId,
    version: existingIndex >= 0 ? offerStore[existingIndex].version : offerStore.length + 1,
    status: "DRAFT",
    snapshot: input.snapshot,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName,
    subject: input.subject,
    message: input.message,
    createdById: E2E_CRM_OWNER_ID,
  }

  if (existingIndex >= 0) {
    offerStore[existingIndex] = nextOffer
  } else {
    offerStore = [...offerStore, nextOffer]
  }
  return offerId
}
