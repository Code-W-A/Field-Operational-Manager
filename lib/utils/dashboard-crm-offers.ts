import { toDateSafe } from "@/lib/utils/time-format"

/** Stadiile în care oferta CRM încă ține de tablou. După ele, oportunitatea a trecut mai departe. */
const OFFER_PIPELINE_STAGES = new Set([
  "PREGATIRE_OFERTA",
  "CERERE_DE_OFERTA",
  "OFERTA_TRANSMISA",
  "NEGOCIERE_OFERTA",
  "FOLLOW_UP_OFERTA",
  "OFERTA_ACCEPTATA",
  "OFERTA_REFUZATA",
])

export type CrmDashboardOffer = {
  id?: string
  opportunityId?: string
  status?: string
  version?: number
  sentAt?: unknown
  updatedAt?: unknown
  recipientName?: string
  response?: { status?: string; at?: unknown } | null
}

export type CrmDashboardOpportunity = {
  id?: string
  code?: string
  title?: string
  clientId?: string
  pipelineStage?: string
}

export type CrmDashboardClient = {
  id?: string
  name?: string
  nume?: string
}

export type CrmOfferDashboardItem = {
  id: string
  href: string
  locatie: string
  equipmentLabel: string
  workType?: string
  offerStatus?: "accept" | "reject"
  sortDate?: Date
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function versionOf(offer: CrmDashboardOffer) {
  const version = Number(offer.version)
  return Number.isFinite(version) ? version : 0
}

function timeOf(offer: CrmDashboardOffer) {
  return toDateSafe(offer.response?.at || offer.sentAt || offer.updatedAt)?.getTime() || 0
}

function classify(offer: CrmDashboardOffer): "accept" | "reject" | "pending" | null {
  const status = text(offer.status).toUpperCase()
  const response = text(offer.response?.status).toLowerCase()
  if (status === "ACCEPTED" || response === "accept") return "accept"
  if (status === "REJECTED" || response === "reject") return "reject"
  if (status === "SENT") return "pending"
  return null
}

function clientName(clientId: string, clients: CrmDashboardClient[], legacyClients: CrmDashboardClient[]) {
  const crm = clients.find((client) => text(client.id) === clientId)
  const legacy = legacyClients.find((client) => text(client.id) === clientId)
  return text(crm?.name) || text(crm?.nume) || text(legacy?.nume) || text(legacy?.name)
}

function stillOnOfferBoard(opportunity: CrmDashboardOpportunity | undefined) {
  const stage = text(opportunity?.pipelineStage)
  if (!stage) return true
  return OFFER_PIPELINE_STAGES.has(stage)
}

/** Ultima ofertă CRM per oportunitate: acceptată, refuzată sau trimisă, cât timp oportunitatea e încă la ofertă. */
export function buildCrmOfferDashboardItems(input: {
  offers?: CrmDashboardOffer[] | null
  opportunities?: CrmDashboardOpportunity[] | null
  clients?: CrmDashboardClient[] | null
  legacyClients?: CrmDashboardClient[] | null
}): CrmOfferDashboardItem[] {
  const opportunities = new Map(
    (input.opportunities || [])
      .filter((row) => text(row.id))
      .map((row) => [text(row.id), row]),
  )
  const latest = new Map<string, CrmDashboardOffer>()
  for (const offer of input.offers || []) {
    if (!classify(offer)) continue
    const key = text(offer.opportunityId) || text(offer.id)
    if (!key) continue
    const current = latest.get(key)
    if (!current || versionOf(offer) > versionOf(current) || (versionOf(offer) === versionOf(current) && timeOf(offer) >= timeOf(current))) {
      latest.set(key, offer)
    }
  }

  const items: CrmOfferDashboardItem[] = []
  for (const offer of latest.values()) {
    const kind = classify(offer)
    if (!kind) continue
    const opportunityId = text(offer.opportunityId)
    const opportunity = opportunityId ? opportunities.get(opportunityId) : undefined
    if (!stillOnOfferBoard(opportunity)) continue
    const code = text(opportunity?.code)
    const title = text(opportunity?.title)
    const client = clientName(text(opportunity?.clientId), input.clients || [], input.legacyClients || [])
    const sortDate = toDateSafe(offer.response?.at || offer.sentAt || offer.updatedAt) || undefined
    items.push({
      id: text(offer.id) || opportunityId,
      href: opportunityId ? `/crm/opportunities/${encodeURIComponent(opportunityId)}/offers` : "/crm/opportunities",
      locatie: code || title || "Ofertă CRM",
      equipmentLabel: client || (code ? title : ""),
      ...(client && title ? { workType: title } : {}),
      ...(kind === "pending" ? {} : { offerStatus: kind }),
      sortDate,
    })
  }

  const rank = (status?: "accept" | "reject") => (status === "accept" ? 0 : status === "reject" ? 1 : 2)
  return items.sort((a, b) => {
    const byStatus = rank(a.offerStatus) - rank(b.offerStatus)
    if (byStatus !== 0) return byStatus
    return (a.sortDate?.getTime() || 0) - (b.sortDate?.getTime() || 0)
  })
}
